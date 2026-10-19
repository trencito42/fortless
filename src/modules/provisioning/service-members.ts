import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { config } from '../../config/index.js';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { queueEmail } from '../email/outbox.js';
import { generateId } from '../identity/auth.js';
import { getProviderAdapter } from '../outbox/worker.js';
import { PterodactylHttpAdapter, ProviderError, type ProviderAdapter } from './adapter.js';
import { withAccountClientKey } from './console.js';
import { resolvePanelUserId } from './panel-link.js';
import { PERMISSION_PRESETS, getServiceAccess, isPreset, type Preset } from './service-access.js';

export class SharingError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode: number) {
    super(message);
    this.name = 'SharingError';
  }
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING = 20;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const digest = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const PRESET_LABEL: Record<Preset, string> = { viewer: 'view-only', operator: 'operator', admin: 'full' };

interface Actor { serviceId: string; accountId: string; userId: string; role?: string; ipAddress?: string }
export interface SharingDeps { adapter?: ProviderAdapter; db?: Database.Database; secret?: string; baseUrl?: string }

const audit = (db: Database.Database, accountId: string, userId: string | null, action: string, serviceId: string, ip: string | undefined, metadata: Record<string, unknown>) =>
  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
    VALUES (?, ?, ?, 'USER', ?, 'service', ?, ?, ?, ?)
  `).run(generateId('aud'), accountId, userId, action, serviceId, ip || '127.0.0.1', generateId('cor'), JSON.stringify(metadata));

/** Only the account that owns the service, and only its OWNER or TECH_ADMIN, can manage who it is shared with. */
function requireOwner(db: Database.Database, a: Actor) {
  const access = getServiceAccess(db, a);
  if (!access) throw new SharingError('Service not found', 'NOT_FOUND', 404);
  if (access.kind !== 'ACCOUNT' || access.permissions !== 'ALL') throw new SharingError('Only the owner can manage access to this service.', 'FORBIDDEN', 403);
  return access.service;
}

export function createServiceSharing(deps: SharingDeps = {}) {
  const db = () => deps.db ?? getDatabase();
  const secret = () => deps.secret ?? config.PTERODACTYL_KEYMINT_SECRET;
  const adapter = () => deps.adapter ?? getProviderAdapter();
  const baseUrl = () => deps.baseUrl ?? config.APP_ORIGIN;

  function ptero(): PterodactylHttpAdapter {
    const a = adapter();
    if (!(a instanceof PterodactylHttpAdapter) || !secret()) {
      throw new SharingError('Sharing is not available for this provider.', 'SHARING_UNAVAILABLE', 503);
    }
    return a;
  }

  /** Runs a panel call on the owner's behalf using the owner account's own key. */
  const asOwner = <T>(ownerAccountId: string, fn: (a: PterodactylHttpAdapter, key: string) => Promise<T>): Promise<T> => {
    const a = ptero();
    return withAccountClientKey(ownerAccountId, a, db(), secret(), (key) => fn(a, key));
  };

  return {
    list(actor: Actor) {
      const service = requireOwner(db(), actor);
      const members = db().prepare(`
        SELECT m.id, m.preset, m.created_at AS createdAt, u.name, u.email
        FROM service_members m JOIN users u ON u.id = m.user_id WHERE m.service_id = ? ORDER BY m.created_at
      `).all(service.id);
      const invitations = db().prepare(`
        SELECT id, email, preset, expires_at AS expiresAt, created_at AS createdAt FROM service_invitations
        WHERE service_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now', 'utc') ORDER BY created_at DESC
      `).all(service.id);
      return { members, invitations };
    },

    invite(actor: Actor, input: { email: unknown; preset: unknown }): { invitationId: string } {
      const service = requireOwner(db(), actor);
      ptero(); // fail early when sharing cannot work at all, never queue an invitation we cannot honour
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (!EMAIL.test(email)) throw new SharingError('Enter a valid email address.', 'INVALID_EMAIL', 400);
      if (!isPreset(input.preset)) throw new SharingError('Choose an access level.', 'INVALID_PRESET', 400);
      const preset = input.preset;

      const inviter = db().prepare(`SELECT u.name, u.email, s.identifier, COALESCE(pv.name, 'a server') AS plan FROM users u, services s LEFT JOIN order_items oi ON oi.id = s.order_item_id LEFT JOIN plan_versions pv ON pv.id = oi.plan_version_id WHERE u.id = ? AND s.id = ?`)
        .get(actor.userId, service.id) as { name: string; email: string; identifier: string | null; plan: string } | undefined;
      if (!inviter) throw new SharingError('Service not found', 'NOT_FOUND', 404);
      if (inviter.email.toLowerCase() === email) throw new SharingError('You already have full access to this service.', 'SELF_INVITE', 400);
      const isTeam = db().prepare('SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? AND lower(u.email) = ?').get(service.account_id, email);
      if (isTeam) throw new SharingError('This person is already on your team. Team roles control their access.', 'ALREADY_TEAM', 409);
      const alreadyShared = db().prepare('SELECT 1 FROM service_members m JOIN users u ON u.id = m.user_id WHERE m.service_id = ? AND lower(u.email) = ?').get(service.id, email);
      if (alreadyShared) throw new SharingError('This person already has access.', 'ALREADY_MEMBER', 409);
      const pending = db().prepare("SELECT COUNT(*) c FROM service_invitations WHERE service_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now','utc')").get(service.id) as { c: number };
      if (pending.c >= MAX_PENDING) throw new SharingError('Too many pending invitations. Revoke some first.', 'TOO_MANY_PENDING', 429);

      const raw = crypto.randomBytes(32).toString('base64url');
      const id = generateId('sinv');
      return runInTransaction((trx) => {
        trx.prepare("UPDATE service_invitations SET revoked_at = datetime('now','utc') WHERE service_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL").run(service.id, email);
        trx.prepare('INSERT INTO service_invitations (id, service_id, email, preset, token_hash, invited_by_user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, service.id, email, preset, digest(raw), actor.userId, new Date(Date.now() + TTL_MS).toISOString());
        queueEmail(trx, {
          recipient: email,
          template: 'service_invitation',
          payload: { inviteUrl: `${baseUrl()}/invite/service/${raw}`, serviceName: inviter.plan, inviterName: inviter.name, access: PRESET_LABEL[preset] },
        });
        audit(trx, service.account_id, actor.userId, 'service.member.invited', service.id, actor.ipAddress, { email, preset });
        return { invitationId: id };
      }, db());
    },

    revokeInvitation(actor: Actor, invitationId: string) {
      const service = requireOwner(db(), actor);
      const r = db().prepare("UPDATE service_invitations SET revoked_at = datetime('now','utc') WHERE id = ? AND service_id = ? AND accepted_at IS NULL AND revoked_at IS NULL").run(invitationId, service.id);
      if (!r.changes) throw new SharingError('Invitation not found', 'NOT_FOUND', 404);
      audit(db(), service.account_id, actor.userId, 'service.member.invitation_revoked', service.id, actor.ipAddress, {});
    },

    /** Public preview used by the invite link: reveals nothing beyond what the emailed recipient already knows. */
    peek(rawToken: string): { email: string; serviceId: string; userExists: boolean } | null {
      const row = db().prepare("SELECT email, service_id FROM service_invitations WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now','utc')")
        .get(digest(rawToken)) as { email: string; service_id: string } | undefined;
      if (!row) return null;
      const exists = Boolean(db().prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(row.email));
      return { email: row.email, serviceId: row.service_id, userExists: exists };
    },

    async accept(rawToken: string, viewer: { userId: string; accountId: string; ipAddress?: string }): Promise<{ serviceId: string }> {
      const inv = db().prepare(`SELECT id, service_id, email, preset FROM service_invitations
        WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now','utc')`).get(digest(rawToken)) as
        { id: string; service_id: string; email: string; preset: Preset } | undefined;
      if (!inv) throw new SharingError('This invitation is invalid or has expired.', 'INVALID_INVITATION', 400);
      const user = db().prepare('SELECT email, status FROM users WHERE id = ?').get(viewer.userId) as { email: string; status: string } | undefined;
      if (!user || user.status !== 'ACTIVE') throw new SharingError('Verify your email address first, then open the invitation again.', 'NOT_ACTIVE', 403);
      if (user.email.toLowerCase() !== inv.email) throw new SharingError(`This invitation was sent to ${inv.email}. Sign in with that account.`, 'WRONG_ACCOUNT', 403);

      const service = db().prepare('SELECT id, account_id, external_id, contract_status FROM services WHERE id = ?').get(inv.service_id) as
        { id: string; account_id: string; external_id: string | null; contract_status: string } | undefined;
      if (!service || service.contract_status !== 'ACTIVE' || !service.external_id) throw new SharingError('This server is not available.', 'SERVICE_UNAVAILABLE', 409);
      if (service.account_id === viewer.accountId) throw new SharingError('You already own this service.', 'SELF_INVITE', 400);

      const a = ptero();
      // The invitee needs their own panel user (created by Fortless, so SSO works) before they can be attached to the server.
      await resolvePanelUserId(viewer.accountId, a, db());
      const panel = db().prepare("SELECT panel_email FROM panel_users WHERE account_id = ? AND provider_type = 'PTERODACTYL'").get(viewer.accountId) as { panel_email: string } | undefined;
      if (!panel) throw new SharingError('Could not prepare your hosting panel account.', 'PANEL_USER_MISSING', 502);

      const permissions = [...PERMISSION_PRESETS[inv.preset]];
      const externalId = service.external_id;
      let uuid: string | null = null;
      try {
        // NEW-393: an earlier attempt may have created the sub-user before the local row was written (timeout, crash).
        //          Adopt it instead of creating it again, and bring its permissions in line with the invitation.
        const existing = await asOwner(service.account_id, (ad, key) => ad.clientServerCall(externalId, key, 'GET', '/users'));
        const found = ((existing?.data ?? []) as any[]).find((u) => String(u?.attributes?.email ?? '').toLowerCase() === panel.panel_email.toLowerCase());
        if (found?.attributes?.uuid) {
          uuid = String(found.attributes.uuid);
          const subuser = uuid;
          await asOwner(service.account_id, (ad, key) => ad.clientServerCall(externalId, key, 'POST', `/users/${subuser}`, { permissions }));
        } else {
          const res = await asOwner(service.account_id, (ad, key) => ad.clientServerCall(externalId, key, 'POST', '/users', { email: panel.panel_email, permissions }));
          uuid = res?.attributes?.uuid ? String(res.attributes.uuid) : null;
        }
      } catch (err) {
        if (!(err instanceof ProviderError) || err.detail === undefined) throw err;
        throw new SharingError(err.detail, 'PANEL_REFUSED', 409);
      }

      return runInTransaction((trx) => {
        trx.prepare('INSERT INTO service_members (id, service_id, user_id, preset, panel_subuser_uuid, invited_by_user_id) VALUES (?, ?, ?, ?, ?, (SELECT invited_by_user_id FROM service_invitations WHERE id = ?)) ON CONFLICT(service_id, user_id) DO UPDATE SET preset = excluded.preset, panel_subuser_uuid = COALESCE(excluded.panel_subuser_uuid, service_members.panel_subuser_uuid)')
          .run(generateId('smem'), service.id, viewer.userId, inv.preset, uuid, inv.id);
        trx.prepare("UPDATE service_invitations SET accepted_at = datetime('now','utc') WHERE id = ?").run(inv.id);
        audit(trx, service.account_id, viewer.userId, 'service.member.joined', service.id, viewer.ipAddress, { preset: inv.preset });
        return { serviceId: service.id };
      }, db());
    },

    async remove(actor: Actor, memberId: string) {
      const service = requireOwner(db(), actor);
      const m = db().prepare('SELECT id, user_id, panel_subuser_uuid FROM service_members WHERE id = ? AND service_id = ?').get(memberId, service.id) as { id: string; user_id: string; panel_subuser_uuid: string | null } | undefined;
      if (!m) throw new SharingError('Member not found', 'NOT_FOUND', 404);
      if (m.panel_subuser_uuid && service.external_id) {
        const externalId = service.external_id;
        const uuid = m.panel_subuser_uuid;
        try { await asOwner(service.account_id, (ad, key) => ad.clientServerCall(externalId, key, 'DELETE', `/users/${uuid}`)); }
        catch (err) { if (!(err instanceof ProviderError && err.statusCode === 404)) throw err; }
      }
      db().prepare('DELETE FROM service_members WHERE id = ?').run(m.id);
      audit(db(), service.account_id, actor.userId, 'service.member.removed', service.id, actor.ipAddress, { userId: m.user_id });
    },

    async setPreset(actor: Actor, memberId: string, preset: unknown) {
      const service = requireOwner(db(), actor);
      if (!isPreset(preset)) throw new SharingError('Choose an access level.', 'INVALID_PRESET', 400);
      const m = db().prepare('SELECT id, panel_subuser_uuid FROM service_members WHERE id = ? AND service_id = ?').get(memberId, service.id) as { id: string; panel_subuser_uuid: string | null } | undefined;
      if (!m) throw new SharingError('Member not found', 'NOT_FOUND', 404);
      if (m.panel_subuser_uuid && service.external_id) {
        const externalId = service.external_id;
        const uuid = m.panel_subuser_uuid;
        await asOwner(service.account_id, (ad, key) => ad.clientServerCall(externalId, key, 'POST', `/users/${uuid}`, { permissions: [...PERMISSION_PRESETS[preset]] }));
      }
      db().prepare('UPDATE service_members SET preset = ? WHERE id = ?').run(preset, m.id);
      audit(db(), service.account_id, actor.userId, 'service.member.preset_changed', service.id, actor.ipAddress, { preset });
    },
  };
}
