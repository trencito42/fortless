import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';
import { applyStaffChange, StaffChangeError } from '../src/modules/admin/staff.js';

let h: Harness;
beforeAll(async () => { h = await makeHarness(); });
afterAll(async () => { await h.close(); });

describe('NEW-376: staff membership changes share one set of guards', () => {
  it('refuses self-revocation through both POST and PATCH and leaves the owner untouched', async () => {
    const owner = h.user('usr_aaaaaaaaaaaaaaaaaaaaaaaa', { staff: 'OWNER' });
    h.stepUp(owner.id);
    const post = await h.call('POST', '/api/v1/admin/staff', owner.token, { email: 'usr_aaaaaaaaaaaaaaaaaaaaaaaa@example.test', role: 'AUDITOR', status: 'REVOKED', reason: 'regression check' });
    expect(post.statusCode).toBe(409);
    expect(post.json().code).toBe('SELF_CHANGE_BLOCKED');
    const patch = await h.call('PATCH', `/api/v1/admin/staff/${owner.id}`, owner.token, { role: 'AUDITOR', status: 'ACTIVE', reason: 'regression check' });
    expect(patch.statusCode).toBe(409);
    expect(h.db.prepare('SELECT role, status FROM staff_memberships WHERE user_id = ?').get(owner.id)).toEqual({ role: 'OWNER', status: 'ACTIVE' });
  });

  it('lets one owner demote another while two exist, and the shared function refuses to remove the final owner', async () => {
    const a = h.user('usr_bbbbbbbbbbbbbbbbbbbbbbbb', { staff: 'OWNER' });
    const b = h.user('usr_cccccccccccccccccccccccc', { staff: 'OWNER' });
    h.stepUp(a.id);
    h.db.prepare("UPDATE staff_memberships SET status = 'REVOKED' WHERE user_id = 'usr_aaaaaaaaaaaaaaaaaaaaaaaa'").run();
    const demote = await h.call('POST', '/api/v1/admin/staff', a.token, { email: 'usr_cccccccccccccccccccccccc@example.test', role: 'AUDITOR', status: 'ACTIVE', reason: 'regression check' });
    expect(demote.statusCode).toBe(201);
    expect(h.db.prepare('SELECT role FROM staff_memberships WHERE user_id = ?').get(b.id)).toEqual({ role: 'AUDITOR' });
    // a is now the only active owner: a different actor (an administrator route caller) cannot remove them
    const admin = h.user('usr_ffffffffffffffffffffffff', { staff: 'ADMINISTRATOR' });
    expect(() => applyStaffChange(h.db, { actorUserId: admin.id, targetUserId: a.id, role: 'AUDITOR', status: 'ACTIVE', reason: 'regression check', ipAddress: '127.0.0.1' })).toThrow(StaffChangeError);
    expect(h.db.prepare('SELECT role, status FROM staff_memberships WHERE user_id = ?').get(a.id)).toEqual({ role: 'OWNER', status: 'ACTIVE' });
  });
});
