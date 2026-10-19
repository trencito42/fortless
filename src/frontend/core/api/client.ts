import { ApiError, SessionExpiredError, StepUpRequiredError } from './errors.js';

export interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type StepUpInterceptor = (
  retry: () => Promise<unknown>,
  reject: (err: Error) => void
) => void;

class ApiClient {
  private csrfToken: string | null = null;
  private stepUpInterceptor: StepUpInterceptor | null = null;

  public setStepUpInterceptor(interceptor: StepUpInterceptor | null) {
    this.stepUpInterceptor = interceptor;
  }

  public async getCsrfToken(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    const res = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
    if (!res.ok) throw new ApiError('Failed to initialize secure session.', res.status);
    const data = (await res.json()) as { csrfToken: string };
    this.csrfToken = data.csrfToken;
    return this.csrfToken;
  }

  public invalidateCsrfToken() {
    this.csrfToken = null;
  }

  public async request<T = unknown>(url: string, options: RequestOptions = {}, csrfRetried = false): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const headers: Record<string, string> = { ...(options.headers || {}) };

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!headers['X-CSRF-Token']) {
        headers['X-CSRF-Token'] = await this.getCsrfToken();
      }
    }

    const res = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'same-origin',
    });

    let data: any = {};
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (res.status === 401) {
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
      }
      throw new SessionExpiredError(data.message || data.error);
    }

    // NEW-405: the CSRF cookie expires after an hour and the token is tied to the session; fetch a fresh one once and retry.
    if (res.status === 403 && data.code === 'CSRF_INVALID' && !csrfRetried && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      this.invalidateCsrfToken();
      const retryHeaders = { ...(options.headers || {}) };
      delete retryHeaders['X-CSRF-Token'];
      return this.request<T>(url, { ...options, headers: retryHeaders }, true);
    }

    if (res.status === 403 && (data.error === 'STEP_UP_REQUIRED' || data.code === 'STEP_UP_REQUIRED')) {
      if (this.stepUpInterceptor) {
        return new Promise<T>((resolve, reject) => {
          this.stepUpInterceptor!(
            () => this.request<T>(url, options).then(resolve).catch(reject),
            reject
          );
        });
      }
      throw new StepUpRequiredError(data.message || 'Recent MFA step-up verification required.');
    }

    if (!res.ok) {
      const msg = data.message || data.error || `HTTP ${res.status} error`;
      throw new ApiError(msg, res.status, data.code || data.error, data);
    }

    return data as T;
  }

  public get<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  public post<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const headers: Record<string, string> = { ...(options?.headers || {}) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const headers: Record<string, string> = { ...(options?.headers || {}) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();

// Callable api helper for clean function-style or method-style invocations:
// api('/url', options) or api.post('/url', body)
export interface ApiFunction {
  <T = unknown>(url: string, options?: RequestOptions): Promise<T>;
  get: <T = unknown>(url: string, options?: RequestOptions) => Promise<T>;
  post: <T = unknown>(url: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  patch: <T = unknown>(url: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  delete: <T = unknown>(url: string, options?: RequestOptions) => Promise<T>;
  setStepUpInterceptor: (interceptor: StepUpInterceptor | null) => void;
  getCsrfToken: () => Promise<string>;
  invalidateCsrfToken: () => void;
}

const apiFn = ((url: string, options?: RequestOptions) => {
  return apiClient.request(url, options);
}) as ApiFunction;

apiFn.get = (url, opts) => apiClient.get(url, opts);
apiFn.post = (url, body, opts) => apiClient.post(url, body, opts);
apiFn.patch = (url, body, opts) => apiClient.patch(url, body, opts);
apiFn.delete = (url, opts) => apiClient.delete(url, opts);
apiFn.setStepUpInterceptor = (interceptor) => apiClient.setStepUpInterceptor(interceptor);
apiFn.getCsrfToken = () => apiClient.getCsrfToken();
apiFn.invalidateCsrfToken = () => apiClient.invalidateCsrfToken();

export const api = apiFn;

export function setStepUpInterceptor(interceptor: StepUpInterceptor | null) {
  apiClient.setStepUpInterceptor(interceptor);
}
