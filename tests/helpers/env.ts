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
export const testDir = dir;
