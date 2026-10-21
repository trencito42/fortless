export class AdminApiError extends Error { constructor(message: string, readonly code: string, readonly status: number) { super(message); } }
let csrf: string | null = null;
export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers); headers.set('Accept', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrf) { const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin', cache: 'no-store' }); if (!response.ok) throw new AdminApiError('Could not initialize the secure session.', 'CSRF_INIT_FAILED', response.status); csrf = String(((await response.json()) as { csrfToken?: string }).csrfToken ?? ''); }
    headers.set('X-CSRF-Token', csrf);
  }
  const response = await fetch(`/api/v1/admin${path}`, { ...init, method, headers, credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); throw new AdminApiError('Session expired.', 'SESSION_EXPIRED', 401); }
  const contentType = response.headers.get('content-type') ?? ''; const raw = await response.text();
  if (!contentType.includes('application/json')) throw new AdminApiError('Admin API returned a non-JSON response.', 'INVALID_RESPONSE', response.status || 502);
  let body: Record<string, unknown>; try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { throw new AdminApiError('Admin API returned malformed JSON.', 'INVALID_RESPONSE', 502); }
  if (!response.ok) throw new AdminApiError(String(body['message'] ?? body['error'] ?? `Request failed (${response.status}).`), String(body['code'] ?? 'HTTP_ERROR'), response.status);
  return body as T;
}
