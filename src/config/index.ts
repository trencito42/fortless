import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

try {
  process.loadEnvFile?.();
} catch {
  // .env file is optional in containerized environments with pre-injected env
}

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
  CHECKOUT_ALLOWED_ORIGINS: z.string().default('https://checkout.stripe.com'),
  PAYMENTS_VERIFICATION_TIER: z.string().default('NOT_STARTED'),
  EMAIL_VERIFICATION_TIER: z.string().default('NOT_STARTED'),
  AI_BASE_URL: z.string().default(''),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default(''),
  BACKUP_INTERVAL_HOURS: z.coerce.number().min(0).default(24),
  BACKUP_RETENTION_COUNT: z.coerce.number().int().min(1).default(14),
  BACKUP_COPY_DIR: z.string().default(''),
  FORTLESS_BACKUP_KEY: z.string().default(''),
  DATABASE_PATH: z.string().default('./data/fortless.db'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  SESSION_SECRET: z.string().min(32),
  PAYMENTS_MODE: z.enum(['disabled', 'stripe_test', 'stripe_live']).default('disabled'),
  PROVIDER_MODE: z.enum(['disabled', 'pterodactyl_1']).default('disabled'),
  PROVIDER_VERIFICATION_TIER: z.enum(['NOT_STARTED', 'MOCK_ONLY', 'SANDBOX_VERIFIED', 'PRODUCTION_VERIFIED']).default('NOT_STARTED'),
  EMAIL_MODE: z.enum(['disabled', 'sandbox', 'live']).default('disabled'),
  SMTP_HOST: z.string().default('mail.xodo.ro'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.boolean().default(false),
  SMTP_USER: z.string().default('hello@fortless.net'),
  SMTP_PASSWORD: z.string().default(''),
  EMAIL_FROM: z.string().default('Fortless <hello@fortless.net>'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  PTERODACTYL_PANEL_URL: z.string().default(''),
  PTERODACTYL_API_KEY: z.string().default(''),
  PTERODACTYL_CLIENT_API_KEY: z.string().default(''),
  PTERODACTYL_SSO_LOGIN_URL: z.string().default(''),
  PTERODACTYL_KEYMINT_SECRET: z.string().default(''),
  MODRINTH_API_URL: z.string().url().default('https://api.modrinth.com/v2'),
  MODRINTH_USER_AGENT: z.string().default(''),
  OIDC_PANEL_CLIENT_ID: z.string().default('fortless-panel'),
  OIDC_PANEL_CLIENT_SECRET: z.string().default(''),
  OIDC_PANEL_REDIRECT_URIS: z.string().default(''),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse({
  NODE_ENV: process.env['NODE_ENV'],
  PORT: process.env['PORT'] ? Number(process.env['PORT']) : 3021,
  HOST: process.env['HOST'] || '127.0.0.1',
  APP_ORIGIN: process.env['APP_ORIGIN'] || 'https://fortless.net',
  // NEW-394: loopback origins are a development convenience only; production defaults to the public origin.
  ALLOWED_ORIGINS: process.env['ALLOWED_ORIGINS'] || (nodeEnvironment === 'production' ? 'https://fortless.net' : 'https://fortless.net,http://localhost:3021'),
  CHECKOUT_ALLOWED_ORIGINS: process.env['CHECKOUT_ALLOWED_ORIGINS'] || (nodeEnvironment === 'test' ? 'https://checkout.stripe.com,https://checkout.stripe.test' : 'https://checkout.stripe.com'),
  PAYMENTS_VERIFICATION_TIER: process.env['PAYMENTS_VERIFICATION_TIER'] || 'NOT_STARTED',
  EMAIL_VERIFICATION_TIER: process.env['EMAIL_VERIFICATION_TIER'] || 'NOT_STARTED',
  AI_BASE_URL: process.env['AI_BASE_URL'] || '',
  AI_API_KEY: process.env['AI_API_KEY'] || '',
  AI_MODEL: process.env['AI_MODEL'] || '',
  BACKUP_INTERVAL_HOURS: process.env['BACKUP_INTERVAL_HOURS'] || '24',
  BACKUP_RETENTION_COUNT: process.env['BACKUP_RETENTION_COUNT'] || '14',
  BACKUP_COPY_DIR: process.env['BACKUP_COPY_DIR'] || '',
  FORTLESS_BACKUP_KEY: process.env['FORTLESS_BACKUP_KEY'] || '',
  DATABASE_PATH: process.env['DATABASE_PATH'] || './data/fortless.db',
  REDIS_URL: process.env['REDIS_URL'] || 'redis://127.0.0.1:6379',
  SESSION_SECRET: process.env['SESSION_SECRET'] || (nodeEnvironment === 'production' ? '' : persistentDevelopmentSecret()),
  PAYMENTS_MODE: process.env['PAYMENTS_MODE'] || 'disabled',
  PROVIDER_MODE: process.env['PROVIDER_MODE'] || 'disabled',
  PROVIDER_VERIFICATION_TIER: process.env['PROVIDER_VERIFICATION_TIER'] || 'NOT_STARTED',
  EMAIL_MODE: (process.env['EMAIL_MODE'] as any) || (process.env['SMTP_PASSWORD'] || process.env['EMAIL_PASSWORD'] ? 'live' : 'disabled'),
  SMTP_HOST: process.env['SMTP_HOST'] || 'mail.xodo.ro',
  SMTP_PORT: process.env['SMTP_PORT'] ? Number(process.env['SMTP_PORT']) : 587,
  SMTP_SECURE: process.env['SMTP_SECURE'] === 'true' || process.env['SMTP_PORT'] === '465',
  SMTP_USER: process.env['SMTP_USER'] || 'hello@fortless.net',
  SMTP_PASSWORD: process.env['SMTP_PASSWORD'] || process.env['EMAIL_PASSWORD'] || '',
  EMAIL_FROM: process.env['EMAIL_FROM'] || 'Fortless <hello@fortless.net>',
  STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] || '',
  STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] || '',
  PTERODACTYL_PANEL_URL: process.env['PTERODACTYL_PANEL_URL'] || '',
  PTERODACTYL_API_KEY: process.env['PTERODACTYL_API_KEY'] || '',
  PTERODACTYL_CLIENT_API_KEY: process.env['PTERODACTYL_CLIENT_API_KEY'] || '',
  PTERODACTYL_SSO_LOGIN_URL: process.env['PTERODACTYL_SSO_LOGIN_URL'] || '',
  PTERODACTYL_KEYMINT_SECRET: process.env['PTERODACTYL_KEYMINT_SECRET'] || '',
  MODRINTH_API_URL: process.env['MODRINTH_API_URL'] || 'https://api.modrinth.com/v2',
  MODRINTH_USER_AGENT: process.env['MODRINTH_USER_AGENT'] || '',
  OIDC_PANEL_CLIENT_ID: process.env['OIDC_PANEL_CLIENT_ID'] || 'fortless-panel',
  OIDC_PANEL_CLIENT_SECRET: process.env['OIDC_PANEL_CLIENT_SECRET'] || '',
  OIDC_PANEL_REDIRECT_URIS: process.env['OIDC_PANEL_REDIRECT_URIS'] || '',
});

// NEW-394: a production process must not trust loopback origins with credentials.
if (config.NODE_ENV === 'production' && /(^|,)\s*https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(config.ALLOWED_ORIGINS)) {
  throw new Error('ALLOWED_ORIGINS contains a loopback origin, which is not allowed in production.');
}
