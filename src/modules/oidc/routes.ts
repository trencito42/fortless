import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../../config/index.js';
import { getDatabase } from '../../database/index.js';
import { PterodactylHttpAdapter } from '../provisioning/adapter.js';
import { ensureAccountPanelAccess } from '../provisioning/panel-link.js';
import {
  OidcError, panelLoginUrl, authenticateClient, discoveryDocument, exchangeCode, issueAuthorizationCode, jwks,
  resolvePanelIdentity, userInfo, validateAuthorizeClient, validateAuthorizeRequest,
} from './oidc.js';

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function errorPage(reply: FastifyReply, status: number, message: string, backHref = '/app') {
  return reply.status(status).type('text/html').header('Cache-Control', 'no-store').send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panel access</title><link rel="stylesheet" href="/assets/auth-ui.css"></head><body><main class="auth-shell"><section class="auth-main"><div class="auth-card"><span class="eyebrow">Hosting panel</span><h1>Can't open the panel.</h1><p class="sub">${escapeHtml(message)}</p><a class="btn" href="${escapeHtml(backHref)}">Back to Fortless</a></div></section></main></body></html>`
  );
}

function oauthError(reply: FastifyReply, err: OidcError) {
  return reply.status(err.status).header('Cache-Control', 'no-store').header('Pragma', 'no-cache')
    .send({ error: err.code, error_description: err.message });
}

export function registerOidcRoutes(app: FastifyInstance): void {
  app.get('/.well-known/openid-configuration', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return discoveryDocument();
  });

  app.get('/panel/open', async (req, reply) => {
    if (!req.auth) return reply.header('Cache-Control', 'no-store').redirect('/login?next=%2Fpanel%2Fopen');
    const target = panelLoginUrl();
    if (!target) return errorPage(reply, 503, 'Single sign-on to the hosting panel is not configured yet.');
    try {
      // Only OWNER/TECH_ADMIN may provision or reuse the account's panel user.
      if (!['OWNER', 'TECH_ADMIN'].includes(req.auth.membership.role)) {
        throw new OidcError('access_denied', 'Your role does not allow hosting panel access.', 403);
      }
      const hasService = Boolean(getDatabase().prepare(
        `SELECT 1 FROM services s WHERE s.external_id IS NOT NULL
           AND (s.account_id = ? OR s.id IN (SELECT service_id FROM service_members WHERE user_id = ?)) LIMIT 1`
      ).get(req.auth.account.id, req.auth.user.id));
      if (hasService && config.PROVIDER_MODE === 'pterodactyl_1') {
        const adapter = new PterodactylHttpAdapter({ panelUrl: config.PTERODACTYL_PANEL_URL, apiKey: config.PTERODACTYL_API_KEY, timeoutMs: 15000 });
        await ensureAccountPanelAccess(req.auth.account.id, adapter);
      }
      resolvePanelIdentity(req.auth.account.id, req.auth.user.id);
    } catch (err) {
      if (err instanceof OidcError) return errorPage(reply, err.status, err.message);
      req.log.error(err);
      return errorPage(reply, 502, 'The hosting panel could not prepare your account. Try again in a moment.');
    }
    return reply.header('Cache-Control', 'no-store').redirect(target);
  });

  app.get('/oidc/jwks', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return jwks();
  });

  app.get('/oidc/authorize', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const params = {
      clientId: q['client_id'], redirectUri: q['redirect_uri'], responseType: q['response_type'], scope: q['scope'],
      state: q['state'], nonce: q['nonce'], codeChallenge: q['code_challenge'], codeChallengeMethod: q['code_challenge_method'],
    };

    let redirectUri: string;
    try {
      ({ redirectUri } = validateAuthorizeClient(params));
    } catch (err) {
      if (err instanceof OidcError) return errorPage(reply, err.status, err.message);
      throw err;
    }

    const redirectWith = (extra: Record<string, string>) => {
      const url = new URL(redirectUri);
      for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
      if (params.state) url.searchParams.set('state', params.state);
      return reply.header('Cache-Control', 'no-store').redirect(url.toString());
    };

    let scope: string;
    try {
      ({ scope } = validateAuthorizeRequest(params));
    } catch (err) {
      if (err instanceof OidcError) return redirectWith({ error: err.code, error_description: err.message });
      throw err;
    }

    if (!req.auth) {
      return reply.header('Cache-Control', 'no-store').redirect(`/login?next=${encodeURIComponent(req.url)}`);
    }

    try {
      resolvePanelIdentity(req.auth.account.id, req.auth.user.id);
    } catch (err) {
      if (err instanceof OidcError) return errorPage(reply, err.status, err.message);
      throw err;
    }

    const code = issueAuthorizationCode({
      accountId: req.auth.account.id,
      userId: req.auth.user.id,
      redirectUri,
      scope,
      nonce: params.nonce,
      codeChallenge: params.codeChallenge,
      authTime: Math.floor(Date.now() / 1000),
    });
    return redirectWith({ code });
  });

  app.post('/oidc/token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
    const body = (req.body ?? {}) as Record<string, string | undefined>;
    try {
      let clientId = body['client_id'];
      let clientSecret = body['client_secret'];
      const basic = req.headers['authorization'];
      if (basic?.startsWith('Basic ')) {
        const [id, ...rest] = Buffer.from(basic.slice(6), 'base64').toString('utf8').split(':');
        clientId = decodeURIComponent(id ?? '');
        clientSecret = decodeURIComponent(rest.join(':'));
      }
      authenticateClient(clientId, clientSecret);
      if (body['grant_type'] !== 'authorization_code') {
        throw new OidcError('unsupported_grant_type', 'Only authorization_code is supported.');
      }
      return exchangeCode({ code: body['code'], redirectUri: body['redirect_uri'], codeVerifier: body['code_verifier'] });
    } catch (err) {
      if (err instanceof OidcError) return oauthError(reply, err);
      throw err;
    }
  });

  app.get('/oidc/userinfo', async (req, reply) => {
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      return reply.status(401).header('WWW-Authenticate', 'Bearer').send({ error: 'invalid_token' });
    }
    try {
      return userInfo(header.slice(7));
    } catch (err) {
      if (err instanceof OidcError) {
        return reply.status(err.status).header('WWW-Authenticate', `Bearer error="${err.code}"`).send({ error: err.code, error_description: err.message });
      }
      throw err;
    }
  });
}
