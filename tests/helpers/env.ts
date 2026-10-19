// Must be the first import of a test file that builds the HTTP server: it points the app at a throw-away database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortless-test-'));
process.env['DATABASE_PATH'] = path.join(dir, 'test.db');
process.env['SESSION_SECRET'] = 'test-session-secret-0123456789abcdef0123456789abcd';
process.env['FORTLESS_DEV_SECRET_FILE'] = path.join(dir, 'dev-secret');
process.env['NODE_ENV'] = 'test';
process.env['EMAIL_MODE'] = 'sandbox';
process.env['PAYMENTS_MODE'] = 'disabled';
process.env['STRIPE_SECRET_KEY'] = '';
process.env['STRIPE_WEBHOOK_SECRET'] = '';
process.env['PROVIDER_MODE'] = 'disabled';
process.env['PROVIDER_VERIFICATION_TIER'] = 'NOT_STARTED';
process.env['PTERODACTYL_PANEL_URL'] = '';
process.env['PTERODACTYL_API_KEY'] = '';
process.env['PTERODACTYL_CLIENT_API_KEY'] = '';
process.env['PTERODACTYL_KEYMINT_SECRET'] = '';
export const testDir = dir;
