// Exposes the browser API client so it can be exercised with a stubbed fetch in a Node test.
import { apiClient } from '../../src/frontend/core/api/client.js';

export class ApiClientForTest {
  constructor() { apiClient.invalidateCsrfToken(); }
  post<T = unknown>(url: string, body?: unknown) { return apiClient.post<T>(url, body); }
}
