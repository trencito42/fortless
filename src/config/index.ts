import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const nodeEnvironment = process.env['NODE_ENV'] || 'development';

function persistentDevelopmentSecret(): string {
  const secretPath = process.env['FORTLESS_DEV_SECRET_FILE'] || path.resolve(process.cwd(), 'data/.development-session-secret');
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
    throw new Error(`Development secret at ${secretPath} is too short.`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  const generated = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(secretPath, `${generated}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return generated;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3021),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.string().url().default('https://fortless.net'),
  ALLOWED_ORIGINS: z.string().default('https://fortless.net,http://localhost:3021'),
  DATABASE_PATH: z.string().default('./data/fortless.db'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  SESSION_SECRET: z.string().min(32),
  PAYMENTS_MODE: z.enum(['disabled', 'stripe_test', 'stripe_live']).default('disabled'),
  PROVIDER_MODE: z.enum(['disabled', 'pterodactyl_1']).default('disabled'),
  EMAIL_MODE: z.enum(['disabled', 'sandbox', 'live']).default('disabled'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  PTERODACTYL_PANEL_URL: z.string().default(''),
  PTERODACTYL_API_KEY: z.string().default(''),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse({
  NODE_ENV: process.env['NODE_ENV'],
  PORT: process.env['PORT'] ? Number(process.env['PORT']) : 3021,
  HOST: process.env['HOST'] || '127.0.0.1',
  APP_ORIGIN: process.env['APP_ORIGIN'] || 'https://fortless.net',
  ALLOWED_ORIGINS: process.env['ALLOWED_ORIGINS'] || 'https://fortless.net,http://localhost:3021',
  DATABASE_PATH: process.env['DATABASE_PATH'] || './data/fortless.db',
  REDIS_URL: process.env['REDIS_URL'] || 'redis://127.0.0.1:6379',
  SESSION_SECRET: process.env['SESSION_SECRET'] || (nodeEnvironment === 'production' ? '' : persistentDevelopmentSecret()),
  PAYMENTS_MODE: process.env['PAYMENTS_MODE'] || 'disabled',
  PROVIDER_MODE: process.env['PROVIDER_MODE'] || 'disabled',
  EMAIL_MODE: process.env['EMAIL_MODE'] || 'disabled',
  STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] || '',
  STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] || '',
  PTERODACTYL_PANEL_URL: process.env['PTERODACTYL_PANEL_URL'] || '',
  PTERODACTYL_API_KEY: process.env['PTERODACTYL_API_KEY'] || '',
});
