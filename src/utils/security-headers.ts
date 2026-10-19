import crypto from 'node:crypto';

/**
 * SEC-10: response headers set by the application itself, so protection does not depend on the edge proxy being
 * configured identically. The Content-Security-Policy for HTML allows exactly the inline scripts present in that page
 * (by SHA-256 hash) and no others.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return [...new Set(hashes)];
}

export function contentSecurityPolicy(html: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: wss:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export function baseSecurityHeaders(secureTransport: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), publickey-credentials-get=(self), publickey-credentials-create=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (secureTransport) headers['Strict-Transport-Security'] = 'max-age=31536000';
  return headers;
}
