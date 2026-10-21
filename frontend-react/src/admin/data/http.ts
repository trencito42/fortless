export class AdminApiError extends Error { constructor(message: string, readonly code: string, readonly status: number) { super(message); } }
let csrf: string | null = null;
async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers); headers.set('Accept', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrf) { const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin', cache: 'no-store' }); if (!response.ok) throw new AdminApiError('Could not initialize the secure session.', 'CSRF_INIT_FAILED', response.status); csrf = String(((await response.json()) as { csrfToken?: string }).csrfToken ?? ''); }
    headers.set('X-CSRF-Token', csrf);
  }
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, method, headers, credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); throw new AdminApiError('Session expired.', 'SESSION_EXPIRED', 401); }
  const contentType = response.headers.get('content-type') ?? ''; const raw = await response.text();
  if (!contentType.includes('application/json')) throw new AdminApiError('Admin API returned a non-JSON response.', 'INVALID_RESPONSE', response.status || 502);
  let body: Record<string, unknown>; try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { throw new AdminApiError('Admin API returned malformed JSON.', 'INVALID_RESPONSE', 502); }
  if (!response.ok) throw new AdminApiError(String(body['message'] ?? body['error'] ?? `Request failed (${response.status}).`), String(body['code'] ?? 'HTTP_ERROR'), response.status);
  return body as T;
}

export function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestJson<T>(`/api/v1/admin${path}`, init);
}

export function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestJson<T>(`/api/v1/auth${path}`, init);
}

/** Authenticated GET that returns a file (audit CSV). Errors are JSON and keep their code so step-up can be requested. */
export async function adminDownload(path: string): Promise<{ blob: Blob; truncated: boolean }> {
  const response = await fetch(`/api/v1/admin${path}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/csv, application/json' } });
  if (response.status === 401) { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); throw new AdminApiError('Session expired.', 'SESSION_EXPIRED', 401); }
  if (!response.ok) {
    let body: Record<string, unknown> = {}; try { body = await response.json() as Record<string, unknown>; } catch { /* non-JSON error */ }
    throw new AdminApiError(String(body['message'] ?? body['error'] ?? `Download failed (${response.status}).`), String(body['code'] ?? 'HTTP_ERROR'), response.status);
  }
  return { blob: await response.blob(), truncated: response.headers.get('X-Fortless-Truncated') === 'true' };
}
