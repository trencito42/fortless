import { updateProfile, getBillingProfile, saveBillingProfile, ProfileValidationError } from './modules/identity/profile.js';
import { createGameTools } from './modules/provisioning/game-tools.js';
import { listProfiles, saveProfile, deleteProfile, ProfileError } from './modules/provisioning/game-profiles.js';
import { getProviderAdapter } from './modules/outbox/worker.js';
import { createServiceSharing, SharingError } from './modules/provisioning/service-members.js';
import { getServiceAccess } from './modules/provisioning/service-access.js';
import { touchService, relinkService, RelinkError } from './modules/provisioning/runtime-sync.js';
import { createServerPanelApi } from './modules/provisioning/server-panel.js';
import { createFilesApi } from './modules/provisioning/files.js';
import { getServiceConsoleCredentials, ConsoleAccessError, withAccountClientKey } from './modules/provisioning/console.js';
import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { registerOidcRoutes } from './modules/oidc/routes.js';
import { panelLoginUrl } from './modules/oidc/oidc.js';
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
  beginTotpReplacement,
  confirmTotpEnrollment,
  regenerateRecoveryCodes,
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
  DEVICE_COOKIE_NAME,
  generateDeviceId,
  isValidDeviceId,
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
  relyingPartyId,
} from './modules/identity/passkeys.js';
import {
  getPublishedPlans,
  listCategories,
  listProducts,
  listAdminCatalog,
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
import { PterodactylHttpAdapter, ProviderError } from './modules/provisioning/adapter.js';
import { createQuote } from './modules/pricing/quote.js';
import { processCheckout } from './modules/checkout/checkout.js';
import { verifyStripeSignature, ingestPSPWebhook, processStaffRefund } from './modules/payments/webhooks.js';
import {
  getServiceDetail,
  executeServicePowerAction,
  listServiceActivity,
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
import { getNotificationPreferences, saveNotificationPreferences } from './modules/notifications/preferences.js';
import {
  getAdminOverview,
  listAdminAccounts,
  getAdminAccountDetail,
  updateAccountStatus,
  listAdminServices,
  getAdminServiceDetail,
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
  resolveTicket,
  addTicketAttachment,
  listTicketAttachments,
  getTicketAttachment,
  toPublicAttachment,
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

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  // 1. Raw body capture plugin for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      const buffer = body as Buffer;
      const rawString = buffer.toString('utf8');
      req.rawBody = rawString;
      if (!rawString.trim()) {
        return done(null, {});
      }
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

  const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
  const resolveDeviceId = (req: FastifyRequest, reply?: FastifyReply): string => {
    const headerDeviceId = req.headers['x-device-id'];
    const cookieDeviceId = req.cookies[DEVICE_COOKIE_NAME];
    const candidate = (typeof headerDeviceId === 'string' && headerDeviceId.trim())
      ? headerDeviceId.trim()
      : cookieDeviceId;

    let deviceId: string;
    if (isValidDeviceId(candidate)) {
      deviceId = candidate;
    } else {
      deviceId = generateDeviceId();
    }

    if (reply && req.cookies[DEVICE_COOKIE_NAME] !== deviceId) {
      reply.setCookie(DEVICE_COOKIE_NAME, deviceId, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
    }

    return deviceId;
  };

  // 3. Auth Hook Middleware
  app.decorateRequest('auth', undefined);
  app.addHook('preHandler', async (req, reply) => {
    resolveDeviceId(req, reply);
    let token = req.cookies['fortless_session'];
    const authHeader = req.headers['authorization'];
    if (!token && authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (token) {
      const context = authenticateSession(token, getDatabase(), req.ip);
      if (context) {
        req.auth = context;
      }
    }
  });

  app.addHook('preHandler', async (req, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.url.startsWith('/api/v1/webhooks/') || req.url.split('?')[0] === '/oidc/token') return;
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
    const allowedViews = new Set(['services', 'deploy', 'billing', 'support', 'activity', 'settings', 'domains']);
    if (!allowedViews.has(view)) return reply.redirect('/app');
    if (!req.auth) return reply.redirect(`/login?next=${encodeURIComponent(`/app/${view}`)}`);
    const appPath = path.join(publicDir, 'app.html');
    if (fs.existsSync(appPath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('app.html'));
    return reply.redirect('/');
  });

  const SERVICE_TABS = new Set(['overview', 'console', 'files', 'game', 'databases', 'schedules', 'backups', 'network', 'startup', 'settings', 'users', 'allocation', 'activity']);
  const SETTINGS_TABS = new Set(['profile', 'security', 'team', 'sessions']);
  const serveServicePage = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
    const { id, tab } = req.params as { id: string; tab?: string };
    if (tab !== undefined && !SERVICE_TABS.has(tab)) return reply.redirect(`/app/services/${encodeURIComponent(id)}`);
    const db = getDatabase();
    const service = getServiceAccess(db, { serviceId: id, accountId: req.auth.account.id, userId: req.auth.user.id, role: req.auth.membership.role });
    if (!service) return reply.redirect('/app/services');
    const appPath = path.join(publicDir, 'app.html');
    if (fs.existsSync(appPath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('app.html'));
    return reply.redirect('/app');
  };
  app.get('/app/services/:id', serveServicePage);
  app.get('/app/services/:id/:tab', serveServicePage);
  app.get('/app/settings/:tab', async (req, reply) => {
    const { tab } = req.params as { tab: string };
    if (!SETTINGS_TABS.has(tab)) return reply.redirect('/app/settings');
    if (!req.auth) return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
    const appPath = path.join(publicDir, 'app.html');
    if (fs.existsSync(appPath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('app.html'));
    return reply.redirect('/app');
  });

  app.get('/app/support/:id', async (req, reply) => {
    if (!req.auth) return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
    const { id } = req.params as { id: string };
    if (id !== 'new') {
      const ticket = getDatabase().prepare('SELECT id FROM tickets WHERE id = ? AND account_id = ?').get(id, req.auth.account.id);
      if (!ticket) return reply.redirect('/app/support');
    }
    const appPath = path.join(publicDir, 'app.html');
    if (fs.existsSync(appPath)) return reply.type('text/html').header('Cache-Control', 'no-store').send(renderHtml('app.html'));
    return reply.redirect('/app/support');
  });

  registerOidcRoutes(app);

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
      return reply.type('text/html').header('Cache-Control', 'private, no-cache').send(html);
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
      return reply.type('text/html').header('Cache-Control', 'private, no-cache').send(html);
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
    const viewPermissions: Record<string, StaffPermission> = {
      accounts: 'accounts:read', services: 'services:read', orders: 'accounts:read', billing: 'accounts:read',
      infrastructure: 'services:read', catalog: 'catalog:read', tickets: 'tickets:read', audit: 'audit:read',
      staff: 'staff:read', status: 'services:read', settings: 'admin:access',
    };
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
    if (capability === 'provisioning') {
      return config.PROVIDER_MODE !== 'disabled'
        && Boolean(config.PTERODACTYL_PANEL_URL)
        && Boolean(config.PTERODACTYL_API_KEY)
        && (config.PROVIDER_VERIFICATION_TIER === 'SANDBOX_VERIFIED' || config.PROVIDER_VERIFICATION_TIER === 'PRODUCTION_VERIFIED');
    }
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
      verification: config.PAYMENTS_MODE === 'stripe_test' ? 'SANDBOX_VERIFIED' : (config.PAYMENTS_MODE === 'stripe_live' ? (config.PROVIDER_VERIFICATION_TIER === 'PRODUCTION_VERIFIED' ? 'PRODUCTION_VERIFIED' : 'CONFIGURED') : 'NOT_STARTED'),
    },
    provisioning: {
      enabled: operationalCapability('provisioning'),
      mode: config.PROVIDER_MODE,
      verification: config.PROVIDER_VERIFICATION_TIER,
    },
    panelSso: {
      enabled: panelLoginUrl() !== null,
    },
    transactionalEmail: {
      enabled: operationalCapability('email'),
      mode: config.EMAIL_MODE,
      verification: config.EMAIL_MODE === 'sandbox' ? 'SANDBOX_VERIFIED' : (config.EMAIL_MODE === 'live' ? (config.PROVIDER_VERIFICATION_TIER === 'PRODUCTION_VERIFIED' ? 'PRODUCTION_VERIFIED' : 'CONFIGURED') : 'NOT_STARTED'),
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

      const emailDelivery = (config.EMAIL_MODE === 'live' || config.EMAIL_MODE === 'sandbox')
        ? 'QUEUED'
        : 'CONFIGURATION_REQUIRED';

      return reply.status(201).send({
        user: result.user,
        account: result.account,
        requiresEmailVerification: true,
        emailDelivery,
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
      const deviceId = resolveDeviceId(req, reply);
      const result = loginUser({
        email: parse.data.email,
        password: parse.data.password,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'unknown',
        deviceId,
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
      const deviceId = resolveDeviceId(req, reply);
      const result = verifyEmail(parse.data.token, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown',
        deviceId,
      });
      reply.setCookie('fortless_session', result.token, { path: '/', httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', maxAge: 14 * 24 * 60 * 60 });
      return { verified: true };
    } catch (err: unknown) { return reply.status(400).send({ error: (err as Error).message }); }
  });

  const emailSchema = z.object({ email: z.string().email() });
  app.post('/api/v1/auth/resend-verification', async (req, reply) => {
    const parse = emailSchema.safeParse(req.body);
    if (parse.success) resendVerification(parse.data.email);
    const emailDelivery = (config.EMAIL_MODE === 'live' || config.EMAIL_MODE === 'sandbox') ? 'QUEUED' : 'CONFIGURATION_REQUIRED';
    return reply.status(202).send({ message: 'If the account is eligible, a verification message will be queued.', emailDelivery });
  });

  app.post('/api/v1/auth/forgot-password', async (req, reply) => {
    const parse = emailSchema.safeParse(req.body);
    if (parse.success) requestPasswordReset(parse.data.email);
    const emailDelivery = (config.EMAIL_MODE === 'live' || config.EMAIL_MODE === 'sandbox') ? 'QUEUED' : 'CONFIGURATION_REQUIRED';
    return reply.status(202).send({ message: 'If an eligible account exists, a password reset message will be queued.', emailDelivery });
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
      const challengeResult = completeMfaChallenge(token, parse.data.code, req.ip);
      reply.setCookie('fortless_session', token, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 14 * 24 * 60 * 60,
      });
      return reply.send({ verified: true, ...challengeResult });
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
      getDatabase().prepare(`
        INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
        VALUES (?, ?, ?, 'USER', 'user.logout', 'session', ?, ?, ?)
      `).run(generateId('aud'), req.auth!.account.id, req.auth!.user.id, req.auth!.session.id, req.ip, generateId('cor'));
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

  // Account profile: your name, the workspace (tenant) name, and the invoice details
  const profileActor = (req: FastifyRequest) => ({ userId: req.auth!.user.id, accountId: req.auth!.account.id, role: req.auth!.membership.role, ipAddress: req.ip });
  const profileGuard = (fn: (req: FastifyRequest) => unknown) => async (req: FastifyRequest, reply: FastifyReply) => {
    try { reply.header('Cache-Control', 'no-store'); return await fn(req); }
    catch (err) {
      if (err instanceof ProfileValidationError) return reply.status(err.statusCode).send({ error: err.message, code: err.code });
      throw err;
    }
  };
  app.patch('/api/v1/account/profile', { preHandler: [requireAuth] }, profileGuard((req) => updateProfile(profileActor(req), req.body)));
  app.get('/api/v1/account/billing-profile', { preHandler: [requireAuth] }, profileGuard((req) => ({ profile: getBillingProfile(req.auth!.account.id) })));
  app.put('/api/v1/account/billing-profile', { preHandler: [requireAuth] }, profileGuard((req) => ({ profile: saveBillingProfile(profileActor(req), req.body) })));

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
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('already enabled')) return reply.status(409).send({ error: msg });
      return reply.status(400).send({ error: msg });
    }
  });

  app.post('/api/v1/auth/mfa/totp/replace', { preHandler: [requireAuth, requireRecentStepUp] }, async (req, reply) => {
    try {
      return reply.send(beginTotpReplacement(req.auth!.user.id, req.auth!.user.email));
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

  app.post('/api/v1/auth/mfa/recovery-codes/regenerate', { preHandler: [requireAuth, requireRecentStepUp] }, async (req, reply) => {
    try {
      const recoveryCodes = regenerateRecoveryCodes({
        userId: req.auth!.user.id,
        accountId: req.auth!.account.id,
        ipAddress: req.ip,
      });
      return reply.send({ recoveryCodes });
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
  app.post('/api/v1/auth/passkeys/register-options', { preHandler: [requireAuth, requireRecentStepUp] }, async (req) => {
    const { challenge, expiresAt } = generateWebAuthnChallenge('REGISTRATION', req.auth!.user.id, getDatabase());
    const rpId = relyingPartyId(req.hostname);
    return {
      challenge,
      rp: { name: 'FORTLESS', id: rpId },
      user: { id: req.auth!.user.id, name: req.auth!.user.email, displayName: req.auth!.user.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      timeout: 60000,
      expiresAt,
    };
  });

  app.post('/api/v1/auth/passkeys/register-verify', { preHandler: [requireAuth, requireRecentStepUp] }, async (req, reply) => {
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

    if (parse.data.publicKey.startsWith('-----BEGIN')) {
      return reply.status(400).send({ error: 'Direct PEM public key registration is not allowed on public endpoint. Attestation object required.' });
    }

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
      rpId: relyingPartyId(),
      timeout: 60000,
      userVerification: 'required',
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
    }).safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Invalid passkey authentication payload.' });

    try {
      const deviceId = resolveDeviceId(req, reply);
      const result = verifyAndAuthenticatePasskey({
        ...parse.data,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
        deviceId,
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

  app.delete('/api/v1/auth/passkeys/:id', { preHandler: [requireAuth, requireRecentStepUp] }, async (req, reply) => {
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
    if (parse.data.role === 'OWNER') {
      const isSteppedUp = req.auth?.session?.stepUpVerifiedAt &&
        (Date.now() - new Date(req.auth.session.stepUpVerifiedAt).getTime() < 15 * 60 * 1000);
      if (!isSteppedUp) {
        return reply.status(403).send({ error: 'Step-up authentication required to invite or grant the OWNER role.' });
      }
    }
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
  app.get('/api/v1/email/status', { preHandler: [requireAuth] }, async (req) => {
    const db = getDatabase();
    const isStaff = Boolean(req.auth?.user.is_staff);
    const counts = isStaff
      ? db.prepare(`SELECT status, count(*) AS count FROM email_outbox GROUP BY status`).all() as { status: string; count: number }[]
      : db.prepare(`SELECT status, count(*) AS count FROM email_outbox WHERE lower(recipient) = ? GROUP BY status`).all(req.auth!.user.email.toLowerCase()) as { status: string; count: number }[];
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
    const products = listAdminCatalog();
    return { products };
  });

  const recordCatalogAudit = (
    req: FastifyRequest,
    action: string,
    resourceType: 'catalog_product' | 'plan_version' | 'service',
    resourceId: string,
    metadata: Record<string, unknown>,
    db = getDatabase()
  ) => {
    db.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata
      ) VALUES (?, NULL, ?, 'STAFF', ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('aud'), req.auth!.user.id, action, resourceType, resourceId,
      req.ip, generateId('cor'), JSON.stringify(metadata)
    );
  };

  // Read-only provider inventory for explicit catalog-to-egg mapping.
  app.get('/api/v1/admin/providers/pterodactyl/inventory', { preHandler: [requireAuth, requireStaffPermission('catalog:read')] }, async (_req, reply) => {
    if (config.PROVIDER_MODE !== 'pterodactyl_1' || !config.PTERODACTYL_PANEL_URL || !config.PTERODACTYL_API_KEY) {
      return reply.status(503).send({
        error: 'Pterodactyl provider is not configured.',
        code: 'PROVIDER_NOT_CONFIGURED',
      });
    }

    try {
      const adapter = new PterodactylHttpAdapter({
        panelUrl: config.PTERODACTYL_PANEL_URL,
        apiKey: config.PTERODACTYL_API_KEY,
        timeoutMs: 15000,
      });
      const inventory = await adapter.getInventory();
      return reply.send({
        provider: { type: 'PTERODACTYL', version: adapter.version, verification: config.PROVIDER_VERIFICATION_TIER },
        inventory,
      });
    } catch (error: unknown) {
      const providerError = error instanceof ProviderError ? error : null;
      return reply.status(providerError?.statusCode && providerError.statusCode < 500 ? providerError.statusCode : 502).send({
        error: 'Unable to read the Pterodactyl inventory.',
        code: providerError?.code || 'PROVIDER_INVENTORY_UNAVAILABLE',
      });
    }
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
    const db = getDatabase();
    const result = db.transaction(() => {
      const created = createProduct(parse.data, db);
      recordCatalogAudit(req, 'catalog.product_created', 'catalog_product', created.id, {
        slug: parse.data.slug,
        providerType: parse.data.providerType,
        isPublished: false,
      }, db);
      return created;
    })();
    return reply.status(201).send(result);
  });

  // Admin Catalog: Toggle Publish
  app.patch('/api/v1/admin/catalog/products/:id/publish', { preHandler: [requireAuth, requireStaffPermission('catalog:manage'), requireRecentStepUp] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { isPublished?: boolean } | undefined;
    if (Boolean(body?.isPublished)) {
      const db = getDatabase();
      const product = db.prepare('SELECT provider_type FROM products WHERE id = ?').get(id) as { provider_type: string } | undefined;
      if (!product) return reply.status(404).send({ error: 'Product not found.', code: 'PRODUCT_NOT_FOUND' });
      const plans = db.prepare("SELECT id, resource_specs FROM plan_versions WHERE product_id = ? AND status = 'ACTIVE'").all(id) as Array<{ id: string; resource_specs: string }>;
      if (!plans.length) {
        return reply.status(422).send({ error: 'A product requires at least one active plan before publication.', code: 'ACTIVE_PLAN_REQUIRED' });
      }
      if (product.provider_type === 'PTERODACTYL') {
        if (config.PROVIDER_MODE !== 'pterodactyl_1' || !config.PTERODACTYL_PANEL_URL || !config.PTERODACTYL_API_KEY) {
          return reply.status(503).send({ error: 'Pterodactyl must be configured before publishing this product.', code: 'PROVIDER_NOT_CONFIGURED' });
        }
        const adapter = new PterodactylHttpAdapter({ panelUrl: config.PTERODACTYL_PANEL_URL, apiKey: config.PTERODACTYL_API_KEY, timeoutMs: 15000 });
        const inventory = await adapter.getInventory();
        const availableEggIds = new Set(inventory.eggs.map((egg) => egg.id));
        const missingMapping = plans.find((plan) => {
          const resources = JSON.parse(plan.resource_specs) as { eggId?: number };
          return !resources.eggId || !availableEggIds.has(resources.eggId);
        });
        if (missingMapping) {
          return reply.status(422).send({ error: 'Every active plan must reference an egg present in the configured Pterodactyl panel.', code: 'PROVIDER_MAPPING_INVALID' });
        }
      }
    }
    const db = getDatabase();
    db.transaction(() => {
      updateProductPublishStatus(id, Boolean(body?.isPublished), db);
      recordCatalogAudit(req, 'catalog.product_publication_changed', 'catalog_product', id, {
        isPublished: Boolean(body?.isPublished),
      }, db);
    })();
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
      dockerImage: z.string().min(3).max(255).optional(),
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
    const product = getDatabase().prepare('SELECT provider_type FROM products WHERE id = ?').get(parse.data.productId) as { provider_type: string } | undefined;
    if (!product) return reply.status(404).send({ error: 'Product not found.', code: 'PRODUCT_NOT_FOUND' });
    if (product.provider_type === 'PTERODACTYL' && !parse.data.resourceSpecs.eggId) {
      return reply.status(422).send({ error: 'Pterodactyl plans require an explicit egg mapping.', code: 'EGG_MAPPING_REQUIRED' });
    }
    const db = getDatabase();
    const result = db.transaction(() => {
      const created = createPlanVersion(parse.data, db);
      recordCatalogAudit(req, 'catalog.plan_created', 'plan_version', created.planVersionId, {
        productId: parse.data.productId,
        eggId: parse.data.resourceSpecs.eggId,
        prices: parse.data.prices.map((price) => ({ currency: price.currency, interval: price.interval, priceMinorUnits: price.priceMinorUnits })),
      }, db);
      return created;
    })();
    return reply.status(201).send(result);
  });

  // Admin Catalog: Update Plan Status
  app.patch('/api/v1/admin/catalog/plans/:id/status', { preHandler: [requireAuth, requireStaffPermission('catalog:manage'), requireRecentStepUp] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status?: 'DRAFT' | 'ACTIVE' | 'RETIRED' } | undefined;
    if (!body?.status || !['DRAFT', 'ACTIVE', 'RETIRED'].includes(body.status)) {
      return reply.status(400).send({ error: 'Valid status (DRAFT, ACTIVE, RETIRED) is required.' });
    }
    const db = getDatabase();
    db.transaction(() => {
      updatePlanStatus(id, body.status!, db);
      recordCatalogAudit(req, 'catalog.plan_status_changed', 'plan_version', id, { status: body.status }, db);
    })();
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
      const result = await processCheckout({
        accountId: req.auth!.account.id,
        quoteId: parse.data.quoteId,
        idempotencyKey,
        regionId: parse.data.regionId,
        customOptions: parse.data.customOptions,
      });

      return reply.status(201).send(result);
    } catch (err: unknown) {
      console.error('[Checkout] Error:', (err as Error).message, (err as Error).stack?.split('\n')[1]);
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

  // Services: List (own services plus services shared with the viewer)
  app.get('/api/v1/services', { preHandler: [requireAuth] }, async (req) => {
    const db = getDatabase();
    const services = db.prepare(`
      SELECT s.*, sos.runtime_state, sos.last_checked_at,
             sdc.cpu_limit_pct, sdc.memory_limit_mb, sdc.disk_limit_mb,
             n.name as node_name, pv.name as plan_name,
             CASE WHEN s.account_id = @acc THEN NULL ELSE a.name END AS shared_by,
             CASE WHEN s.account_id = @acc THEN NULL ELSE sm.preset END AS shared_preset
      FROM services s
      LEFT JOIN service_observed_states sos ON sos.service_id = s.id
      LEFT JOIN service_desired_configs sdc ON sdc.service_id = s.id
      JOIN nodes n ON n.id = s.node_id
      JOIN order_items oi ON oi.id = s.order_item_id
      JOIN plan_versions pv ON pv.id = oi.plan_version_id
      JOIN accounts a ON a.id = s.account_id
      LEFT JOIN service_members sm ON sm.service_id = s.id AND sm.user_id = @usr
      WHERE s.account_id = @acc OR sm.user_id IS NOT NULL
      ORDER BY s.created_at DESC
    `).all({ acc: req.auth!.account.id, usr: req.auth!.user.id });
    const userRole = req.auth!.membership.role;
    const isAccountController = userRole === 'OWNER' || userRole === 'TECH_ADMIN';
    const enriched = (services as any[]).map((svc) => {
      const isOwnerAcc = svc.account_id === req.auth!.account.id;
      const user_can_control = isOwnerAcc ? isAccountController : (svc.shared_preset === 'operator' || svc.shared_preset === 'admin');
      return { ...svc, user_can_control };
    });
    return { services: enriched };
  });

  // Services: Get Detail (Tenant Isolated!)
  app.get('/api/v1/services/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const detail = getServiceDetail(id, req.auth!.account.id, getDatabase(), { userId: req.auth!.user.id, role: req.auth!.membership.role });
      return { service: detail };
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  app.get('/api/v1/services/:id/usage', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const access = getServiceAccess(getDatabase(), { serviceId: id, accountId: req.auth!.account.id, userId: req.auth!.user.id, role: req.auth!.membership.role });
    if (!access) return reply.status(404).send({ error: 'Service not found.' });
    touchService(id);
    const svc = { external_id: access.service.external_id };
    if (config.PROVIDER_MODE !== 'pterodactyl_1' || !(config.PTERODACTYL_KEYMINT_SECRET || config.PTERODACTYL_CLIENT_API_KEY) || !svc.external_id) {
      return { available: false };
    }
    try {
      const adapter = new PterodactylHttpAdapter({
        panelUrl: config.PTERODACTYL_PANEL_URL,
        apiKey: config.PTERODACTYL_API_KEY,
        clientApiKey: config.PTERODACTYL_CLIENT_API_KEY,
        timeoutMs: 8000,
      });
      const externalId = svc.external_id;
      const usage = config.PTERODACTYL_KEYMINT_SECRET
        ? await withAccountClientKey(req.auth!.account.id, adapter, getDatabase(), config.PTERODACTYL_KEYMINT_SECRET, (key) => adapter.getResourceUsage(externalId, key))
        : await adapter.getResourceUsage(externalId);
      return { available: true, usage };
    } catch {
      return { available: false };
    }
  });

  // Services: Power Action (Tenant Isolated & Role Protected)
  const powerSchema = z.object({
    action: z.enum(['START', 'STOP', 'RESTART', 'KILL']),
  });

  app.post('/api/v1/services/:id/power', { preHandler: [requireAuth] }, async (req, reply) => {
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
        role: req.auth!.membership.role,
        action: parse.data.action,
        ipAddress: req.ip,
      });
      return { success: true, serviceId: id, action: parse.data.action, runtimeState: result.runtimeState };
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      if (msg.includes('cannot receive power commands') || msg.includes('still provisioning') || msg.includes('permission')) {
        return reply.status(403).send({ error: msg });
      }
      return reply.status(500).send({ error: msg });
    }
  });

  // Services: Console websocket credentials (tenant isolated; per-account panel key never leaves the server)
  app.get('/api/v1/services/:id/console', { preHandler: [requireAuth] }, async (req, reply) => {
    if (!operationalCapability('provisioning')) return reply.status(503).send({ error: 'Infrastructure provider is not configured.', code: 'PROVIDER_NOT_CONFIGURED' });
    const { id } = req.params as { id: string };
    try {
      touchService(id);
      const creds = await getServiceConsoleCredentials({
        serviceId: id,
        accountId: req.auth!.account.id,
        userId: req.auth!.user.id,
        role: req.auth!.membership.role,
        ipAddress: req.ip,
      });
      reply.header('Cache-Control', 'no-store');
      return creds;
    } catch (err: unknown) {
      if (err instanceof ConsoleAccessError) return reply.status(err.statusCode).send({ error: err.message, code: err.code });
      req.log.error({ err: (err as Error).message, name: (err as Error).name, serviceId: id }, 'console credentials failed');
      console.error('[Console] credentials failed:', (err as Error).name, (err as Error).message);
      return reply.status(502).send({ error: 'Console is temporarily unavailable.', code: 'PROVIDER_ERROR' });
    }
  });

  // Services: file manager (tenant isolated; every call uses the account's own panel key)
  const filesApi = createFilesApi();
  const filesGuard = { preHandler: [requireAuth] };
  const filesCtx = (req: any) => ({
    serviceId: (req.params as { id: string }).id,
    accountId: req.auth!.account.id as string,
    userId: req.auth!.user.id as string,
    role: req.auth!.membership.role as string,
    ipAddress: req.ip as string,
  });
  const filesHandler = (fn: (req: any) => Promise<unknown>) => async (req: any, reply: any) => {
    if (!operationalCapability('provisioning')) return reply.status(503).send({ error: 'Infrastructure provider is not configured.', code: 'PROVIDER_NOT_CONFIGURED' });
    try {
      reply.header('Cache-Control', 'no-store');
      return await fn(req);
    } catch (err: unknown) {
      if (err instanceof ConsoleAccessError) return reply.status(err.statusCode).send({ error: err.message, code: err.code });
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404) return reply.status(404).send({ error: 'Not found on the server.', code: 'NOT_FOUND' });
      // The panel's own refusals (limit reached, server must be offline...) are the useful message for the customer.
      if (err instanceof ProviderError && err.detail && [400, 409, 422, 429].includes(status ?? 0)) {
        return reply.status(409).send({ error: err.detail, code: 'PANEL_REFUSED' });
      }
      console.error('[Files] request failed:', (err as Error).name, (err as Error).message);
      return reply.status(502).send({ error: 'File manager is temporarily unavailable.', code: 'PROVIDER_ERROR' });
    }
  };
  const q = (req: any) => (req.query ?? {}) as Record<string, unknown>;
  const b = (req: any) => (req.body ?? {}) as Record<string, unknown>;
  app.get('/api/v1/services/:id/files', filesGuard, filesHandler((req) => filesApi.list(filesCtx(req), q(req)['dir'] ?? '/')));
  app.get('/api/v1/services/:id/files/content', filesGuard, filesHandler((req) => filesApi.read(filesCtx(req), q(req)['path'])));
  app.put('/api/v1/services/:id/files/content', filesGuard, filesHandler(async (req) => { await filesApi.write(filesCtx(req), b(req)['path'], b(req)['content']); return { success: true }; }));
  app.post('/api/v1/services/:id/files/folder', filesGuard, filesHandler(async (req) => { await filesApi.createFolder(filesCtx(req), b(req)['dir'], b(req)['name']); return { success: true }; }));
  app.post('/api/v1/services/:id/files/delete', filesGuard, filesHandler(async (req) => { await filesApi.remove(filesCtx(req), b(req)['dir'], b(req)['names']); return { success: true }; }));
  app.post('/api/v1/services/:id/files/rename', filesGuard, filesHandler(async (req) => { await filesApi.rename(filesCtx(req), b(req)['dir'], b(req)['from'], b(req)['to']); return { success: true }; }));
  app.post('/api/v1/services/:id/files/archive', filesGuard, filesHandler((req) => filesApi.archive(filesCtx(req), b(req)['dir'], b(req)['names'])));
  app.post('/api/v1/services/:id/files/unarchive', filesGuard, filesHandler(async (req) => ({ success: true, ...(await filesApi.unarchive(filesCtx(req), b(req)['dir'], b(req)['file'])) })));
  app.post('/api/v1/services/:id/files/move', filesGuard, filesHandler(async (req) => { await filesApi.move(filesCtx(req), b(req)['dir'], b(req)['name'], b(req)['destDir']); return { success: true }; }));
  app.post('/api/v1/services/:id/files/chmod', filesGuard, filesHandler(async (req) => { await filesApi.chmod(filesCtx(req), b(req)['dir'], b(req)['names'], b(req)['mode']); return { success: true }; }));
  app.post('/api/v1/services/:id/files/pull', filesGuard, filesHandler(async (req) => ({ success: true, ...(await filesApi.pull(filesCtx(req), b(req)['dir'], b(req)['url'], b(req)['filename'])) })));
  app.post('/api/v1/services/:id/files/copy', filesGuard, filesHandler(async (req) => { await filesApi.copy(filesCtx(req), b(req)['path']); return { success: true }; }));
  app.get('/api/v1/services/:id/files/upload-url', filesGuard, filesHandler(async (req) => ({ url: await filesApi.signedUrl(filesCtx(req), 'upload', q(req)['dir'] ?? '/') })));
  app.get('/api/v1/services/:id/files/download-url', filesGuard, filesHandler(async (req) => ({ url: await filesApi.signedUrl(filesCtx(req), 'download', q(req)['path']) })));

  app.get('/api/v1/services/:id/activity', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    try {
      return listServiceActivity({
        serviceId: id,
        accountId: req.auth!.account.id,
        userId: req.auth!.user.id,
        role: req.auth!.membership.role,
        category: query['category'],
        range: query['range'],
        q: query['q'],
        page: Number(query['page'] ?? 1),
      });
    } catch {
      return reply.status(404).send({ error: 'Service not found.' });
    }
  });

  // Service sharing: invite people to one server, they get their own panel access
  const sharing = createServiceSharing();
  const sharingHandler = (fn: (req: any) => unknown | Promise<unknown>) => async (req: any, reply: any) => {
    try { reply.header('Cache-Control', 'no-store'); return await fn(req); }
    catch (err: unknown) {
      if (err instanceof SharingError) return reply.status(err.statusCode).send({ error: err.message, code: err.code });
      console.error('[Sharing] request failed:', (err as Error).name, (err as Error).message);
      return reply.status(502).send({ error: 'Sharing is temporarily unavailable.', code: 'PROVIDER_ERROR' });
    }
  };
  const actorOf = (req: any) => ({ serviceId: (req.params as { id: string }).id, accountId: req.auth!.account.id as string, userId: req.auth!.user.id as string, role: req.auth!.membership.role as string, ipAddress: req.ip as string });
  app.get('/api/v1/services/:id/members', { preHandler: [requireAuth] }, sharingHandler((req) => sharing.list(actorOf(req))));
  app.post('/api/v1/services/:id/members/invite', { preHandler: [requireAuth] }, sharingHandler(async (req) => { const r = sharing.invite(actorOf(req), (req.body ?? {}) as { email: unknown; preset: unknown }); return { success: true, ...r }; }));
  app.delete('/api/v1/services/:id/invitations/:iid', { preHandler: [requireAuth] }, sharingHandler((req) => { sharing.revokeInvitation(actorOf(req), (req.params as { iid: string }).iid); return { success: true }; }));
  app.delete('/api/v1/services/:id/members/:mid', { preHandler: [requireAuth] }, sharingHandler(async (req) => { await sharing.remove(actorOf(req), (req.params as { mid: string }).mid); return { success: true }; }));
  app.patch('/api/v1/services/:id/members/:mid', { preHandler: [requireAuth] }, sharingHandler(async (req) => { await sharing.setPreset(actorOf(req), (req.params as { mid: string }).mid, ((req.body ?? {}) as { preset?: unknown }).preset); return { success: true }; }));

  const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const invitePage = (reply: FastifyReply, title: string, message: string) => reply.status(400).type('text/html').header('Cache-Control', 'no-store').send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>:root{color-scheme:light dark}body{font:500 15px/1.5 -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;background:Canvas;color:CanvasText}main{max-width:420px}h1{font-size:22px;margin:0 0 8px}a{color:#2f6bff;font-weight:700}</style><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/login">Sign in</a> · <a href="/app">Dashboard</a></p></main>`);
  app.get('/invite/service/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const info = sharing.peek(token);
    if (!info) return invitePage(reply, 'Invitation unavailable', 'This invitation is invalid, expired or was revoked. Ask the owner to send a new one.');
    const here = `/invite/service/${encodeURIComponent(token)}`;
    if (!req.auth) {
      const q = `next=${encodeURIComponent(here)}&email=${encodeURIComponent(info.email)}`;
      return reply.redirect(info.userExists ? `/login?${q}` : `/register?${q}`);
    }
    try {
      const r = await sharing.accept(token, { userId: req.auth.user.id, accountId: req.auth.account.id, ipAddress: req.ip });
      return reply.redirect(`/app/services/${encodeURIComponent(r.serviceId)}`);
    } catch (err) {
      if (err instanceof SharingError) return invitePage(reply, 'Could not accept the invitation', err.message);
      console.error('[Sharing] accept failed:', (err as Error).name, (err as Error).message);
      return invitePage(reply, 'Could not accept the invitation', 'Something went wrong. Try opening the link again in a minute.');
    }
  });

  // Game tools: settings form, Java recommendation, mod and plugin installer, icon (driven by game profiles)
  const gameTools = createGameTools();
  app.get('/api/v1/services/:id/game', filesGuard, filesHandler((req) => gameTools.info(filesCtx(req))));
  app.put('/api/v1/services/:id/game/config', filesGuard, filesHandler(async (req) => { await gameTools.saveConfig(filesCtx(req), req.body); return { success: true }; }));
  app.post('/api/v1/services/:id/game/eula/accept', filesGuard, filesHandler((req) => gameTools.acceptEula(filesCtx(req))));
  app.get('/api/v1/services/:id/game/mods/search', filesGuard, filesHandler((req) => gameTools.searchMods(filesCtx(req), { source: q(req)['source'], q: q(req)['q'], page: q(req)['page'] })));
  app.post('/api/v1/services/:id/game/mods/install', filesGuard, filesHandler(async (req) => ({ success: true, ...(await gameTools.installMod(filesCtx(req), b(req) as { source: unknown; projectId: unknown; versionId?: unknown })) })));
  app.get('/api/v1/services/:id/game/mods/installed', filesGuard, filesHandler((req) => gameTools.installed(filesCtx(req), q(req)['source'])));
  app.post('/api/v1/services/:id/game/icon', filesGuard, filesHandler(async (req) => { await gameTools.setIcon(filesCtx(req), b(req) as { png?: unknown }); return { success: true }; }));

  // Staff: game profiles are data, managed here instead of in code
  const profileAudit = (req: FastifyRequest, action: string, id: string, metadata: Record<string, unknown>) =>
    getDatabase().prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, NULL, ?, 'STAFF', ?, 'game_profile', ?, ?, ?, ?)
    `).run(generateId('aud'), req.auth!.user.id, action, id, req.ip, generateId('cor'), JSON.stringify(metadata));
  const profileHandler = (fn: (req: any) => unknown) => async (req: any, reply: any) => {
    try { return await fn(req); } catch (err) {
      if (err instanceof ProfileError) return reply.status(err.statusCode).send({ error: err.message, code: err.code });
      throw err;
    }
  };
  app.get('/api/v1/admin/game-profiles', { preHandler: [requireAuth, requireStaffPermission('catalog:read')] }, async () => ({ profiles: listProfiles(getDatabase()) }));
  app.post('/api/v1/admin/game-profiles', { preHandler: [requireAuth, requireStaffPermission('catalog:manage')] }, profileHandler((req) => {
    const p = saveProfile(getDatabase(), req.body); profileAudit(req, 'admin.game_profile_created', p.id, { slug: p.slug }); return { profile: p };
  }));
  app.put('/api/v1/admin/game-profiles/:id', { preHandler: [requireAuth, requireStaffPermission('catalog:manage')] }, profileHandler((req) => {
    const p = saveProfile(getDatabase(), req.body, (req.params as { id: string }).id); profileAudit(req, 'admin.game_profile_updated', p.id, { slug: p.slug }); return { profile: p };
  }));
  app.delete('/api/v1/admin/game-profiles/:id', { preHandler: [requireAuth, requireStaffPermission('catalog:manage'), requireRecentStepUp] }, profileHandler((req) => {
    const id = (req.params as { id: string }).id; deleteProfile(getDatabase(), id); profileAudit(req, 'admin.game_profile_deleted', id, {}); return { success: true };
  }));

  // Services: backups, network, startup, settings (same gate as the file manager)
  const panelApi = createServerPanelApi();
  const ok = async (fn: () => Promise<unknown>) => { await fn(); return { success: true }; };
  const pid = (req: any, k: string) => String((req.params as Record<string, string>)[k] ?? '');
  app.get('/api/v1/services/:id/backups', filesGuard, filesHandler((req) => panelApi.backups(filesCtx(req))));
  app.post('/api/v1/services/:id/backups', filesGuard, filesHandler((req) => ok(() => panelApi.createBackup(filesCtx(req), b(req)))));
  app.delete('/api/v1/services/:id/backups/:uuid', filesGuard, filesHandler((req) => ok(() => panelApi.deleteBackup(filesCtx(req), pid(req, 'uuid')))));
  app.post('/api/v1/services/:id/backups/:uuid/lock', filesGuard, filesHandler((req) => ok(() => panelApi.lockBackup(filesCtx(req), pid(req, 'uuid')))));
  app.post('/api/v1/services/:id/backups/:uuid/restore', filesGuard, filesHandler((req) => ok(() => panelApi.restoreBackup(filesCtx(req), pid(req, 'uuid'), b(req)['truncate']))));
  app.get('/api/v1/services/:id/backups/:uuid/download-url', filesGuard, filesHandler(async (req) => ({ url: await panelApi.backupDownloadUrl(filesCtx(req), pid(req, 'uuid')) })));
  app.get('/api/v1/services/:id/network', filesGuard, filesHandler((req) => panelApi.network(filesCtx(req))));
  app.post('/api/v1/services/:id/network', filesGuard, filesHandler((req) => ok(() => panelApi.assignAllocation(filesCtx(req)))));
  app.patch('/api/v1/services/:id/network/:aid', filesGuard, filesHandler((req) => ok(() => panelApi.setAllocationNotes(filesCtx(req), pid(req, 'aid'), b(req)['notes']))));
  app.post('/api/v1/services/:id/network/:aid/primary', filesGuard, filesHandler((req) => ok(() => panelApi.setPrimaryAllocation(filesCtx(req), pid(req, 'aid')))));
  app.delete('/api/v1/services/:id/network/:aid', filesGuard, filesHandler((req) => ok(() => panelApi.removeAllocation(filesCtx(req), pid(req, 'aid')))));
  app.get('/api/v1/services/:id/databases', filesGuard, filesHandler((req) => panelApi.databases(filesCtx(req))));
  app.post('/api/v1/services/:id/databases', filesGuard, filesHandler((req) => ok(() => panelApi.createDatabase(filesCtx(req), b(req)))));
  app.post('/api/v1/services/:id/databases/:did/rotate', filesGuard, filesHandler((req) => panelApi.rotateDatabasePassword(filesCtx(req), pid(req, 'did'))));
  app.delete('/api/v1/services/:id/databases/:did', filesGuard, filesHandler((req) => ok(() => panelApi.deleteDatabase(filesCtx(req), pid(req, 'did')))));
  app.get('/api/v1/services/:id/schedules', filesGuard, filesHandler((req) => panelApi.schedules(filesCtx(req))));
  app.post('/api/v1/services/:id/schedules', filesGuard, filesHandler((req) => ok(() => panelApi.saveSchedule(filesCtx(req), null, b(req)))));
  app.post('/api/v1/services/:id/schedules/:sid', filesGuard, filesHandler((req) => ok(() => panelApi.saveSchedule(filesCtx(req), pid(req, 'sid'), b(req)))));
  app.delete('/api/v1/services/:id/schedules/:sid', filesGuard, filesHandler((req) => ok(() => panelApi.deleteSchedule(filesCtx(req), pid(req, 'sid')))));
  app.post('/api/v1/services/:id/schedules/:sid/execute', filesGuard, filesHandler((req) => ok(() => panelApi.executeSchedule(filesCtx(req), pid(req, 'sid')))));
  app.post('/api/v1/services/:id/schedules/:sid/tasks', filesGuard, filesHandler((req) => ok(() => panelApi.addTask(filesCtx(req), pid(req, 'sid'), b(req)))));
  app.post('/api/v1/services/:id/schedules/:sid/tasks/:tid', filesGuard, filesHandler((req) => ok(() => panelApi.updateTask(filesCtx(req), pid(req, 'sid'), pid(req, 'tid'), b(req)))));
  app.get('/api/v1/services/:id/panel-activity', filesGuard, filesHandler((req) => panelApi.panelActivity(filesCtx(req), q(req)['page'])));
  app.delete('/api/v1/services/:id/schedules/:sid/tasks/:tid', filesGuard, filesHandler((req) => ok(() => panelApi.deleteTask(filesCtx(req), pid(req, 'sid'), pid(req, 'tid')))));
  app.get('/api/v1/services/:id/startup', filesGuard, filesHandler((req) => panelApi.startup(filesCtx(req))));
  app.put('/api/v1/services/:id/startup/variable', filesGuard, filesHandler((req) => ok(() => panelApi.setVariable(filesCtx(req), b(req)['key'], b(req)['value']))));
  app.put('/api/v1/services/:id/startup/image', filesGuard, filesHandler((req) => ok(() => panelApi.setImage(filesCtx(req), b(req)['image']))));
  app.get('/api/v1/services/:id/settings', filesGuard, filesHandler((req) => panelApi.settings(filesCtx(req))));
  app.post('/api/v1/services/:id/settings/rename', filesGuard, filesHandler((req) => ok(() => panelApi.rename(filesCtx(req), b(req)['name'], b(req)['description']))));
  app.post('/api/v1/services/:id/settings/reinstall', filesGuard, filesHandler((req) => ok(() => panelApi.reinstall(filesCtx(req)))));

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
      const result = await cancelSubscription({
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
    const updated = markNotificationRead(id, req.auth!.account.id, req.auth!.user.id);
    return { success: true, updated };
  });

  // Notifications: Mark All Read
  app.post('/api/v1/notifications/read-all', { preHandler: [requireAuth] }, async (req) => {
    const count = markAllNotificationsRead(req.auth!.account.id, req.auth!.user.id);
    return { success: true, count };
  });

  app.get('/api/v1/notification-preferences', { preHandler: [requireAuth] }, async (req) => ({
    preferences: getNotificationPreferences(req.auth!.user.id),
    mandatory: ['Account verification and recovery', 'Password and security alerts', 'Payment failures and access invitations'],
  }));

  app.put('/api/v1/notification-preferences', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = z.object({
      billingEmail: z.boolean(),
      serviceEmail: z.boolean(),
      supportEmail: z.boolean(),
    }).strict().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'All notification preference values must be booleans.' });
    const db = getDatabase();
    const preferences = saveNotificationPreferences(req.auth!.user.id, parsed.data, db);
    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, 'USER', 'user.notification_preferences_updated', 'user', ?, ?, ?, ?)
    `).run(generateId('aud'), req.auth!.account.id, req.auth!.user.id, req.auth!.user.id, req.ip, generateId('cor'), JSON.stringify(preferences));
    return { preferences };
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

  app.post('/api/v1/admin/invoices/:id/refund', { preHandler: [requireAuth, requireStaffPermission('accounts:manage'), requireRecentStepUp] }, async (req, reply) => {
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

  app.post('/api/v1/tickets/:id/resolve', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = resolveTicket({
      ticketId: id,
      accountId: req.auth!.account.id,
      userId: req.auth!.user.id,
      ipAddress: req.ip,
    }, getDatabase());
    if (result.outcome === 'NOT_FOUND') return reply.status(404).send({ error: 'Ticket not found' });
    return reply.send({ resolved: true });
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

      return reply.status(201).send({ attachment: toPublicAttachment(record) });
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
    return { attachments: attachments.map(toPublicAttachment) };
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
      { id: 'nav-dashboard', title: 'Dashboard', category: 'Navigation', icon: 'home-01', path: '/app', shortcut: 'G H' },
      { id: 'nav-servers', title: 'Servers & Instances', category: 'Navigation', icon: 'server', path: '/app/services', shortcut: 'G S' },
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

    const adminPagesConfig = [
      { id: 'adm-overview', title: 'Admin: Operations Overview', category: 'Admin Control Plane', icon: 'home-01', path: '/admin', perm: null },
      { id: 'adm-accounts', title: 'Admin: Customer Accounts', category: 'Admin Control Plane', icon: 'user-group', path: '/admin/accounts', perm: 'accounts:read' as StaffPermission },
      { id: 'adm-services', title: 'Admin: Service Inventory', category: 'Admin Control Plane', icon: 'server', path: '/admin/services', perm: 'services:read' as StaffPermission },
      { id: 'adm-orders', title: 'Admin: Orders', category: 'Admin Control Plane', icon: 'package', path: '/admin/orders', perm: 'billing:read' as StaffPermission },
      { id: 'adm-billing', title: 'Admin: Billing Operations', category: 'Admin Control Plane', icon: 'credit-card', path: '/admin/billing', perm: 'billing:read' as StaffPermission },
      { id: 'adm-infrastructure', title: 'Admin: Infrastructure Capacity', category: 'Admin Control Plane', icon: 'database', path: '/admin/infrastructure', perm: 'services:read' as StaffPermission },
      { id: 'adm-tickets', title: 'Admin: Support Queue', category: 'Admin Control Plane', icon: 'bubble-chat', path: '/admin/tickets', perm: 'tickets:read' as StaffPermission },
      { id: 'adm-audit', title: 'Admin: Global Audit Trail', category: 'Admin Control Plane', icon: 'shield-01', path: '/admin/audit', perm: 'audit:read' as StaffPermission },
      { id: 'adm-staff', title: 'Admin: Staff Access & Roles', category: 'Admin Control Plane', icon: 'users', path: '/admin/staff', perm: 'staff:manage' as StaffPermission },
      { id: 'adm-status', title: 'Admin: System Status', category: 'Admin Control Plane', icon: 'activity', path: '/admin/status', perm: 'services:read' as StaffPermission },
    ];

    const adminPages = isStaff
      ? adminPagesConfig.filter((p) => !p.perm || hasStaffPermission(req.auth!.user.id, p.perm, db)).map(({ perm, ...rest }) => rest)
      : [];

    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;

    const services = query ? (db.prepare(`
      SELECT s.id, s.identifier, pv.name as plan_name, n.name as node_name, coalesce(sos.runtime_state, 'UNKNOWN') as runtime_state
      FROM services s
      JOIN order_items oi ON oi.id = s.order_item_id
      JOIN plan_versions pv ON pv.id = oi.plan_version_id
      JOIN nodes n ON n.id = s.node_id
      LEFT JOIN service_observed_states sos ON sos.service_id = s.id
      WHERE s.account_id = ? AND (
        s.id LIKE ? ESCAPE '\\' OR
        coalesce(s.identifier, '') LIKE ? ESCAPE '\\' OR
        pv.name LIKE ? ESCAPE '\\' OR
        n.name LIKE ? ESCAPE '\\'
      )
      LIMIT 5
    `).all(accountId, like, like, like, like) as Array<{ id: string; identifier: string | null; plan_name: string; node_name: string; runtime_state: string }>) : [];

    const tickets = query ? (db.prepare(`
      SELECT id, subject, priority, status, updated_at
      FROM tickets
      WHERE account_id = ? AND (subject LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')
      LIMIT 5
    `).all(accountId, like, like) as Array<{ id: string; subject: string; priority: string; status: string; updated_at: string }>) : [];

    const invoices = query ? (db.prepare(`
      SELECT id, coalesce(invoice_number, 'DRAFT') as invoice_number, total_minor_units, currency, status
      FROM invoices
      WHERE account_id = ? AND (coalesce(invoice_number, '') LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')
      LIMIT 5
    `).all(accountId, like, like) as Array<{ id: string; invoice_number: string; total_minor_units: number; currency: string; status: string }>) : [];

    const qLower = query.toLowerCase();
    const matchedPages = clientPages.filter(p => !qLower || p.title.toLowerCase().includes(qLower));
    const matchedActions = actions.filter(a => !qLower || a.title.toLowerCase().includes(qLower));
    const matchedAdmin = adminPages.filter(p => !qLower || p.title.toLowerCase().includes(qLower));

    const formattedServices = services.map(s => ({
      id: s.id,
      title: s.plan_name,
      subtitle: `${s.node_name} · ${s.identifier || s.id}`,
      status: s.runtime_state,
      category: 'Services',
      icon: 'server',
      path: `/app/services/${encodeURIComponent(s.id)}`,
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
             ae.resource_id, ae.ip_address, ae.correlation_id, ae.metadata, ae.created_at,
             u.name as actor_name,
             CASE WHEN ae.resource_type = 'service' THEN (
               SELECT COALESCE(json_extract(oi.custom_options, '$.serverName'), pv.name, s.identifier, s.id)
               FROM services s
               LEFT JOIN order_items oi ON oi.id = s.order_item_id
               LEFT JOIN plan_versions pv ON pv.id = oi.plan_version_id
               WHERE s.id = ae.resource_id
             ) END AS service_name,
             CASE WHEN ae.resource_type = 'service' THEN (
               SELECT pv.name FROM services s
               LEFT JOIN order_items oi ON oi.id = s.order_item_id
               LEFT JOIN plan_versions pv ON pv.id = oi.plan_version_id
               WHERE s.id = ae.resource_id
             ) END AS service_plan,
             CASE
               WHEN ae.resource_type = 'ticket' THEN (SELECT subject FROM tickets WHERE id = ae.resource_id)
               WHEN ae.resource_type = 'ticket_attachment' THEN (
                 SELECT t.subject FROM ticket_attachments ta JOIN tickets t ON t.id = ta.ticket_id WHERE ta.id = ae.resource_id
               )
             END AS ticket_subject,
             CASE
               WHEN ae.resource_type = 'ticket' THEN ae.resource_id
               WHEN ae.resource_type = 'ticket_attachment' THEN (SELECT ticket_id FROM ticket_attachments WHERE id = ae.resource_id)
             END AS ticket_id
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

  app.get('/api/v1/admin/services/:id', { preHandler: [requireAuth, requireStaffPermission('services:read')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = getAdminServiceDetail(id, getDatabase());
    if (!data) return reply.status(404).send({ error: 'Service not found.' });
    return data;
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

  app.post('/api/v1/admin/services/:id/suspend', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (req, reply) => {
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
  app.post('/api/v1/admin/services/:id/unsuspend', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (req, reply) => {
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
  app.post('/api/v1/admin/services/:id/terminate', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (req, reply) => {
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

  app.get('/api/v1/admin/audit/export', { preHandler: [requireAuth, requireStaffPermission('audit:read')] }, async (_req, reply) => {
    const rows = getDatabase().prepare(`
      SELECT id, account_id, actor_user_id, actor_type, action, resource_type,
             resource_id, ip_address, correlation_id, created_at
      FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 10000
    `).all() as Array<Record<string, unknown>>;
    const columns = ['id', 'account_id', 'actor_user_id', 'actor_type', 'action', 'resource_type', 'resource_id', 'ip_address', 'correlation_id', 'created_at'];
    const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n');
    return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="fortless-audit.csv"')
      .send(csv);
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

  app.post('/api/v1/admin/incidents', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (req, reply) => {
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

  app.post('/api/v1/admin/incidents/:id/updates', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (req, reply) => {
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

  app.patch('/api/v1/admin/components/:id', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (req, reply) => {
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

  // --- Staff Service Power Controls (Audited) ---
  // Staff: point a service at a panel server that was recreated under another id
  app.post('/api/v1/admin/services/:id/relink', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const adapter = getProviderAdapter();
    if (!(adapter instanceof PterodactylHttpAdapter)) return reply.status(503).send({ error: 'Pterodactyl provider is not configured.', code: 'PROVIDER_NOT_CONFIGURED' });
    try {
      const result = await relinkService({ serviceId: id, panelServerId: ((req.body ?? {}) as { panelServerId?: unknown }).panelServerId, actorUserId: req.auth!.user.id, ipAddress: req.ip }, adapter, getDatabase());
      recordCatalogAudit(req, 'admin.service_relinked', 'service', id, result);
      return { success: true, ...result };
    } catch (err: unknown) {
      if (err instanceof RelinkError) return reply.status(err.statusCode).send({ error: err.message, code: err.code });
      console.error('[Relink] failed:', (err as Error).name, (err as Error).message);
      return reply.status(502).send({ error: 'The panel could not be reached.', code: 'PROVIDER_ERROR' });
    }
  });

  app.post('/api/v1/admin/services/:id/power', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const powerSchema = z.object({
      action: z.enum(['START', 'STOP', 'RESTART', 'KILL']),
      reason: z.string().trim().min(3).max(300).optional(),
    });
    const parse = powerSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: 'Valid power action is required.' });

    const db = getDatabase();
    const svc = db.prepare('SELECT account_id FROM services WHERE id = ?').get(id) as { account_id: string } | undefined;
    if (!svc) return reply.status(404).send({ error: 'Service not found.' });

    try {
      const result = await executeServicePowerAction({
        serviceId: id,
        accountId: svc.account_id,
        userId: req.auth!.user.id,
        action: parse.data.action,
        ipAddress: req.ip,
      });

      recordCatalogAudit(req, 'admin.service_power_action', 'service', id, {
        action: parse.data.action,
        reason: parse.data.reason || 'Staff console invocation',
      }, db);

      return reply.send({ success: true, serviceId: id, action: parse.data.action, runtimeState: result.runtimeState });
    } catch (err: unknown) {
      return reply.status(502).send({ error: (err as Error).message });
    }
  });

  // --- Staff Service State Sync ---
  app.post('/api/v1/admin/services/:id/sync', { preHandler: [requireAuth, requireStaffPermission('services:read')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDatabase();
    const svc = db.prepare(`
      SELECT s.id, s.account_id, s.external_id, COALESCE(sos.runtime_state, 'UNKNOWN') AS runtime_state
      FROM services s
      LEFT JOIN service_observed_states sos ON sos.service_id = s.id
      WHERE s.id = ?
    `).get(id) as { id: string; account_id: string; external_id: string | null; runtime_state: string } | undefined;
    if (!svc) return reply.status(404).send({ error: 'Service not found.' });
    if (!svc.external_id || config.PROVIDER_MODE !== 'pterodactyl_1' || !(config.PTERODACTYL_KEYMINT_SECRET || config.PTERODACTYL_CLIENT_API_KEY)) {
      return reply.send({ success: true, serviceId: id, runtimeState: svc.runtime_state, synced: false });
    }
    try {
      const adapter = new PterodactylHttpAdapter({
        panelUrl: config.PTERODACTYL_PANEL_URL,
        apiKey: config.PTERODACTYL_API_KEY,
        clientApiKey: config.PTERODACTYL_CLIENT_API_KEY,
        timeoutMs: 10000,
      });
      const usage = config.PTERODACTYL_KEYMINT_SECRET
        ? await withAccountClientKey(svc.account_id, adapter, db, config.PTERODACTYL_KEYMINT_SECRET, (key) => adapter.getResourceUsage(svc.external_id!, key))
        : await adapter.getResourceUsage(svc.external_id);
      const runtimeState = usage.state === 'running' ? 'RUNNING' : usage.state === 'offline' ? 'STOPPED' : svc.runtime_state;
      db.prepare(`
        INSERT INTO service_observed_states (service_id, runtime_state, last_checked_at, raw_metrics)
        VALUES (?, ?, datetime('now', 'utc'), ?)
        ON CONFLICT(service_id) DO UPDATE SET
          runtime_state = excluded.runtime_state,
          last_checked_at = excluded.last_checked_at,
          raw_metrics = excluded.raw_metrics
      `).run(id, runtimeState, JSON.stringify(usage));
      return reply.send({ success: true, serviceId: id, runtimeState, synced: true });
    } catch (err: unknown) {
      return reply.send({ success: true, serviceId: id, runtimeState: svc.runtime_state, synced: false, error: (err as Error).message });
    }
  });

  // --- Admin Platform Settings & Diagnostic State ---
  app.get('/api/v1/admin/settings', { preHandler: [requireAuth, requireStaffPermission('admin:access')] }, async () => {
    const db = getDatabase();
    const [accountsCount, servicesCount, staffCount, catalogCount] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number },
      db.prepare('SELECT COUNT(*) as count FROM services').get() as { count: number },
      db.prepare("SELECT COUNT(*) as count FROM staff_memberships WHERE status = 'ACTIVE'").get() as { count: number },
      db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number },
    ]);

    return {
      general: {
        platformName: 'Fortless',
        appOrigin: config.APP_ORIGIN,
        nodeEnv: config.NODE_ENV,
        currency: 'EUR',
        currencyMinorUnits: 'Cents',
      },
      provider: {
        type: 'PTERODACTYL',
        mode: config.PROVIDER_MODE,
        configured: Boolean(config.PTERODACTYL_PANEL_URL && config.PTERODACTYL_API_KEY),
        panelUrl: config.PTERODACTYL_PANEL_URL ? config.PTERODACTYL_PANEL_URL.replace(/\/+$/, '') : null,
        verificationTier: config.PROVIDER_VERIFICATION_TIER,
      },
      payments: {
        mode: config.PAYMENTS_MODE,
        configured: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET),
        webhookSecretConfigured: Boolean(config.STRIPE_WEBHOOK_SECRET),
        currency: 'EUR',
      },
      email: {
        mode: config.EMAIL_MODE,
        configured: Boolean(config.SMTP_PASSWORD),
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        user: config.SMTP_USER,
        from: config.EMAIL_FROM,
      },
      security: {
        staffMfaMandatory: true,
        sessionTtlHours: 72,
        stepUpTtlMinutes: 15,
        antiSsrBlacklistActive: true,
      },
      counts: {
        accounts: accountsCount.count,
        services: servicesCount.count,
        staff: staffCount.count,
        products: catalogCount.count,
      },
    };
  });

  // --- Admin Test Provider Connection ---
  app.post('/api/v1/admin/settings/test-provider', { preHandler: [requireAuth, requireStaffPermission('services:manage'), requireRecentStepUp] }, async (_req, reply) => {
    if (config.PROVIDER_MODE !== 'pterodactyl_1' || !config.PTERODACTYL_PANEL_URL || !config.PTERODACTYL_API_KEY) {
      return reply.status(503).send({
        error: 'Pterodactyl provider is not configured. Set PTERODACTYL_PANEL_URL and PTERODACTYL_API_KEY in environment.',
        code: 'PROVIDER_NOT_CONFIGURED',
      });
    }

    const t0 = Date.now();
    try {
      const adapter = new PterodactylHttpAdapter({
        panelUrl: config.PTERODACTYL_PANEL_URL,
        apiKey: config.PTERODACTYL_API_KEY,
        timeoutMs: 15000,
      });
      const inventory = await adapter.getInventory();
      const latencyMs = Date.now() - t0;
      return reply.send({
        success: true,
        latencyMs,
        nodesCount: inventory.nodes.length,
        eggsCount: inventory.eggs.length,
        locationsCount: inventory.locations.length,
        nestsCount: inventory.nests.length,
      });
    } catch (error: unknown) {
      const latencyMs = Date.now() - t0;
      const providerError = error instanceof ProviderError ? error : null;
      return reply.status(502).send({
        success: false,
        latencyMs,
        error: providerError?.message || 'Failed to connect to Pterodactyl panel.',
        code: providerError?.code || 'PROVIDER_CONNECTION_FAILED',
      });
    }
  });

  return app;
}
