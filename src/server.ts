import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from './config/index.js';
import { getDatabase } from './database/index.js';
import {
  registerUser,
  loginUser,
  authenticateSession,
  revokeSession,
  listUserSessions,
  revokeUserSession,
  revokeOtherUserSessions,
  hasPendingMfaSession,
  completeMfaChallenge,
  getMfaStatus,
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  changePassword,
  generateId,
  type AuthContext,
  MfaConfigurationUnavailableError,
  completeStepUp,
} from './modules/identity/auth.js';
import {
  listAccountMembers,
  listAccountInvitations,
  inviteAccountMember,
  revokeAccountMember,
  acceptAccountInvitation,
} from './modules/identity/teams.js';
import {
  generateWebAuthnChallenge,
  verifyAndRegisterPasskey,
  verifyAndAuthenticatePasskey,
  listPasskeysForUser,
  revokePasskey,
} from './modules/identity/passkeys.js';
import {
  getPublishedPlans,
  listCategories,
  listProducts,
  getProductDetail,
  listRegionsWithCapacity,
  validateCoupon,
  createCoupon,
  listCoupons,
  createProduct,
  updateProductPublishStatus,
  createPlanVersion,
  updatePlanStatus,
} from './modules/catalog/catalog.js';
import { createQuote } from './modules/pricing/quote.js';
import { processCheckout } from './modules/checkout/checkout.js';
import { verifyStripeSignature, ingestPSPWebhook, processStaffRefund } from './modules/payments/webhooks.js';
import {
  getServiceDetail,
  executeServicePowerAction,
  suspendService,
  unsuspendService,
  terminateService,
} from './modules/provisioning/services.js';
import { renderInvoiceText } from './modules/invoicing/invoicing.js';
import { listSubscriptionsForAccount, cancelSubscription } from './modules/billing/subscriptions.js';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
} from './modules/notifications/notifications.js';
import {
  getAdminOverview,
  listAdminAccounts,
  getAdminAccountDetail,
  updateAccountStatus,
  listAdminServices,
  listAdminTickets,
  getAdminTicketDetail,
  addStaffTicketReply,
  updateTicketStatus,
  listAdminAudit,
  listAdminStaff,
  listAdminOrders,
  listAdminInvoices,
  listAdminCreditNotes,
  getAdminCapacityPools,
} from './modules/admin/read-model.js';
import { getStaffAccess, hasStaffPermission, STAFF_ROLES, type StaffPermission } from './modules/admin/access.js';
import {
  listTickets,
  createTicket,
  getTicketThread,
  addCustomerReply,
  addTicketAttachment,
  listTicketAttachments,
  getTicketAttachment,
} from './modules/support/tickets.js';
import {
  getPublicSystemStatus,
  createIncident,
  updateIncident,
  updateComponentStatus,
} from './modules/status/status.js';
import { processSubscriptionRenewals } from './modules/billing/renewal-dunning.js';
import {
  searchDomain,
  createDomainZone,
  listDomainZones,
  getDomainZone,
  listDnsRecords,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  TLD_CATALOG,
} from './modules/domains/dns.js';
import {
  searchKnowledgeArticles,
  getKnowledgeArticleBySlug,
} from './modules/ai/knowledge.js';
import {
  runServiceDiagnostic,
  runTicketTriage,
} from './modules/ai/diagnostics.js';
import { MockAiProviderAdapter } from './modules/ai/adapter.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    rawBody?: string;
  }
}

export function buildServer(): FastifyInstance {
  const app = fastify({
    logger: false,
    trustProxy: (address) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1',
  });

  const aiAdapter = new MockAiProviderAdapter();

  // 1. Raw body capture plugin for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      const buffer = body as Buffer;
      const rawString = buffer.toString('utf8');
      req.rawBody = rawString;
      const json = JSON.parse(rawString);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // 2. Plugins
  const allowedOrigins = new Set(config.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean));
  app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed'), false);
    },
    credentials: true,
  });

  app.register(cookie, {
    secret: config.SESSION_SECRET,
  });

  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  const makeCsrfToken = () => {
    const nonce = crypto.randomBytes(24).toString('base64url');
    const signature = crypto.createHmac('sha256', config.SESSION_SECRET).update(nonce).digest('base64url');
    return `${nonce}.${signature}`;
  };
  const validCsrfToken = (token: string) => {
    const [nonce, signature] = token.split('.');
    if (!nonce || !signature) return false;
    const expected = crypto.createHmac('sha256', config.SESSION_SECRET).update(nonce).digest('base64url');
    try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); } catch { return false; }
  };

  // 3. Auth Hook Middleware
  app.decorateRequest('auth', undefined);
  app.addHook('preHandler', async (req) => {
    let token = req.cookies['fortless_session'];
    const authHeader = req.headers['authorization'];
    if (!token && authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (token) {
      const context = authenticateSession(token);
      if (context) {
        req.auth = context;
      }
    }
  });

  app.addHook('preHandler', async (req, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.url.startsWith('/api/v1/webhooks/')) return;
    const cookieToken = req.cookies['fortless_csrf'];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || typeof headerToken !== 'string' || cookieToken !== headerToken || !validCsrfToken(cookieToken)) {
      return reply.status(403).send({ error: 'CSRF validation failed', code: 'CSRF_INVALID' });
    }
  });

  // Auth Guard Helpers
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }
  };

  const requireRole = (...allowedRoles: string[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.auth) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!allowedRoles.includes(req.auth.membership.role)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        });
      }
    };
  };

  const requireStaff = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth || !getStaffAccess(req.auth.user.id, getDatabase())) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff administrator privileges required' });
    }
    if (!req.auth.session.mfaVerifiedAt) {
      return reply.status(403).send({ error: 'MFA required', code: 'STAFF_MFA_REQUIRED' });
    }
  };

  const requireStaffPermission = (permission: StaffPermission) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth || !hasStaffPermission(req.auth.user.id, permission, getDatabase())) {
      return reply.status(403).send({ error: 'Forbidden', message: 'This staff role does not have the required permission.' });
    }
    if (!req.auth.session.mfaVerifiedAt) {
      return reply.status(403).send({ error: 'MFA required', code: 'STAFF_MFA_REQUIRED' });
    }
  };

  const requireRecentStepUp = async (req: FastifyRequest, reply: FastifyReply) => {
    const verifiedAt = req.auth?.session.stepUpVerifiedAt;
    if (!verifiedAt || Date.now() - Date.parse(verifiedAt) > 10 * 60 * 1000) {
      return reply.status(403).send({ error: 'Recent verification required', code: 'STEP_UP_REQUIRED' });
    }
  };

  // --- WEB PAGES & STOREFRONT ---
  // Asset fingerprints are rebuilt at process start, including customer and
  // staff shells, then synchronized during local watch-driven development.
  const publicDir = path.resolve(process.cwd(), 'public');
  const assetDir = path.join(publicDir, 'assets');
  const fingerprintedAssets = new Map<string, { filePath: string; mime: string }>();
  const assetUrls = new Map<string, string>();
  const mimeFor = (file: string) => {
    const ext = path.extname(file);
    return ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : ext === '.svg' ? 'image/svg+xml'
      : ext === '.png' ? 'image/png' : ext === '.ico' ? 'image/x-icon' : 'application/octet-stream';
  };
  if (fs.existsSync(assetDir)) {
    for (const file of fs.readdirSync(assetDir)) {
      const filePath = path.join(assetDir, file);
      if (!fs.statSync(filePath).isFile()) continue;
      const extension = path.extname(file);
      const base = file.slice(0, -extension.length);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 12);
      const fingerprinted = `${base}.${digest}${extension}`;
      fingerprintedAssets.set(fingerprinted, { filePath, mime: mimeFor(file) });
      assetUrls.set(file, `/assets/${fingerprinted}`);
    }
  }
  const renderHtml = (fileName: string) => {
    let html = fs.readFileSync(path.join(publicDir, fileName), 'utf8');
    for (const [file, url] of assetUrls) html = html.split(`/assets/${file}`).join(url);
    return html;
  };

  app.get('/', async (req, reply) => {
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = renderHtml('index.html').replace('__AUTH_STATE__', req.auth ? 'true' : 'false');
      return reply.type('text/html').header('Cache-Control', 'private, no-store').send(html);
    }
    return reply.type('text/plain').send('FORTLESS Platform Initialized');
  });

  app.get('/app', async (req, reply) => {
    if (!req.auth) return reply.redirect('/login?next=/app');
    const appPath = path.join(publicDir, 'app.html');
    if (fs.existsSync(appPath)) {
      return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('app.html'));
    }
    return reply.redirect('/');
  });

  app.get('/app/:view', async (req, reply) => {
    const { view } = req.params as { view: string };
    const allowedViews = new Set(['deploy', 'billing', 'support', 'activity', 'settings', 'domains']);
    if (!allowedViews.has(view)) return reply.redirect('/app');
    if (!req.auth) return reply.redirect(`/login?next=${encodeURIComponent(`/app/${view}`)}`);
    const appPath = path.join(publicDir, 'app.html');
    if (fs.existsSync(appPath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('app.html'));
    return reply.redirect('/');
  });

  app.get('/app/services/:id', async (req, reply) => {
    if (!req.auth) return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
    const { id } = req.params as { id: string };
    const db = getDatabase();
    const service = db.prepare('SELECT id FROM services WHERE id = ? AND account_id = ?').get(id, req.auth.account.id);
    if (!service) return reply.redirect('/app');
    const appPath = path.join(publicDir, 'app.html');
    if (fs.existsSync(appPath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('app.html'));
    return reply.redirect('/app');
  });

  app.get('/login', async (req, reply) => {
    if (req.auth) return reply.redirect('/app');
    const loginPath = path.join(publicDir, 'login.html');
    if (fs.existsSync(loginPath)) {
      return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('login.html'));
    }
    return reply.redirect('/app');
  });

  app.get('/mfa/challenge', async (req, reply) => {
    if (req.auth) return reply.redirect('/app');
    const token = req.cookies['fortless_session'];
    if (!token || !hasPendingMfaSession(token)) return reply.redirect('/login');
    const filePath = path.join(publicDir, 'mfa-challenge.html');
    if (fs.existsSync(filePath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('mfa-challenge.html'));
    return reply.status(503).send('MFA challenge is unavailable.');
  });

  app.get('/register', async (req, reply) => {
    if (req.auth) return reply.redirect('/app');
    const regPath = path.join(publicDir, 'register.html');
    if (fs.existsSync(regPath)) {
      return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('register.html'));
    }
    return reply.redirect('/app');
  });

  for (const page of ['forgot-password', 'reset-password', 'verify-email']) {
    app.get(`/${page}`, async (_req, reply) => {
      const filePath = path.join(publicDir, `${page}.html`);
      if (fs.existsSync(filePath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml(`${page}.html`));
      return reply.redirect('/login');
    });
  }

  app.get('/status', async (req, reply) => {
    const filePath = path.join(publicDir, 'status.html');
    if (fs.existsSync(filePath)) {
      const html = renderHtml('status.html').replace('__AUTH_STATE__', req.auth ? 'true' : 'false');
      return reply.type('text/html').header('Cache-Control', 'public, max-age=30').send(html);
    }
    return reply.status(404).send('Not Found');
  });

  app.get('/api/v1/status', async (_req, reply) => {
    const status = getPublicSystemStatus(getDatabase());
    return reply.header('Cache-Control', 'public, max-age=15').send(status);
  });

  const legalDocs = ['terms', 'privacy', 'aup', 'refunds', 'sla'];
  app.get('/legal', async (_req, reply) => {
    return reply.redirect('/legal/terms');
  });

  for (const doc of legalDocs) {
    app.get(`/${doc}`, async (_req, reply) => {
      return reply.redirect(`/legal/${doc}`);
    });
  }

  app.get('/legal/:doc', async (req, reply) => {
    const { doc } = req.params as { doc: string };
    const targetDoc = legalDocs.includes(doc) ? doc : 'terms';
    const filePath = path.join(publicDir, 'legal.html');
    if (fs.existsSync(filePath)) {
      const html = renderHtml('legal.html')
        .replace('__AUTH_STATE__', req.auth ? 'true' : 'false')
        .replace(/__ACTIVE_DOC__/g, targetDoc);
      return reply.type('text/html').header('Cache-Control', 'public, max-age=60').send(html);
    }
    return reply.status(404).send('Not Found');
  });

  // Knowledge Base: Search & List Articles
  app.get('/api/v1/kb/articles', async (req) => {
    const query = (req.query as any)?.q || '';
    const category = (req.query as any)?.category;
    const limit = (req.query as any)?.limit ? Number((req.query as any).limit) : 10;
    const articles = searchKnowledgeArticles(query, { category, limit }, getDatabase());
    return { articles };
  });

  // Knowledge Base: Get Article by Slug
  app.get('/api/v1/kb/articles/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const article = getKnowledgeArticleBySlug(slug, getDatabase());
    if (!article) {
      return reply.status(404).send({ error: 'Article not found.' });
    }
    return { article };
  });

  app.get('/admin', async (req, reply) => {
    if (!req.auth) return reply.redirect('/login?next=/admin');
    if (!hasStaffPermission(req.auth.user.id, 'admin:access', getDatabase()) || !req.auth.session.mfaVerifiedAt) return reply.status(403).type('text/plain').send('Staff MFA is required.');
    const filePath = path.join(publicDir, 'admin.html');
    if (fs.existsSync(filePath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('admin.html'));
    return reply.status(503).send('Admin shell is not installed.');
  });

  app.get('/admin/:view', async (req, reply) => {
    const { view } = req.params as { view: string };
    const viewPermissions: Record<string, StaffPermission> = { accounts: 'accounts:read', services: 'services:read', tickets: 'tickets:read', audit: 'audit:read', staff: 'staff:read' };
    if (!viewPermissions[view]) return reply.redirect('/admin');
    if (!req.auth) return reply.redirect(`/login?next=${encodeURIComponent(`/admin/${view}`)}`);
    if (!hasStaffPermission(req.auth.user.id, viewPermissions[view]!, getDatabase()) || !req.auth.session.mfaVerifiedAt) return reply.status(403).type('text/plain').send('Staff MFA and route permission are required.');
    const filePath = path.join(publicDir, 'admin.html');
    if (fs.existsSync(filePath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('admin.html'));
    return reply.status(503).send('Admin shell is not installed.');
  });

  app.get('/favicon.svg', async (_req, reply) => {
    const filePath = path.join(publicDir, 'favicon.svg');
    if (fs.existsSync(filePath)) {
      return reply.type('image/svg+xml').send(fs.readFileSync(filePath));
    }
    return reply.status(404).send('Not Found');
  });

  app.get('/assets/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    if (path.basename(file) !== file) return reply.status(404).send('Asset Not Found');
    const fingerprinted = fingerprintedAssets.get(file);
    if (fingerprinted) {
      return reply.type(fingerprinted.mime).header('Cache-Control', 'public, max-age=31536000, immutable').send(fs.readFileSync(fingerprinted.filePath));
    }
    const filePath = path.join(publicDir, 'assets', file);
    if (fs.existsSync(filePath)) {
      return reply.type(mimeFor(file)).header('Cache-Control', 'no-cache').send(fs.readFileSync(filePath));
    }
    return reply.status(404).send('Asset Not Found');
  });

  // --- API ROUTES ---

  const operationalCapability = (capability: 'payments' | 'provisioning' | 'email'): boolean => {
    if (capability === 'payments') return config.PAYMENTS_MODE === 'stripe_test' || (config.PAYMENTS_MODE === 'stripe_live' && Boolean(config.STRIPE_SECRET_KEY));
    if (capability === 'provisioning') return config.PROVIDER_MODE !== 'disabled';
    if (capability === 'email') return config.EMAIL_MODE !== 'disabled';
    return false;
  };

  app.get('/api/v1/auth/csrf', async (_req, reply) => {
    const token = makeCsrfToken();
    reply.setCookie('fortless_csrf', token, {
      path: '/', httpOnly: false, secure: config.NODE_ENV === 'production', sameSite: 'strict', maxAge: 60 * 60,
    });
    return { csrfToken: token };
  });

  // Health check
  app.get('/api/health', async () => {
    const db = getDatabase();
    const dbCheck = db.prepare('SELECT 1 as healthy').get() as { healthy: number };
    return {
      status: 'ok',
      service: 'fortless-core',
      uptimeSeconds: Math.floor(process.uptime()),
      database: dbCheck.healthy === 1 ? 'connected' : 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/api/v1/platform/capabilities', async () => ({
    payments: {
      enabled: operationalCapability('payments'),
      mode: config.PAYMENTS_MODE,
      verification: config.PAYMENTS_MODE === 'stripe_test' ? 'SANDBOX_VERIFIED' : (config.PAYMENTS_MODE === 'stripe_live' ? 'PRODUCTION_VERIFIED' : 'NOT_STARTED'),
    },
    provisioning: {
      enabled: operationalCapability('provisioning'),
      mode: config.PROVIDER_MODE,
      verification: config.PROVIDER_MODE === 'pterodactyl_1' ? 'SANDBOX_VERIFIED' : 'MOCK_ONLY',
    },
    transactionalEmail: {
      enabled: operationalCapability('email'),
      mode: config.EMAIL_MODE,
      verification: config.EMAIL_MODE === 'sandbox' ? 'SANDBOX_VERIFIED' : (config.EMAIL_MODE === 'live' ? 'PRODUCTION_VERIFIED' : 'NOT_STARTED'),
    },
  }));

  // Auth: Register
  const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(12).max(128),
    name: z.string().min(2),
  });

  app.post('/api/v1/auth/register', async (req, reply) => {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    try {
      const result = registerUser({
        email: parse.data.email,
        password: parse.data.password,
        name: parse.data.name,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'unknown',
      });

      return reply.status(201).send({
        user: result.user,
        account: result.account,
        requiresEmailVerification: true,
        emailDelivery: 'CONFIGURATION_REQUIRED',
      });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // Auth: Login
  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    try {
      const result = loginUser({
        email: parse.data.email,
        password: parse.data.password,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'unknown',
      });

      reply.setCookie('fortless_session', result.token, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 14 * 24 * 60 * 60,
      });

      return reply.send({
        user: result.user,
        account: result.account,
        requiresMfa: Boolean(result.requiresMfa),
      });
    } catch (err: unknown) {
      return reply.status(401).send({ error: (err as Error).message });
    }
  });

  const tokenSchema = z.object({ token: z.string().min(32) });
  app.post('/api/v1/auth/verify-email', async (req, reply) => {
    const parse = tokenSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Invalid verification request' });
    try {
      const result = verifyEmail(parse.data.token, { ipAddress: req.ip, userAgent: req.headers['user-agent'] || 'unknown' });
      reply.setCookie('fortless_session', result.token, { path: '/', httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', maxAge: 14 * 24 * 60 * 60 });
      return { verified: true };
    } catch (err: unknown) { return reply.status(400).send({ error: (err as Error).message }); }
  });

  const emailSchema = z.object({ email: z.string().email() });
  app.post('/api/v1/auth/resend-verification', async (req, reply) => {
    const parse = emailSchema.safeParse(req.body);
    if (parse.success) resendVerification(parse.data.email);
    return reply.status(202).send({ message: 'If the account is eligible, a verification message will be queued.', emailDelivery: 'CONFIGURATION_REQUIRED' });
  });

  app.post('/api/v1/auth/forgot-password', async (req, reply) => {
    const parse = emailSchema.safeParse(req.body);
    if (parse.success) requestPasswordReset(parse.data.email);
    return reply.status(202).send({ message: 'If an eligible account exists, a password reset message will be queued.', emailDelivery: 'CONFIGURATION_REQUIRED' });
  });

  app.post('/api/v1/auth/reset-password', async (req, reply) => {
    const parse = z.object({ token: z.string().min(32), password: z.string().min(12).max(128) }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Invalid password reset request' });
    try { resetPassword(parse.data.token, parse.data.password); return { reset: true }; }
    catch (err: unknown) { return reply.status(400).send({ error: (err as Error).message }); }
  });

  app.post('/api/v1/auth/mfa/challenge', async (req, reply) => {
    const parse = z.object({ code: z.string().min(6).max(20) }).safeParse(req.body);
    const token = req.cookies['fortless_session'];
    if (!parse.success || !token) return reply.status(400).send({ error: 'Enter a valid authenticator or recovery code.' });
    try {
      return reply.send({ verified: true, ...completeMfaChallenge(token, parse.data.code, req.ip) });
    } catch (err: unknown) {
      if (err instanceof MfaConfigurationUnavailableError) {
        return reply.status(503).send({ error: err.message, code: err.code });
      }
      return reply.status(401).send({ error: (err as Error).message });
    }
  });

  // Auth: Logout
  app.post('/api/v1/auth/logout', { preHandler: [requireAuth] }, async (req, reply) => {
    const token = req.cookies['fortless_session'] || req.headers['authorization']?.substring(7);
    if (token) {
      revokeSession(token);
    }
    reply.clearCookie('fortless_session', { path: '/' });
    return { success: true };
  });

  // Auth: Me
  app.get('/api/v1/auth/me', { preHandler: [requireAuth] }, async (req) => {
    return {
      user: req.auth!.user,
      account: req.auth!.account,
      membership: req.auth!.membership,
    };
  });

  app.get('/api/v1/auth/sessions', { preHandler: [requireAuth] }, async (req) => ({
    sessions: listUserSessions(req.auth!.user.id, req.auth!.session.id),
  }));

  app.get('/api/v1/auth/mfa', { preHandler: [requireAuth] }, async (req) => getMfaStatus(req.auth!.user.id));

  app.get('/api/v1/auth/step-up', { preHandler: [requireAuth] }, async (req) => {
    const verifiedAt = req.auth!.session.stepUpVerifiedAt;
    const validUntil = verifiedAt ? new Date(new Date(verifiedAt).getTime() + 10 * 60 * 1000).toISOString() : null;
    return { verifiedAt, validUntil, valid: Boolean(validUntil && Date.parse(validUntil) > Date.now()) };
  });

  app.post('/api/v1/auth/step-up', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = z.object({ password: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Password and a six-digit authenticator code are required.' });
    try {
      return completeStepUp({
        userId: req.auth!.user.id,
        accountId: req.auth!.account.id,
        sessionId: req.auth!.session.id,
        password: parsed.data.password,
        code: parsed.data.code,
        ipAddress: req.ip,
      });
    } catch (error: unknown) {
      if (error instanceof MfaConfigurationUnavailableError) return reply.status(503).send({ error: error.message, code: error.code });
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  app.post('/api/v1/auth/mfa/totp/enroll', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = z.object({ password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Enter your current password.' });
    try {
      return reply.send(beginTotpEnrollment(req.auth!.user.id, parse.data.password, req.auth!.user.email));
    } catch (err: unknown) { return reply.status(400).send({ error: (err as Error).message }); }
  });

  app.post('/api/v1/auth/mfa/totp/confirm', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Enter the six-digit code from your authenticator.' });
    try {
      const recoveryCodes = confirmTotpEnrollment({
        userId: req.auth!.user.id, accountId: req.auth!.account.id, sessionId: req.auth!.session.id,
        code: parse.data.code, ipAddress: req.ip,
      });
      return reply.send({ enabled: true, recoveryCodes });
    } catch (err: unknown) { return reply.status(400).send({ error: (err as Error).message }); }
  });

  app.delete('/api/v1/auth/mfa/totp', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = z.object({ password: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Password and six-digit authenticator code are required.' });
    try {
      disableTotp({ userId: req.auth!.user.id, accountId: req.auth!.account.id, password: parse.data.password, code: parse.data.code, ipAddress: req.ip });
      return reply.send({ enabled: false });
    } catch (err: unknown) { return reply.status(400).send({ error: (err as Error).message }); }
  });

  app.post('/api/v1/auth/sessions/revoke-others', { preHandler: [requireAuth] }, async (req) => ({
    revokedCount: revokeOtherUserSessions({
      userId: req.auth!.user.id,
      accountId: req.auth!.account.id,
      currentSessionId: req.auth!.session.id,
      ipAddress: req.ip,
    }),
  }));

  app.delete('/api/v1/auth/sessions/:sessionId', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = z.object({ sessionId: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid session identifier.' });
    const isCurrent = parsed.data.sessionId === req.auth!.session.id;
    const revoked = revokeUserSession({
      userId: req.auth!.user.id,
      accountId: req.auth!.account.id,
      sessionId: parsed.data.sessionId,
      ipAddress: req.ip,
    });
    if (!revoked) return reply.status(404).send({ error: 'Session not found.' });
    if (isCurrent) reply.clearCookie('fortless_session', { path: '/' });
    return { revoked: true, currentSessionRevoked: isCurrent };
  });

  // Auth: Change Password from Settings
  app.post('/api/v1/auth/password/change', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(12).max(128),
    }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Current password and a valid new password (min 12 chars) are required.' });
    try {
      changePassword({
        userId: req.auth!.user.id,
        accountId: req.auth!.account.id,
        currentPassword: parse.data.currentPassword,
        newPassword: parse.data.newPassword,
        currentSessionId: req.auth!.session.id,
        ipAddress: req.ip,
      });
      return reply.send({ success: true, message: 'Password updated. Other sessions have been revoked.' });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // --- WebAuthn Passkeys ---
  app.post('/api/v1/auth/passkeys/register-options', { preHandler: [requireAuth] }, async (req) => {
    const { challenge, expiresAt } = generateWebAuthnChallenge('REGISTRATION', req.auth!.user.id, getDatabase());
    return {
      challenge,
      rp: { name: 'FORTLESS', id: 'fortless.net' },
      user: { id: req.auth!.user.id, name: req.auth!.user.email, displayName: req.auth!.user.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      timeout: 60000,
      expiresAt,
    };
  });

  app.post('/api/v1/auth/passkeys/register-verify', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = z.object({
      deviceLabel: z.string().min(1).max(64),
      challenge: z.string().min(16),
      clientDataJSON: z.string(),
      credentialId: z.string().min(16),
      publicKey: z.string().min(16),
      aaguid: z.string().optional(),
      transports: z.array(z.string()).optional(),
    }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Invalid passkey registration parameters.' });

    try {
      const passkey = verifyAndRegisterPasskey({
        ...parse.data,
        userId: req.auth!.user.id,
        ipAddress: req.ip,
      }, getDatabase());
      return reply.send({ passkey });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/auth/passkeys/login-options', async () => {
    const { challenge, expiresAt } = generateWebAuthnChallenge('AUTHENTICATION', null, getDatabase());
    return {
      challenge,
      rpId: 'fortless.net',
      timeout: 60000,
      userVerification: 'preferred',
      expiresAt,
    };
  });

  app.post('/api/v1/auth/passkeys/login-verify', async (req, reply) => {
    const parse = z.object({
      credentialId: z.string().min(16),
      challenge: z.string().min(16),
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      clientCounter: z.number().optional(),
    }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Invalid passkey authentication payload.' });

    try {
      const result = verifyAndAuthenticatePasskey({
        ...parse.data,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      }, getDatabase());

      reply.setCookie('fortless_session', result.token, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 14 * 24 * 60 * 60,
      });

      return reply.send({ user: result.user, account: result.account });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/v1/auth/passkeys', { preHandler: [requireAuth] }, async (req) => {
    return { passkeys: listPasskeysForUser(req.auth!.user.id, getDatabase()) };
  });

  app.delete('/api/v1/auth/passkeys/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid passkey ID.' });
    try {
      revokePasskey(req.auth!.user.id, parsed.data.id, getDatabase());
      return { revoked: true };
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // Team & Organization Management
  app.get('/api/v1/account/members', { preHandler: [requireAuth] }, async (req) => {
    return {
      members: listAccountMembers(req.auth!.account.id),
      invitations: listAccountInvitations(req.auth!.account.id),
    };
  });

  app.post('/api/v1/account/members/invite', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = z.object({
      email: z.string().email(),
      role: z.enum(['OWNER', 'BILLING_MANAGER', 'TECH_ADMIN', 'VIEWER']),
    }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'A valid email and role (OWNER, BILLING_MANAGER, TECH_ADMIN, VIEWER) are required.' });
    try {
      const result = inviteAccountMember({
        accountId: req.auth!.account.id,
        invitedByUserId: req.auth!.user.id,
        email: parse.data.email,
        role: parse.data.role,
        ipAddress: req.ip,
      });
      return reply.status(201).send({ success: true, invitationId: result.invitationId });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.delete('/api/v1/account/members/:membershipId', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = z.object({ membershipId: z.string().min(1) }).safeParse(req.params);
    if (!parse.success) return reply.status(400).send({ error: 'Membership ID is required.' });
    try {
      revokeAccountMember({
        accountId: req.auth!.account.id,
        actorUserId: req.auth!.user.id,
        membershipId: parse.data.membershipId,
        ipAddress: req.ip,
      });
      return reply.send({ success: true, message: 'Team member removed.' });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/account/invitations/accept', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = z.object({ token: z.string().min(1) }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Invitation token is required.' });
    try {
      const result = acceptAccountInvitation(parse.data.token, req.auth!.user.id, req.ip);
      return reply.send({ success: true, accountId: result.accountId, role: result.role });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // Email Delivery Status
  app.get('/api/v1/email/status', { preHandler: [requireAuth] }, async () => {
    const db = getDatabase();
    const counts = db.prepare(`
      SELECT status, count(*) AS count FROM email_outbox GROUP BY status
    `).all() as { status: string; count: number }[];
    const countMap: Record<string, number> = { PENDING: 0, SENT: 0, FAILED: 0 };
    for (const c of counts) countMap[c.status] = c.count;
    return {
      mode: config.EMAIL_MODE,
      pendingCount: countMap['PENDING'] || 0,
      sentCount: countMap['SENT'] || 0,
      failedCount: countMap['FAILED'] || 0,
    };
  });

  // Catalog: Categories
  app.get('/api/v1/catalog/categories', async () => {
    const categories = listCategories();
    return { categories };
  });

  // Catalog: Products
  app.get('/api/v1/catalog/products', async (req) => {
    const query = req.query as { category?: string } | undefined;
    const products = listProducts({ categorySlug: query?.category });
    return { products };
  });

  // Catalog: Product Detail
  app.get('/api/v1/catalog/products/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const product = getProductDetail(slug);
    if (!product) {
      return reply.status(404).send({ error: 'Product not found.' });
    }
    return { product };
  });

  // Catalog: Published Plans
  app.get('/api/v1/catalog/plans', async () => {
    const plans = getPublishedPlans();
    return { plans };
  });

  // Catalog: Regions with Live Capacity
  app.get('/api/v1/catalog/regions', async () => {
    const regions = listRegionsWithCapacity();
    return { regions };
  });

  // Catalog: Validate Coupon
  app.post('/api/v1/catalog/validate-coupon', { preHandler: [requireAuth] }, async (req, reply) => {
    const body = req.body as { code?: string; subtotalMinorUnits?: number } | undefined;
    if (!body?.code) {
      return reply.status(400).send({ error: 'Missing coupon code.' });
    }
    try {
      const result = validateCoupon(body.code, req.auth!.account.id, body.subtotalMinorUnits ?? 0);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(422).send({ error: (err as Error).message });
    }
  });

  // Pricing: Generate Quote
  const quoteSchema = z.object({
    items: z.array(
      z.object({
        planVersionId: z.string(),
        quantity: z.number().int().positive().default(1),
        interval: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']).optional(),
        regionId: z.string().optional(),
        customOptions: z.record(z.string(), z.unknown()).optional(),
      })
    ),
    billingCountry: z.string().length(2).default('DE'),
    isB2B: z.boolean().default(false),
    taxId: z.string().optional(),
    couponCode: z.string().optional(),
  });

  app.post('/api/v1/quotes', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = quoteSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    try {
      const quote = createQuote(
        req.auth!.account.id,
        parse.data.items,
        parse.data.billingCountry,
        parse.data.isB2B,
        parse.data.taxId,
        parse.data.couponCode
      );
      return reply.status(201).send(quote);
    } catch (err: unknown) {
      return reply.status(422).send({ error: (err as Error).message });
    }
  });

  // Admin Catalog: List Products
  app.get('/api/v1/admin/catalog/products', { preHandler: [requireAuth, requireStaffPermission('catalog:read')] }, async () => {
    const products = listProducts({ includeUnpublished: true });
    return { products };
  });

  // Admin Catalog: Create Product
  const createProductSchema = z.object({
    categoryId: z.string(),
    slug: z.string().min(2).max(64),
    name: z.string().min(2).max(100),
    providerType: z.enum(['PTERODACTYL', 'CPANEL', 'REGISTRAR', 'VPS']),
    isPublished: z.boolean().default(false),
  });

  app.post('/api/v1/admin/catalog/products', { preHandler: [requireAuth, requireStaffPermission('catalog:manage')] }, async (req, reply) => {
    const parse = createProductSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }
    const result = createProduct(parse.data);
    return reply.status(201).send(result);
  });

  // Admin Catalog: Toggle Publish
  app.patch('/api/v1/admin/catalog/products/:id/publish', { preHandler: [requireAuth, requireStaffPermission('catalog:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { isPublished?: boolean } | undefined;
    updateProductPublishStatus(id, Boolean(body?.isPublished));
    return reply.send({ success: true, productId: id, isPublished: Boolean(body?.isPublished) });
  });

  // Admin Catalog: Create Plan Version
  const createPlanSchema = z.object({
    productId: z.string(),
    name: z.string().min(2).max(100),
    resourceSpecs: z.object({
      memoryMb: z.number().int().positive(),
      cpuPct: z.number().int().positive(),
      diskMb: z.number().int().positive(),
      databases: z.number().int().nonnegative().default(0),
      backups: z.number().int().nonnegative().default(0),
      eggId: z.number().int().optional(),
    }),
    prices: z.array(
      z.object({
        currency: z.string().default('EUR'),
        interval: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']),
        priceMinorUnits: z.number().int().nonnegative(),
        setupFeeMinorUnits: z.number().int().nonnegative().default(0),
      })
    ).min(1),
  });

  app.post('/api/v1/admin/catalog/plans', { preHandler: [requireAuth, requireStaffPermission('catalog:manage')] }, async (req, reply) => {
    const parse = createPlanSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }
    const result = createPlanVersion(parse.data);
    return reply.status(201).send(result);
  });

  // Admin Catalog: Update Plan Status
  app.patch('/api/v1/admin/catalog/plans/:id/status', { preHandler: [requireAuth, requireStaffPermission('catalog:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status?: 'DRAFT' | 'ACTIVE' | 'RETIRED' } | undefined;
    if (!body?.status || !['DRAFT', 'ACTIVE', 'RETIRED'].includes(body.status)) {
      return reply.status(400).send({ error: 'Valid status (DRAFT, ACTIVE, RETIRED) is required.' });
    }
    updatePlanStatus(id, body.status);
    return reply.send({ success: true, planVersionId: id, status: body.status });
  });

  // Admin Catalog: Coupons
  app.get('/api/v1/admin/catalog/coupons', { preHandler: [requireAuth, requireStaffPermission('catalog:read')] }, async () => {
    const coupons = listCoupons();
    return { coupons };
  });

  const createCouponSchema = z.object({
    code: z.string().min(3).max(32),
    discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    discountValue: z.number().int().positive(),
    maxRedemptions: z.number().int().positive(),
    expiresAt: z.string(),
  });

  app.post('/api/v1/admin/catalog/coupons', { preHandler: [requireAuth, requireStaffPermission('catalog:manage')] }, async (req, reply) => {
    const parse = createCouponSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }
    try {
      const coupon = createCoupon(parse.data);
      return reply.status(201).send(coupon);
    } catch (err: unknown) {
      return reply.status(422).send({ error: (err as Error).message });
    }
  });

  // Checkout: Submit Order
  const checkoutSchema = z.object({
    quoteId: z.string(),
    regionId: z.string().default('reg_fra_1'),
    customOptions: z.record(z.string(), z.unknown()).optional(),
  });

  app.post('/api/v1/checkout', { preHandler: [requireAuth, requireRole('OWNER', 'BILLING_MANAGER')] }, async (req, reply) => {
    if (!operationalCapability('payments')) return reply.status(503).send({ error: 'Checkout is not configured.', code: 'PAYMENTS_NOT_CONFIGURED' });
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body && (req.body as any).idempotencyKey;
    if (!idempotencyKey) {
      return reply.status(400).send({ error: 'Missing Idempotency-Key header' });
    }

    const parse = checkoutSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    try {
      const result = processCheckout({
        accountId: req.auth!.account.id,
        quoteId: parse.data.quoteId,
        idempotencyKey,
        regionId: parse.data.regionId,
        customOptions: parse.data.customOptions,
      });

      return reply.status(201).send(result);
    } catch (err: unknown) {
      return reply.status(422).send({ error: (err as Error).message });
    }
  });

  // Orders: List (Tenant Isolated!)
  app.get('/api/v1/orders', { preHandler: [requireAuth] }, async (req) => {
    const db = getDatabase();
    const orders = db.prepare(`
      SELECT id, status, currency, total_minor_units, created_at, updated_at
      FROM orders
      WHERE account_id = ?
      ORDER BY created_at DESC
    `).all(req.auth!.account.id);
    return { orders };
  });

  // Orders: Get by ID (Tenant Isolated!)
  app.get('/api/v1/orders/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND account_id = ?').get(id, req.auth!.account.id);
    if (!order) {
      return reply.status(404).send({ error: 'Order not found' });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    return { order, items };
  });

  // Invoices: List (Tenant Isolated!)
  app.get('/api/v1/invoices', { preHandler: [requireAuth] }, async (req) => {
    const db = getDatabase();
    const invoices = db.prepare(`
      SELECT id, invoice_number, status, currency, subtotal_minor_units, tax_minor_units, total_minor_units, due_date, paid_at, created_at
      FROM invoices
      WHERE account_id = ?
      ORDER BY created_at DESC
    `).all(req.auth!.account.id);
    return { invoices };
  });

  // Webhooks: Stripe Raw-Body Verification
  app.post('/api/v1/webhooks/stripe', async (req, reply) => {
    if (!operationalCapability('payments')) return reply.status(503).send({ error: 'Stripe webhooks are not configured.', code: 'PAYMENTS_NOT_CONFIGURED' });
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      return reply.status(400).send({ error: 'Missing stripe-signature header' });
    }

    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = verifyStripeSignature(rawBody, signature);
    if (!isValid) {
      return reply.status(400).send({ error: 'Invalid webhook signature' });
    }

    try {
      const result = ingestPSPWebhook('stripe', 'acct_primary', rawBody, req.body as any);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Services: List (Tenant Isolated!)
  app.get('/api/v1/services', { preHandler: [requireAuth] }, async (req) => {
    const db = getDatabase();
    const services = db.prepare(`
      SELECT s.*, sos.runtime_state, sos.last_checked_at,
             sdc.cpu_limit_pct, sdc.memory_limit_mb, sdc.disk_limit_mb,
             n.name as node_name, pv.name as plan_name
      FROM services s
      LEFT JOIN service_observed_states sos ON sos.service_id = s.id
      LEFT JOIN service_desired_configs sdc ON sdc.service_id = s.id
      JOIN nodes n ON n.id = s.node_id
      JOIN order_items oi ON oi.id = s.order_item_id
      JOIN plan_versions pv ON pv.id = oi.plan_version_id
      WHERE s.account_id = ?
      ORDER BY s.created_at DESC
    `).all(req.auth!.account.id);
    return { services };
  });

  // Services: Get Detail (Tenant Isolated!)
  app.get('/api/v1/services/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const detail = getServiceDetail(id, req.auth!.account.id);
      return { service: detail };
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // Services: Power Action (Tenant Isolated & Role Protected)
  const powerSchema = z.object({
    action: z.enum(['START', 'STOP', 'RESTART', 'KILL']),
  });

  app.post('/api/v1/services/:id/power', { preHandler: [requireAuth, requireRole('OWNER', 'TECH_ADMIN')] }, async (req, reply) => {
    if (!operationalCapability('provisioning')) return reply.status(503).send({ error: 'Infrastructure provider is not configured.', code: 'PROVIDER_NOT_CONFIGURED' });
    const { id } = req.params as { id: string };
    const parse = powerSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid power action' });
    }

    try {
      const result = await executeServicePowerAction({
        serviceId: id,
        accountId: req.auth!.account.id,
        userId: req.auth!.user.id,
        action: parse.data.action,
        ipAddress: req.ip,
      });
      return { success: true, serviceId: id, action: parse.data.action, runtimeState: result.runtimeState };
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      if (msg.includes('cannot receive power commands') || msg.includes('still provisioning')) {
        return reply.status(403).send({ error: msg });
      }
      return reply.status(500).send({ error: msg });
    }
  });

  // Services: AI Diagnostic Analysis (Tenant Isolated)
  app.post('/api/v1/services/:id/diagnostics', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { recentLogs?: string } | undefined;
    try {
      const report = await runServiceDiagnostic(
        {
          serviceId: id,
          accountId: req.auth!.account.id,
          userId: req.auth!.user.id,
          recentLogs: body?.recentLogs,
        },
        getDatabase(),
        aiAdapter
      );
      return { report };
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('not found') || msg.includes('unauthorized')) {
        return reply.status(404).send({ error: msg });
      }
      return reply.status(500).send({ error: msg });
    }
  });

  // Invoices: Get by ID with lines (Tenant Isolated!)
  app.get('/api/v1/invoices/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDatabase();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND account_id = ?').get(id, req.auth!.account.id);
    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }
    const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(id);
    return { invoice, lines };
  });

  // Invoices: Download Plaintext Receipt
  app.get('/api/v1/invoices/:id/download', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const text = renderInvoiceText(id, req.auth!.account.id);
      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="invoice-${id}.txt"`)
        .send(text);
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // Subscriptions: List
  app.get('/api/v1/subscriptions', { preHandler: [requireAuth] }, async (req) => {
    return { subscriptions: listSubscriptionsForAccount(req.auth!.account.id) };
  });

  // Subscriptions: Cancel
  const cancelSubSchema = z.object({
    immediate: z.boolean().default(false),
    reason: z.string().trim().min(3).max(300).optional(),
  });

  app.post('/api/v1/subscriptions/:id/cancel', { preHandler: [requireAuth, requireRole('OWNER', 'BILLING_MANAGER')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = cancelSubSchema.safeParse(req.body || {});
    if (!parse.success) return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    try {
      const result = cancelSubscription({
        subscriptionId: id,
        accountId: req.auth!.account.id,
        userId: req.auth!.user.id,
        immediate: parse.data.immediate,
        reason: parse.data.reason,
      });
      return { success: true, ...result };
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // Notifications: List & Unread Count
  app.get('/api/v1/notifications', { preHandler: [requireAuth] }, async (req) => {
    const notifications = listNotifications(req.auth!.account.id, req.auth!.user.id);
    const unreadCount = getUnreadNotificationCount(req.auth!.account.id, req.auth!.user.id);
    return { notifications, unreadCount };
  });

  // Notifications: Mark Single Read
  app.post('/api/v1/notifications/:id/read', { preHandler: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const updated = markNotificationRead(id, req.auth!.account.id);
    return { success: true, updated };
  });

  // Notifications: Mark All Read
  app.post('/api/v1/notifications/read-all', { preHandler: [requireAuth] }, async (req) => {
    const count = markAllNotificationsRead(req.auth!.account.id, req.auth!.user.id);
    return { success: true, count };
  });

  // Activity: CSV Export
  app.get('/api/v1/activity/export', { preHandler: [requireAuth] }, async (req, reply) => {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, action, actor_type, resource_type, resource_id, correlation_id, created_at, metadata
      FROM audit_events
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT 1000
    `).all(req.auth!.account.id) as Array<{
      id: string;
      action: string;
      actor_type: string;
      resource_type: string;
      resource_id: string;
      correlation_id: string;
      created_at: string;
      metadata: string;
    }>;

    const escapeCsv = (str: string) => `"${String(str || '').replace(/"/g, '""')}"`;
    let csv = 'id,action,actor_type,resource_type,resource_id,correlation_id,created_at,metadata\n';
    for (const r of rows) {
      csv += `${escapeCsv(r.id)},${escapeCsv(r.action)},${escapeCsv(r.actor_type)},${escapeCsv(r.resource_type)},${escapeCsv(r.resource_id)},${escapeCsv(r.correlation_id)},${escapeCsv(r.created_at)},${escapeCsv(r.metadata)}\n`;
    }

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="activity-${req.auth!.account.id}.csv"`)
      .send(csv);
  });

  // Admin Invoices: Refund
  const staffRefundSchema = z.object({
    amountMinorUnits: z.number().int().positive(),
    reason: z.string().trim().min(5).max(300),
  });

  app.post('/api/v1/admin/invoices/:id/refund', { preHandler: [requireAuth, requireStaffPermission('accounts:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = staffRefundSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }
    try {
      const result = processStaffRefund({
        invoiceId: id,
        amountMinorUnits: parse.data.amountMinorUnits,
        reason: parse.data.reason,
        staffUserId: req.auth!.user.id,
        ipAddress: req.ip,
      });
      return reply.send({ success: true, ...result });
    } catch (err: unknown) {
      return reply.status(422).send({ error: (err as Error).message });
    }
  });

  // Domains & DNS: Search
  app.get('/api/v1/domains/search', async (req) => {
    const query = ((req.query as Record<string, string>)?.query || '').trim();
    return { ...searchDomain(getDatabase(), query), catalog: TLD_CATALOG };
  });

  // Domains & DNS: TLD Catalog
  app.get('/api/v1/domains/tlds', async () => {
    return { tlds: TLD_CATALOG };
  });

  // Domains & DNS: List Zones (Tenant Isolated)
  app.get('/api/v1/domains/zones', { preHandler: [requireAuth] }, async (req) => {
    return { zones: listDomainZones(getDatabase(), req.auth!.account.id) };
  });

  // Domains & DNS: Create / Register Zone (Tenant Isolated)
  const createZoneSchema = z.object({
    domainName: z.string().trim().min(3).max(253),
    autoRenew: z.boolean().optional(),
    whoisPrivacy: z.boolean().optional(),
    periodYears: z.number().int().min(1).max(10).optional(),
  });

  app.post('/api/v1/domains/zones', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = createZoneSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }
    try {
      const zone = createDomainZone(getDatabase(), {
        accountId: req.auth!.account.id,
        domainName: parse.data.domainName,
        autoRenew: parse.data.autoRenew,
        whoisPrivacy: parse.data.whoisPrivacy,
        periodYears: parse.data.periodYears,
        actorUserId: req.auth!.user.id,
        ipAddress: req.ip,
      });
      return reply.status(201).send({ zone });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      return reply.status(400).send({ error: msg });
    }
  });

  // Domains & DNS: Get Zone Detail
  app.get('/api/v1/domains/zones/:zoneId', { preHandler: [requireAuth] }, async (req, reply) => {
    const { zoneId } = req.params as { zoneId: string };
    const zone = getDomainZone(getDatabase(), req.auth!.account.id, zoneId);
    if (!zone) {
      return reply.status(404).send({ error: 'Domain zone not found' });
    }
    const records = listDnsRecords(getDatabase(), req.auth!.account.id, zoneId);
    return { zone, records };
  });

  // Domains & DNS: List DNS Records for Zone
  app.get('/api/v1/domains/zones/:zoneId/records', { preHandler: [requireAuth] }, async (req, reply) => {
    const { zoneId } = req.params as { zoneId: string };
    try {
      const records = listDnsRecords(getDatabase(), req.auth!.account.id, zoneId);
      return { records };
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // Domains & DNS: Create DNS Record
  const dnsRecordSchema = z.object({
    recordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS']),
    name: z.string().trim().min(1).max(253),
    content: z.string().trim().min(1).max(2048),
    ttl: z.number().int().min(60).max(86400).optional(),
    priority: z.number().int().min(0).max(65535).optional(),
    weight: z.number().int().min(0).max(65535).optional(),
    port: z.number().int().min(1).max(65535).optional(),
  });

  app.post('/api/v1/domains/zones/:zoneId/records', { preHandler: [requireAuth] }, async (req, reply) => {
    const { zoneId } = req.params as { zoneId: string };
    const parse = dnsRecordSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }
    try {
      const record = createDnsRecord(
        getDatabase(),
        req.auth!.account.id,
        zoneId,
        parse.data,
        req.auth!.user.id,
        req.ip
      );
      return reply.status(201).send({ record });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const status = msg.startsWith('NOT_FOUND') ? 404 : 400;
      return reply.status(status).send({ error: msg });
    }
  });

  // Domains & DNS: Update DNS Record
  const updateDnsRecordSchema = dnsRecordSchema.partial();

  app.put('/api/v1/domains/zones/:zoneId/records/:recordId', { preHandler: [requireAuth] }, async (req, reply) => {
    const { zoneId, recordId } = req.params as { zoneId: string; recordId: string };
    const parse = updateDnsRecordSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }
    try {
      const record = updateDnsRecord(
        getDatabase(),
        req.auth!.account.id,
        zoneId,
        recordId,
        parse.data,
        req.auth!.user.id,
        req.ip
      );
      return { record };
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const status = msg.startsWith('NOT_FOUND') ? 404 : 400;
      return reply.status(status).send({ error: msg });
    }
  });

  // Domains & DNS: Delete DNS Record
  app.delete('/api/v1/domains/zones/:zoneId/records/:recordId', { preHandler: [requireAuth] }, async (req, reply) => {
    const { zoneId, recordId } = req.params as { zoneId: string; recordId: string };
    try {
      deleteDnsRecord(getDatabase(), req.auth!.account.id, zoneId, recordId, req.auth!.user.id, req.ip);
      return { success: true };
    } catch (err: unknown) {
      const msg = (err as Error).message;
      const status = msg.startsWith('NOT_FOUND') ? 404 : 400;
      return reply.status(status).send({ error: msg });
    }
  });

  // Tickets: List (Tenant Isolated!)
  app.get('/api/v1/tickets', { preHandler: [requireAuth] }, async (req) => {
    return { tickets: listTickets(req.auth!.account.id, getDatabase()) };
  });

  // Tickets: Create Ticket
  const createTicketSchema = z.object({
    subject: z.string().trim().min(3).max(160),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    message: z.string().trim().min(5).max(10_000),
  });

  app.post('/api/v1/tickets', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = createTicketSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    const created = createTicket({
      accountId: req.auth!.account.id,
      userId: req.auth!.user.id,
      subject: parse.data.subject,
      priority: parse.data.priority,
      message: parse.data.message,
      ipAddress: req.ip,
    }, getDatabase());
    return reply.status(201).send(created);
  });

  // Tickets: Get Ticket with Messages
  app.get('/api/v1/tickets/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const thread = getTicketThread(id, req.auth!.account.id, getDatabase());
    if (!thread) return reply.status(404).send({ error: 'Ticket not found' });
    return thread;
  });

  // Tickets: Add Message
  const addMessageSchema = z.object({
    body: z.string().trim().min(1).max(10_000),
  });

  app.post('/api/v1/tickets/:id/messages', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = addMessageSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Message body cannot be empty' });
    }

    const result = addCustomerReply({
      ticketId: id,
      accountId: req.auth!.account.id,
      userId: req.auth!.user.id,
      body: parse.data.body,
      ipAddress: req.ip,
    }, getDatabase());
    if (result.outcome === 'NOT_FOUND') return reply.status(404).send({ error: 'Ticket not found' });
    if (result.outcome === 'CLOSED') return reply.status(409).send({ error: 'Closed tickets cannot receive new replies.' });
    return reply.status(201).send({ messageId: result.messageId });
  });

  // Tickets: Upload Attachment
  const uploadAttachmentSchema = z.object({
    filename: z.string().min(1).max(255),
    contentType: z.string().min(3).max(100),
    dataBase64: z.string().min(1),
    messageId: z.string().optional(),
  });

  app.post('/api/v1/tickets/:id/attachments', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = uploadAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Filename, contentType, and dataBase64 are required.' });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(parsed.data.dataBase64, 'base64');
    } catch {
      return reply.status(400).send({ error: 'Invalid base64 payload.' });
    }

    try {
      const record = addTicketAttachment({
        ticketId: id,
        messageId: parsed.data.messageId,
        accountId: req.auth!.account.id,
        userId: req.auth!.user.id,
        filename: parsed.data.filename,
        contentType: parsed.data.contentType,
        buffer,
        ipAddress: req.ip,
      }, getDatabase());

      return reply.status(201).send({ attachment: record });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg === 'Ticket not found.') return reply.status(404).send({ error: msg });
      return reply.status(400).send({ error: msg });
    }
  });

  // Tickets: List Attachments
  app.get('/api/v1/tickets/:id/attachments', { preHandler: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const attachments = listTicketAttachments(id, req.auth!.account.id, getDatabase());
    return { attachments };
  });

  // Tickets: Download Attachment
  app.get('/api/v1/tickets/:id/attachments/:attachmentId', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id, attachmentId } = req.params as { id: string; attachmentId: string };
    const isStaff = hasStaffPermission(req.auth!.user.id, 'tickets:read', getDatabase());
    const result = getTicketAttachment(id, attachmentId, isStaff ? null : req.auth!.account.id, getDatabase());
    if (!result) return reply.status(404).send({ error: 'Attachment not found.' });

    reply.header('Content-Type', result.record.content_type);
    reply.header('Content-Disposition', `attachment; filename="${result.record.filename}"`);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Length', result.record.byte_size);
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(result.buffer);
  });

  // Tickets: AI Diagnostic Triage & Reply Drafting (Customer self-service, tenant isolated)
  app.post('/api/v1/tickets/:id/ai-assist', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const triage = await runTicketTriage(
        {
          ticketId: id,
          accountId: req.auth!.account.id,
          isStaff: false,
          userId: req.auth!.user.id,
        },
        getDatabase(),
        aiAdapter
      );
      return { triage };
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('not found') || msg.includes('unauthorized')) {
        return reply.status(404).send({ error: msg });
      }
      return reply.status(500).send({ error: msg });
    }
  });

  // Admin Tickets: Staff Upload Attachment
  app.post('/api/v1/admin/tickets/:ticketId/attachments', { preHandler: [requireAuth, requireStaffPermission('tickets:manage')] }, async (req, reply) => {
    const { ticketId } = req.params as { ticketId: string };
    const parsed = uploadAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Filename, contentType, and dataBase64 are required.' });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(parsed.data.dataBase64, 'base64');
    } catch {
      return reply.status(400).send({ error: 'Invalid base64 payload.' });
    }

    try {
      const record = addTicketAttachment({
        ticketId,
        messageId: parsed.data.messageId,
        accountId: null,
        userId: req.auth!.user.id,
        filename: parsed.data.filename,
        contentType: parsed.data.contentType,
        buffer,
        ipAddress: req.ip,
      }, getDatabase());

      return reply.status(201).send({ attachment: record });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg === 'Ticket not found.') return reply.status(404).send({ error: msg });
      return reply.status(400).send({ error: msg });
    }
  });

  // Global Scoped Search (Ctrl+K / ⌘K)
  app.get('/api/v1/search', { preHandler: [requireAuth] }, async (req) => {
    const query = typeof req.query === 'object' && req.query !== null && 'q' in req.query
      ? String((req.query as { q?: unknown }).q || '').trim().slice(0, 64)
      : '';

    const db = getDatabase();
    const accountId = req.auth!.account.id;
    const isStaff = Boolean(getStaffAccess(req.auth!.user.id, db) && req.auth!.session.mfaVerifiedAt);

    const clientPages = [
      { id: 'nav-servers', title: 'Servers & Instances', category: 'Navigation', icon: 'server', path: '/app', shortcut: 'G S' },
      { id: 'nav-deploy', title: 'Deploy New Instance', category: 'Navigation', icon: 'rocket-01', path: '/app/deploy', shortcut: 'G D' },
      { id: 'nav-billing', title: 'Invoices & Billing', category: 'Navigation', icon: 'credit-card', path: '/app/billing', shortcut: 'G B' },
      { id: 'nav-tickets', title: 'Support Tickets', category: 'Navigation', icon: 'bubble-chat', path: '/app/support', shortcut: 'G T' },
      { id: 'nav-audit', title: 'Security Audit Trail', category: 'Navigation', icon: 'shield-01', path: '/app/activity', shortcut: 'G A' },
      { id: 'nav-settings', title: 'Security, MFA & Team', category: 'Navigation', icon: 'settings-01', path: '/app/settings', shortcut: 'G ,' },
      { id: 'nav-status', title: 'System Status & Incidents', category: 'Navigation', icon: 'activity', path: '/status' },
    ];

    const actions = [
      { id: 'act-new-ticket', title: 'Open New Support Ticket', category: 'Actions', icon: 'bubble-chat', action: 'new_ticket' },
      { id: 'act-deploy', title: 'Launch Server Wizard', category: 'Actions', icon: 'rocket-01', action: 'deploy' },
      { id: 'act-theme', title: 'Toggle Light / Dark Theme', category: 'Actions', icon: 'moon-01', action: 'toggle_theme' },
      { id: 'act-passkeys', title: 'Manage WebAuthn Passkeys', category: 'Actions', icon: 'key-01', action: 'passkeys' },
    ];

    const adminPages = isStaff ? [
      { id: 'adm-overview', title: 'Admin: Operations Overview', category: 'Admin Control Plane', icon: 'home-01', path: '/admin' },
      { id: 'adm-accounts', title: 'Admin: Customer Accounts', category: 'Admin Control Plane', icon: 'user-group', path: '/admin/accounts' },
      { id: 'adm-services', title: 'Admin: Service Inventory', category: 'Admin Control Plane', icon: 'server', path: '/admin/services' },
      { id: 'adm-tickets', title: 'Admin: Support Queue', category: 'Admin Control Plane', icon: 'bubble-chat', path: '/admin/tickets' },
      { id: 'adm-audit', title: 'Admin: Global Audit Trail', category: 'Admin Control Plane', icon: 'shield-01', path: '/admin/audit' },
      { id: 'adm-staff', title: 'Admin: Staff Access & Roles', category: 'Admin Control Plane', icon: 'users', path: '/admin/staff' },
    ] : [];

    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;

    const services = query ? (db.prepare(`
      SELECT id, name, identifier, plan_name, ip_address, runtime_state
      FROM services
      WHERE account_id = ? AND (name LIKE ? ESCAPE '\\' OR identifier LIKE ? ESCAPE '\\' OR coalesce(ip_address, '') LIKE ? ESCAPE '\\' OR plan_name LIKE ? ESCAPE '\\')
      LIMIT 5
    `).all(accountId, like, like, like, like) as Array<{ id: string; name: string; identifier: string | null; plan_name: string; ip_address: string | null; runtime_state: string }>) : [];

    const tickets = query ? (db.prepare(`
      SELECT id, subject, priority, status, updated_at
      FROM tickets
      WHERE account_id = ? AND (subject LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')
      LIMIT 5
    `).all(accountId, like, like) as Array<{ id: string; subject: string; priority: string; status: string; updated_at: string }>) : [];

    const invoices = query ? (db.prepare(`
      SELECT id, invoice_number, total_minor_units, currency, status
      FROM invoices
      WHERE account_id = ? AND (invoice_number LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')
      LIMIT 5
    `).all(accountId, like, like) as Array<{ id: string; invoice_number: string; total_minor_units: number; currency: string; status: string }>) : [];

    const qLower = query.toLowerCase();
    const matchedPages = clientPages.filter(p => !qLower || p.title.toLowerCase().includes(qLower));
    const matchedActions = actions.filter(a => !qLower || a.title.toLowerCase().includes(qLower));
    const matchedAdmin = adminPages.filter(p => !qLower || p.title.toLowerCase().includes(qLower));

    const formattedServices = services.map(s => ({
      id: s.id,
      title: s.name,
      subtitle: `${s.plan_name} · ${s.ip_address || s.identifier || s.id}`,
      status: s.runtime_state,
      category: 'Services',
      icon: 'server',
      path: '/app',
      serviceId: s.id,
    }));

    const formattedTickets = tickets.map(t => ({
      id: t.id,
      title: t.subject,
      subtitle: `Ticket ${t.id} · Updated ${t.updated_at}`,
      status: `${t.priority} · ${t.status}`,
      category: 'Tickets',
      icon: 'bubble-chat',
      path: '/app/support',
      ticketId: t.id,
    }));

    const formattedInvoices = invoices.map(i => ({
      id: i.id,
      title: `Invoice #${i.invoice_number}`,
      subtitle: `€${(i.total_minor_units / 100).toFixed(2)} ${i.currency}`,
      status: i.status,
      category: 'Invoices',
      icon: 'credit-card',
      path: '/app/billing',
      invoiceId: i.id,
    }));

    const payload = {
      pages: matchedPages,
      actions: matchedActions,
      adminPages: matchedAdmin,
      services: formattedServices,
      tickets: formattedTickets,
      invoices: formattedInvoices,
    };

    return {
      query,
      ...payload,
      results: payload,
    };
  });

  // Audit Log: List (Tenant Isolated!)
  app.get('/api/v1/audit', { preHandler: [requireAuth] }, async (req) => {
    const db = getDatabase();
    const logs = db.prepare(`
      SELECT ae.id, ae.actor_user_id, ae.actor_type, ae.action, ae.resource_type,
             ae.resource_id, ae.ip_address, ae.correlation_id, ae.created_at,
             u.name as actor_name
      FROM audit_events ae
      LEFT JOIN users u ON u.id = ae.actor_user_id
      WHERE ae.account_id = ?
      ORDER BY ae.created_at DESC
      LIMIT 50
    `).all(req.auth!.account.id);
    return { logs };
  });

  // Legacy instant-deploy is deliberately disabled: it used to fabricate payment
  // settlement and invoke the in-memory provider from a customer request.
  app.post('/api/v1/orders/instant-deploy', { preHandler: [requireAuth, requireRole('OWNER', 'TECH_ADMIN')] }, async (req, reply) => {
    void req;
    return reply.status(410).send({ error: 'Instant deployment is not an operational API.', code: 'LEGACY_FLOW_DISABLED' });
  });

  const adminListSchema = z.object({
    q: z.string().trim().max(100).optional().default(''),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
    offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
  });

  const parseAdminList = (query: unknown) => {
    const parsed = adminListSchema.safeParse(query);
    return parsed.success ? parsed.data : null;
  };

  // Admin: operational workspace (persisted permission + MFA; mutations also require recent step-up).
  app.get('/api/v1/admin/overview', { preHandler: [requireAuth, requireStaff] }, async () => {
    return getAdminOverview(getDatabase());
  });

  app.get('/api/v1/admin/me', { preHandler: [requireAuth, requireStaff] }, async (req) => {
    return { staff: getStaffAccess(req.auth!.user.id, getDatabase()) };
  });

  app.get('/api/v1/admin/accounts', { preHandler: [requireAuth, requireStaffPermission('accounts:read')] }, async (req, reply) => {
    const options = parseAdminList(req.query);
    if (!options) return reply.status(400).send({ error: 'Invalid list query.' });
    return listAdminAccounts(getDatabase(), { query: options.q, limit: options.limit, offset: options.offset });
  });

  app.get('/api/v1/admin/accounts/:accountId', { preHandler: [requireAuth, requireStaffPermission('accounts:read')] }, async (req, reply) => {
    const params = z.object({ accountId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: 'Account ID is required.' });
    const detail = getAdminAccountDetail(params.data.accountId, getDatabase());
    if (!detail) return reply.status(404).send({ error: 'Account not found.' });
    return detail;
  });

  app.patch('/api/v1/admin/accounts/:accountId/status', { preHandler: [requireAuth, requireStaffPermission('accounts:manage'), requireRecentStepUp] }, async (req, reply) => {
    const params = z.object({ accountId: z.string().min(1) }).safeParse(req.params);
    const body = z.object({
      status: z.enum(['ACTIVE', 'LOCKED', 'FLAGGED_FRAUD']),
      reason: z.string().trim().min(5).max(500),
    }).safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Valid status and reason (min 5 chars) are required.' });
    try {
      updateAccountStatus({
        accountId: params.data.accountId,
        status: body.data.status,
        reason: body.data.reason,
        actorUserId: req.auth!.user.id,
        ipAddress: req.ip,
      }, getDatabase());
      return reply.send({ success: true, accountId: params.data.accountId, status: body.data.status });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/v1/admin/services', { preHandler: [requireAuth, requireStaffPermission('services:read')] }, async (req, reply) => {
    const options = parseAdminList(req.query);
    if (!options) return reply.status(400).send({ error: 'Invalid list query.' });
    return listAdminServices(getDatabase(), { query: options.q, limit: options.limit, offset: options.offset });
  });

  app.get('/api/v1/admin/orders', { preHandler: [requireAuth, requireStaffPermission('accounts:read')] }, async (req, reply) => {
    const options = parseAdminList(req.query);
    if (!options) return reply.status(400).send({ error: 'Invalid list query.' });
    return listAdminOrders(getDatabase(), { query: options.q, limit: options.limit, offset: options.offset });
  });

  app.get('/api/v1/admin/invoices', { preHandler: [requireAuth, requireStaffPermission('accounts:read')] }, async (req, reply) => {
    const options = parseAdminList(req.query);
    if (!options) return reply.status(400).send({ error: 'Invalid list query.' });
    return listAdminInvoices(getDatabase(), { query: options.q, limit: options.limit, offset: options.offset });
  });

  app.get('/api/v1/admin/credit-notes', { preHandler: [requireAuth, requireStaffPermission('accounts:read')] }, async (req, reply) => {
    const options = parseAdminList(req.query);
    if (!options) return reply.status(400).send({ error: 'Invalid list query.' });
    return listAdminCreditNotes(getDatabase(), { query: options.q, limit: options.limit, offset: options.offset });
  });

  app.get('/api/v1/admin/capacity', { preHandler: [requireAuth, requireStaffPermission('services:read')] }, async () => {
    return getAdminCapacityPools(getDatabase());
  });

  // Admin Services: Suspend
  const adminServiceActionSchema = z.object({
    reason: z.string().trim().min(3).max(300),
  });

  app.post('/api/v1/admin/services/:id/suspend', { preHandler: [requireAuth, requireStaffPermission('services:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = adminServiceActionSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    try {
      await suspendService({
        serviceId: id,
        reason: parse.data.reason,
        actorUserId: req.auth!.user.id,
        actorType: 'STAFF',
      });
      return { success: true };
    } catch (err: unknown) {
      return reply.status(422).send({ error: (err as Error).message });
    }
  });

  // Admin Services: Unsuspend
  app.post('/api/v1/admin/services/:id/unsuspend', { preHandler: [requireAuth, requireStaffPermission('services:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await unsuspendService({
        serviceId: id,
        actorUserId: req.auth!.user.id,
        actorType: 'STAFF',
      });
      return { success: true };
    } catch (err: unknown) {
      return reply.status(422).send({ error: (err as Error).message });
    }
  });

  // Admin Services: Terminate
  app.post('/api/v1/admin/services/:id/terminate', { preHandler: [requireAuth, requireStaffPermission('services:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = adminServiceActionSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    try {
      await terminateService({
        serviceId: id,
        reason: parse.data.reason,
        actorUserId: req.auth!.user.id,
        actorType: 'STAFF',
      });
      return { success: true };
    } catch (err: unknown) {
      return reply.status(422).send({ error: (err as Error).message });
    }
  });

  app.get('/api/v1/admin/tickets', { preHandler: [requireAuth, requireStaffPermission('tickets:read')] }, async (req, reply) => {
    const options = parseAdminList(req.query);
    if (!options) return reply.status(400).send({ error: 'Invalid list query.' });
    return listAdminTickets(getDatabase(), { query: options.q, limit: options.limit, offset: options.offset });
  });

  app.get('/api/v1/admin/tickets/:ticketId', { preHandler: [requireAuth, requireStaffPermission('tickets:read')] }, async (req, reply) => {
    const params = z.object({ ticketId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: 'Ticket ID is required.' });
    const detail = getAdminTicketDetail(params.data.ticketId, getDatabase());
    if (!detail) return reply.status(404).send({ error: 'Ticket not found.' });
    return detail;
  });

  app.post('/api/v1/admin/tickets/:ticketId/reply', { preHandler: [requireAuth, requireStaffPermission('tickets:manage')] }, async (req, reply) => {
    const params = z.object({ ticketId: z.string().min(1) }).safeParse(req.params);
    const body = z.object({
      body: z.string().trim().min(2).max(10_000),
      isInternalNote: z.boolean().optional().default(false),
    }).safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Message body (min 2 chars) is required.' });
    try {
      const result = addStaffTicketReply({
        ticketId: params.data.ticketId,
        staffUserId: req.auth!.user.id,
        body: body.data.body,
        isInternalNote: body.data.isInternalNote,
        ipAddress: req.ip,
      }, getDatabase());
      return reply.status(201).send({ success: true, messageId: result.messageId });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.patch('/api/v1/admin/tickets/:ticketId/status', { preHandler: [requireAuth, requireStaffPermission('tickets:manage')] }, async (req, reply) => {
    const params = z.object({ ticketId: z.string().min(1) }).safeParse(req.params);
    const body = z.object({
      status: z.enum(['OPEN', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED']),
    }).safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Valid ticket status is required.' });
    try {
      updateTicketStatus({
        ticketId: params.data.ticketId,
        status: body.data.status,
        actorUserId: req.auth!.user.id,
        ipAddress: req.ip,
      }, getDatabase());
      return reply.send({ success: true, ticketId: params.data.ticketId, status: body.data.status });
    } catch (err: unknown) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // Admin Tickets: AI Staff Assistance & Draft Generation
  app.post('/api/v1/admin/tickets/:ticketId/ai-assist', { preHandler: [requireAuth, requireStaffPermission('tickets:manage')] }, async (req, reply) => {
    const { ticketId } = req.params as { ticketId: string };
    try {
      const triage = await runTicketTriage(
        {
          ticketId,
          accountId: null,
          isStaff: true,
          userId: req.auth!.user.id,
        },
        getDatabase(),
        aiAdapter
      );
      return { triage };
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('not found') || msg.includes('unauthorized')) {
        return reply.status(404).send({ error: msg });
      }
      return reply.status(500).send({ error: msg });
    }
  });

  app.get('/api/v1/admin/audit', { preHandler: [requireAuth, requireStaffPermission('audit:read')] }, async (req, reply) => {
    const options = parseAdminList(req.query);
    if (!options) return reply.status(400).send({ error: 'Invalid list query.' });
    return listAdminAudit(getDatabase(), { query: options.q, limit: options.limit, offset: options.offset });
  });

  app.get('/api/v1/admin/staff', { preHandler: [requireAuth, requireStaffPermission('staff:read')] }, async (req, reply) => {
    const options = parseAdminList(req.query);
    if (!options) return reply.status(400).send({ error: 'Invalid list query.' });
    return listAdminStaff(getDatabase(), { query: options.q, limit: options.limit, offset: options.offset });
  });

  const staffChangeSchema = z.object({
    email: z.string().email().optional(),
    role: z.enum(STAFF_ROLES),
    status: z.enum(['ACTIVE', 'REVOKED']).default('ACTIVE'),
    reason: z.string().trim().min(8).max(500),
  });

  app.post('/api/v1/admin/staff', { preHandler: [requireAuth, requireStaffPermission('staff:manage'), requireRecentStepUp] }, async (req, reply) => {
    const parsed = staffChangeSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.email) return reply.status(400).send({ error: 'Email, role and an audit reason are required.' });
    const db = getDatabase();
    const target = db.prepare("SELECT id FROM users WHERE email = ? AND status = 'ACTIVE'").get(parsed.data.email.toLowerCase()) as { id: string } | undefined;
    if (!target) return reply.status(404).send({ error: 'Active identity not found.' });
    const hasMfa = db.prepare("SELECT 1 FROM mfa_factors WHERE user_id = ? AND type = 'TOTP' AND is_confirmed = 1").get(target.id);
    if (!hasMfa) return reply.status(409).send({ error: 'Staff access requires confirmed multi-factor authentication.', code: 'TARGET_MFA_REQUIRED' });
    db.transaction(() => {
      db.prepare(`INSERT INTO staff_memberships (user_id, role, status, created_by_user_id)
        VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, status = excluded.status,
        updated_at = datetime('now', 'utc')`).run(target.id, parsed.data.role, parsed.data.status, req.auth!.user.id);
      db.prepare('UPDATE users SET is_staff = ? WHERE id = ?').run(parsed.data.status === 'ACTIVE' ? 1 : 0, target.id);
      db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
        VALUES (?, NULL, ?, 'STAFF', 'staff.membership_changed', 'staff_membership', ?, ?, ?, ?)`)
        .run(generateId('aud'), req.auth!.user.id, target.id, req.ip, generateId('cor'), JSON.stringify({ role: parsed.data.role, status: parsed.data.status, reason: parsed.data.reason }));
    })();
    return reply.status(201).send({ userId: target.id, role: parsed.data.role, status: parsed.data.status });
  });

  app.patch('/api/v1/admin/staff/:userId', { preHandler: [requireAuth, requireStaffPermission('staff:manage'), requireRecentStepUp] }, async (req, reply) => {
    const params = z.object({ userId: z.string().regex(/^usr_[a-f0-9]{24}$/) }).safeParse(req.params);
    const parsed = staffChangeSchema.omit({ email: true }).safeParse(req.body);
    if (!params.success || !parsed.success) return reply.status(400).send({ error: 'Role, status and an audit reason are required.' });
    if (params.data.userId === req.auth!.user.id) return reply.status(409).send({ error: 'Self-modification is blocked to prevent administrative lockout.' });
    const db = getDatabase();
    const current = db.prepare('SELECT role, status FROM staff_memberships WHERE user_id = ?').get(params.data.userId) as { role: string; status: string } | undefined;
    if (!current) return reply.status(404).send({ error: 'Staff membership not found.' });
    if (current.role === 'OWNER' && (parsed.data.role !== 'OWNER' || parsed.data.status !== 'ACTIVE')) {
      const owners = db.prepare("SELECT count(*) AS count FROM staff_memberships WHERE role = 'OWNER' AND status = 'ACTIVE'").get() as { count: number };
      if (owners.count <= 1) return reply.status(409).send({ error: 'The final active owner cannot be removed.' });
    }
    db.transaction(() => {
      db.prepare("UPDATE staff_memberships SET role = ?, status = ?, updated_at = datetime('now', 'utc') WHERE user_id = ?")
        .run(parsed.data.role, parsed.data.status, params.data.userId);
      db.prepare('UPDATE users SET is_staff = ? WHERE id = ?').run(parsed.data.status === 'ACTIVE' ? 1 : 0, params.data.userId);
      db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
        VALUES (?, NULL, ?, 'STAFF', 'staff.membership_changed', 'staff_membership', ?, ?, ?, ?)`)
        .run(generateId('aud'), req.auth!.user.id, params.data.userId, req.ip, generateId('cor'), JSON.stringify({ from: current, role: parsed.data.role, status: parsed.data.status, reason: parsed.data.reason }));
    })();
    return { userId: params.data.userId, role: parsed.data.role, status: parsed.data.status };
  });

  // --- Admin Status & Incident Management ---
  const incidentCreateSchema = z.object({
    title: z.string().trim().min(3).max(200),
    impact: z.enum(['NONE', 'MINOR', 'MAJOR', 'CRITICAL']),
    status: z.enum(['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED']),
    message: z.string().trim().min(5).max(2000),
    affectedComponentIds: z.array(z.string()).optional(),
    affectedComponentStatus: z.enum(['OPERATIONAL', 'DEGRADED', 'PARTIAL_OUTAGE', 'MAJOR_OUTAGE', 'MAINTENANCE']).optional(),
  });

  app.post('/api/v1/admin/incidents', { preHandler: [requireAuth, requireStaffPermission('services:manage')] }, async (req, reply) => {
    const parsed = incidentCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Valid incident details required', details: parsed.error.issues });
    const incident = createIncident(parsed.data, req.auth!.user.id, getDatabase());
    return reply.status(201).send(incident);
  });

  const incidentUpdateSchema = z.object({
    status: z.enum(['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED']),
    message: z.string().trim().min(5).max(2000),
    impact: z.enum(['NONE', 'MINOR', 'MAJOR', 'CRITICAL']).optional(),
  });

  app.post('/api/v1/admin/incidents/:id/updates', { preHandler: [requireAuth, requireStaffPermission('services:manage')] }, async (req, reply) => {
    const params = z.object({ id: z.string() }).safeParse(req.params);
    const parsed = incidentUpdateSchema.safeParse(req.body);
    if (!params.success || !parsed.success) return reply.status(400).send({ error: 'Valid incident update details required' });
    try {
      const update = updateIncident(params.data.id, parsed.data, req.auth!.user.id, getDatabase());
      return reply.status(200).send(update);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message || 'Incident not found' });
    }
  });

  const componentStatusSchema = z.object({
    status: z.enum(['OPERATIONAL', 'DEGRADED', 'PARTIAL_OUTAGE', 'MAJOR_OUTAGE', 'MAINTENANCE']),
  });

  app.patch('/api/v1/admin/components/:id', { preHandler: [requireAuth, requireStaffPermission('services:manage')] }, async (req, reply) => {
    const params = z.object({ id: z.string() }).safeParse(req.params);
    const parsed = componentStatusSchema.safeParse(req.body);
    if (!params.success || !parsed.success) return reply.status(400).send({ error: 'Valid component status required' });
    try {
      updateComponentStatus(params.data.id, parsed.data.status, req.auth!.user.id, getDatabase());
      return reply.status(200).send({ id: params.data.id, status: parsed.data.status });
    } catch (err: any) {
      return reply.status(404).send({ error: err.message || 'Component not found' });
    }
  });

  // --- Admin Subscription Renewal & Dunning Trigger ---
  app.post('/api/v1/admin/billing/process-renewals', { preHandler: [requireAuth, requireStaffPermission('accounts:manage')] }, async (_req, reply) => {
    const result = await processSubscriptionRenewals(getDatabase());
    return reply.status(200).send(result);
  });

  return app;
}
