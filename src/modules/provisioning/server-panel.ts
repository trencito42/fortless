import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { config } from '../../config/index.js';
import { getDatabase } from '../../database/index.js';
import { getProviderAdapter } from '../outbox/worker.js';
import type { ProviderAdapter, PterodactylHttpAdapter } from './adapter.js';
import { ConsoleAccessError, resolveOwnedService, withAccountClientKey } from './console.js';
import { allows } from './service-access.js';

interface Ctx { serviceId: string; accountId: string; userId: string; role?: string; ipAddress?: string }

const bad = (message: string, code = 'INVALID_INPUT') => new ConsoleAccessError(message, code, 400);
const UUID = /^[0-9a-f-]{36}$/i;
const ALLOC_ID = /^\d{1,10}$/;
const ENV_KEY = /^[A-Z][A-Z0-9_]{0,190}$/;
const DOCKER_IMAGE = /^[\w./:@-]{1,255}$/;
const DB_NAME = /^[A-Za-z0-9_]{1,48}$/;
const DB_REMOTE = /^[0-9A-Za-z%._-]{1,191}$/;
const CRON = /^[0-9A-Za-z*\/,?#LW-]{1,64}$/;
const POWER = new Set(['start', 'stop', 'restart', 'kill']);
const TASK_ACTIONS = new Set(['command', 'power', 'backup']);

const str = (v: unknown, max: number, field: string, allowEmpty = false): string => {
  if (typeof v !== 'string' || v.includes('\0') || v.length > max || (!allowEmpty && v.trim() === '')) throw bad(`Invalid ${field}.`);
  return v;
};

function taskBody(input: Record<string, unknown>) {
  const action = input['action'];
  if (typeof action !== 'string' || !TASK_ACTIONS.has(action)) throw bad('Choose an action.');
  const payload = action === 'backup' ? str(input['payload'] ?? '', 4096, 'ignored files', true) : str(input['payload'], 1000, 'payload');
  if (action === 'power' && !POWER.has(payload)) throw bad('Choose a power action.');
  const offset = Number(input['offset'] ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 900) throw bad('Delay must be between 0 and 900 seconds.');
  return { action, payload, time_offset: offset, continue_on_failure: input['continueOnFailure'] === true };
}

const cron = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || !CRON.test(v)) throw bad(`Invalid ${field}.`);
  return v;
};

export function createServerPanelApi(deps: { adapter?: ProviderAdapter; db?: Database.Database; secret?: string } = {}) {
  const db = () => deps.db ?? getDatabase();
  const secret = () => deps.secret ?? config.PTERODACTYL_KEYMINT_SECRET;

  const audit = (ctx: Ctx, action: string, metadata: Record<string, unknown>) => {
    db().prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, 'USER', ?, 'service', ?, ?, ?, ?)
    `).run(`aud_${crypto.randomUUID()}`, ctx.accountId, ctx.userId, action, ctx.serviceId, ctx.ipAddress || '127.0.0.1', `corr_${crypto.randomUUID()}`, JSON.stringify(metadata));
  };

  const call = async (ctx: Ctx, need: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', sub: string, body?: unknown): Promise<any> => {
    const { service, adapter } = resolveOwnedService(ctx, deps.adapter ?? getProviderAdapter(), db(), secret(), need);
    return withAccountClientKey(ctx.accountId, adapter as PterodactylHttpAdapter, db(), secret(),
      (key) => adapter.clientServerCall(service.external_id, key, method, sub, body));
  };

  return {
    // ----- Backups -----
    async backups(ctx: Ctx) {
      const res = await call(ctx, 'backup.read', 'GET', '/backups');
      return {
        backups: (res?.data ?? []).map((b: any) => ({
          uuid: String(b.attributes.uuid), name: String(b.attributes.name), bytes: Number(b.attributes.bytes ?? 0),
          createdAt: String(b.attributes.created_at ?? ''), completedAt: b.attributes.completed_at ? String(b.attributes.completed_at) : null,
          successful: b.attributes.is_successful !== false, locked: Boolean(b.attributes.is_locked),
        })),
        limit: res?.meta?.backup_count ?? null,
      };
    },
    async createBackup(ctx: Ctx, input: { name?: unknown; ignored?: unknown; locked?: unknown }) {
      const body: Record<string, unknown> = {};
      if (input.name !== undefined && input.name !== '') body['name'] = str(input.name, 191, 'name');
      if (input.ignored !== undefined && input.ignored !== '') body['ignored'] = str(input.ignored, 4096, 'ignored files');
      if (input.locked === true) body['is_locked'] = true;
      await call(ctx, 'backup.create', 'POST', '/backups', body);
      audit(ctx, 'service.backup.create', { name: body['name'] ?? null });
    },
    async deleteBackup(ctx: Ctx, uuid: string) {
      if (!UUID.test(uuid)) throw bad('Invalid backup.');
      await call(ctx, 'backup.delete', 'DELETE', `/backups/${uuid}`);
      audit(ctx, 'service.backup.delete', { uuid });
    },
    async lockBackup(ctx: Ctx, uuid: string) {
      if (!UUID.test(uuid)) throw bad('Invalid backup.');
      await call(ctx, 'backup.delete', 'POST', `/backups/${uuid}/lock`);
      audit(ctx, 'service.backup.lock', { uuid });
    },
    async restoreBackup(ctx: Ctx, uuid: string, truncate: unknown) {
      if (!UUID.test(uuid)) throw bad('Invalid backup.');
      await call(ctx, 'backup.restore', 'POST', `/backups/${uuid}/restore`, { truncate: truncate === true });
      audit(ctx, 'service.backup.restore', { uuid, truncate: truncate === true });
    },
    async backupDownloadUrl(ctx: Ctx, uuid: string): Promise<string> {
      if (!UUID.test(uuid)) throw bad('Invalid backup.');
      const res = await call(ctx, 'backup.download', 'GET', `/backups/${uuid}/download`);
      const url = res?.attributes?.url;
      if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new ConsoleAccessError('Backup download is unavailable.', 'PROVIDER_ERROR', 502);
      audit(ctx, 'service.backup.download_url', { uuid });
      return url;
    },

    // ----- Network -----
    async network(ctx: Ctx) {
      const res = await call(ctx, 'allocation.read', 'GET', '/network/allocations');
      return {
        allocations: (res?.data ?? []).map((a: any) => ({
          id: Number(a.attributes.id), ip: String(a.attributes.ip), alias: a.attributes.ip_alias ? String(a.attributes.ip_alias) : null,
          port: Number(a.attributes.port), notes: a.attributes.notes ? String(a.attributes.notes) : '', primary: Boolean(a.attributes.is_default),
        })),
      };
    },
    async assignAllocation(ctx: Ctx) {
      await call(ctx, 'allocation.create', 'POST', '/network/allocations');
      audit(ctx, 'service.network.assign', {});
    },
    async setAllocationNotes(ctx: Ctx, id: string, notes: unknown) {
      if (!ALLOC_ID.test(id)) throw bad('Invalid allocation.');
      await call(ctx, 'allocation.update', 'POST', `/network/allocations/${id}`, { notes: str(notes, 191, 'notes', true) });
      audit(ctx, 'service.network.notes', { allocationId: Number(id) });
    },
    async setPrimaryAllocation(ctx: Ctx, id: string) {
      if (!ALLOC_ID.test(id)) throw bad('Invalid allocation.');
      await call(ctx, 'allocation.update', 'POST', `/network/allocations/${id}/primary`);
      audit(ctx, 'service.network.primary', { allocationId: Number(id) });
    },
    async removeAllocation(ctx: Ctx, id: string) {
      if (!ALLOC_ID.test(id)) throw bad('Invalid allocation.');
      await call(ctx, 'allocation.delete', 'DELETE', `/network/allocations/${id}`);
      audit(ctx, 'service.network.remove', { allocationId: Number(id) });
    },

    // ----- Startup -----
    async startup(ctx: Ctx) {
      const res = await call(ctx, 'startup.read', 'GET', '/startup');
      return {
        command: String(res?.meta?.startup_command ?? ''),
        images: (res?.meta?.docker_images ?? {}) as Record<string, string>,
        variables: (res?.data ?? []).map((v: any) => ({
          key: String(v.attributes.env_variable), name: String(v.attributes.name), description: String(v.attributes.description ?? ''),
          value: String(v.attributes.server_value ?? v.attributes.default_value ?? ''), editable: Boolean(v.attributes.is_editable), rules: String(v.attributes.rules ?? ''),
        })),
      };
    },
    async setVariable(ctx: Ctx, key: unknown, value: unknown) {
      if (typeof key !== 'string' || !ENV_KEY.test(key)) throw bad('Invalid variable.');
      await call(ctx, 'startup.update', 'PUT', '/startup/variable', { key, value: str(value, 4096, 'value', true) });
      audit(ctx, 'service.startup.variable', { key });
    },
    async setImage(ctx: Ctx, image: unknown) {
      if (typeof image !== 'string' || !DOCKER_IMAGE.test(image)) throw bad('Invalid image.');
      await call(ctx, 'startup.docker-image', 'PUT', '/settings/docker-image', { docker_image: image });
      audit(ctx, 'service.startup.image', { image });
    },

    // ----- Databases -----
    async databases(ctx: Ctx) {
      const { access } = resolveOwnedService(ctx, deps.adapter ?? getProviderAdapter(), db(), secret(), 'database.read');
      const canViewPassword = allows(access, 'database.view_password');
      const endpoint = canViewPassword ? '/databases?include=password' : '/databases';
      const res = await call(ctx, 'database.read', 'GET', endpoint);
      return {
        databases: (res?.data ?? []).map((d: any) => ({
          id: String(d.attributes.id), name: String(d.attributes.name), username: String(d.attributes.username),
          host: `${d.attributes.host?.address ?? ''}:${d.attributes.host?.port ?? ''}`, connectionsFrom: String(d.attributes.connections_from ?? '%'),
          password: canViewPassword
            ? (d.attributes.relationships?.password?.attributes?.password ?? d.relationships?.password?.attributes?.password ?? null)
            : null,
        })),
      };
    },
    async createDatabase(ctx: Ctx, input: { name?: unknown; remote?: unknown }) {
      if (typeof input.name !== 'string' || !DB_NAME.test(input.name)) throw bad('Database name can use letters, numbers and underscores (up to 48).');
      const remote = input.remote === undefined || input.remote === '' ? '%' : input.remote;
      if (typeof remote !== 'string' || !DB_REMOTE.test(remote)) throw bad('Invalid connections-from value.');
      await call(ctx, 'database.create', 'POST', '/databases', { database: input.name, remote });
      audit(ctx, 'service.database.create', { name: input.name });
    },
    async rotateDatabasePassword(ctx: Ctx, id: string) {
      if (!ALLOC_ID.test(id)) throw bad('Invalid database.');
      const res = await call(ctx, 'database.update', 'POST', `/databases/${id}/rotate-password`);
      audit(ctx, 'service.database.rotate', { databaseId: Number(id) });
      return { password: res?.attributes?.relationships?.password?.attributes?.password ?? res?.relationships?.password?.attributes?.password ?? null };
    },
    async deleteDatabase(ctx: Ctx, id: string) {
      if (!ALLOC_ID.test(id)) throw bad('Invalid database.');
      await call(ctx, 'database.delete', 'DELETE', `/databases/${id}`);
      audit(ctx, 'service.database.delete', { databaseId: Number(id) });
    },

    // ----- Schedules -----
    async schedules(ctx: Ctx) {
      const res = await call(ctx, 'schedule.read', 'GET', '/schedules?include=tasks');
      return {
        schedules: (res?.data ?? []).map((sc: any) => ({
          id: Number(sc.attributes.id), name: String(sc.attributes.name), cron: {
            minute: String(sc.attributes.cron?.minute ?? '*'), hour: String(sc.attributes.cron?.hour ?? '*'), dayOfMonth: String(sc.attributes.cron?.day_of_month ?? '*'),
            month: String(sc.attributes.cron?.month ?? '*'), dayOfWeek: String(sc.attributes.cron?.day_of_week ?? '*'),
          },
          active: Boolean(sc.attributes.is_active), processing: Boolean(sc.attributes.is_processing), onlyWhenOnline: Boolean(sc.attributes.only_when_online),
          lastRunAt: sc.attributes.last_run_at ? String(sc.attributes.last_run_at) : null, nextRunAt: sc.attributes.next_run_at ? String(sc.attributes.next_run_at) : null,
          tasks: (sc.attributes.relationships?.tasks?.data ?? []).map((t: any) => ({
            id: Number(t.attributes.id), sequence: Number(t.attributes.sequence_id), action: String(t.attributes.action), payload: String(t.attributes.payload ?? ''),
            offset: Number(t.attributes.time_offset ?? 0), continueOnFailure: Boolean(t.attributes.continue_on_failure),
          })),
        })),
      };
    },
    async saveSchedule(ctx: Ctx, id: string | null, input: Record<string, unknown>) {
      if (id !== null && !ALLOC_ID.test(id)) throw bad('Invalid schedule.');
      const body = {
        name: str(input['name'], 191, 'name'),
        minute: cron(input['minute'], 'minute'), hour: cron(input['hour'], 'hour'), day_of_month: cron(input['dayOfMonth'], 'day of month'),
        month: cron(input['month'], 'month'), day_of_week: cron(input['dayOfWeek'], 'day of week'),
        is_active: input['active'] !== false, only_when_online: input['onlyWhenOnline'] === true,
      };
      await call(ctx, id === null ? 'schedule.create' : 'schedule.update', 'POST', id === null ? '/schedules' : `/schedules/${id}`, body);
      audit(ctx, id === null ? 'service.schedule.create' : 'service.schedule.update', { name: body.name });
    },
    async deleteSchedule(ctx: Ctx, id: string) {
      if (!ALLOC_ID.test(id)) throw bad('Invalid schedule.');
      await call(ctx, 'schedule.delete', 'DELETE', `/schedules/${id}`);
      audit(ctx, 'service.schedule.delete', { scheduleId: Number(id) });
    },
    async executeSchedule(ctx: Ctx, id: string) {
      if (!ALLOC_ID.test(id)) throw bad('Invalid schedule.');
      await call(ctx, 'schedule.update', 'POST', `/schedules/${id}/execute`);
      audit(ctx, 'service.schedule.execute', { scheduleId: Number(id) });
    },
    async addTask(ctx: Ctx, id: string, input: Record<string, unknown>) {
      if (!ALLOC_ID.test(id)) throw bad('Invalid schedule.');
      const body = taskBody(input);
      await call(ctx, 'schedule.update', 'POST', `/schedules/${id}/tasks`, body);
      audit(ctx, 'service.schedule.task_add', { scheduleId: Number(id), action: body.action });
    },
    async updateTask(ctx: Ctx, id: string, taskId: string, input: Record<string, unknown>) {
      if (!ALLOC_ID.test(id) || !ALLOC_ID.test(taskId)) throw bad('Invalid task.');
      const body = taskBody(input);
      await call(ctx, 'schedule.update', 'POST', `/schedules/${id}/tasks/${taskId}`, body);
      audit(ctx, 'service.schedule.task_update', { scheduleId: Number(id), taskId: Number(taskId), action: body.action });
    },
    async deleteTask(ctx: Ctx, id: string, taskId: string) {
      if (!ALLOC_ID.test(id) || !ALLOC_ID.test(taskId)) throw bad('Invalid task.');
      await call(ctx, 'schedule.update', 'DELETE', `/schedules/${id}/tasks/${taskId}`);
      audit(ctx, 'service.schedule.task_delete', { scheduleId: Number(id), taskId: Number(taskId) });
    },

    // ----- Events recorded by the panel itself (SFTP, panel UI, API) -----
    async panelActivity(ctx: Ctx, page: unknown) {
      const n = Math.min(Math.max(1, Math.floor(Number(page)) || 1), 99999);
      const res = await call(ctx, 'activity.read', 'GET', `/activity?page=${n}`);
      const p = res?.meta?.pagination ?? {};
      return {
        events: (res?.data ?? []).map((e: any) => ({
          event: String(e.attributes.event), timestamp: String(e.attributes.timestamp ?? ''), api: Boolean(e.attributes.is_api),
          actor: e.attributes.relationships?.actor?.attributes?.username ? String(e.attributes.relationships.actor.attributes.username) : null,
        })),
        page: Number(p.current_page ?? n), pages: Number(p.total_pages ?? 1), total: Number(p.total ?? 0),
      };
    },

    // ----- Settings -----
    async settings(ctx: Ctx) {
      const { service, adapter } = resolveOwnedService(ctx, deps.adapter ?? getProviderAdapter(), db(), secret(), 'startup.read');
      const link = db().prepare("SELECT panel_username FROM panel_users WHERE account_id = ? AND provider_type = 'PTERODACTYL'").get(ctx.accountId) as { panel_username: string } | undefined;
      const res = await withAccountClientKey(ctx.accountId, adapter, db(), secret(), (key) => adapter.clientServerCall(service.external_id, key, 'GET', ''));
      const a = res?.attributes ?? {};
      return {
        name: String(a.name ?? ''), description: String(a.description ?? ''), identifier: String(a.identifier ?? ''), uuid: String(a.uuid ?? ''), node: String(a.node ?? ''), image: String(a.docker_image ?? ''),
        sftp: { host: String(a.sftp_details?.ip ?? ''), port: Number(a.sftp_details?.port ?? 0), username: link ? `${link.panel_username}.${a.identifier}` : null },
      };
    },
    async rename(ctx: Ctx, name: unknown, description: unknown) {
      await call(ctx, 'settings.rename', 'POST', '/settings/rename', { name: str(name, 191, 'name'), description: str(description ?? '', 191, 'description', true) });
      audit(ctx, 'service.settings.rename', {});
    },
    async reinstall(ctx: Ctx) {
      await call(ctx, 'settings.reinstall', 'POST', '/settings/reinstall');
      db().prepare(`
        INSERT INTO service_observed_states (service_id, runtime_state, last_checked_at, raw_metrics)
        VALUES (?, 'INSTALLING', datetime('now', 'utc'), '{"reason":"REINSTALL_REQUESTED"}')
        ON CONFLICT(service_id) DO UPDATE SET
          runtime_state = 'INSTALLING',
          last_checked_at = datetime('now', 'utc'),
          raw_metrics = '{"reason":"REINSTALL_REQUESTED"}'
      `).run(ctx.serviceId);
      audit(ctx, 'service.settings.reinstall', {});
    },
  };
}
