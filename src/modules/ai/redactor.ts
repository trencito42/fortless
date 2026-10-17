/**
 * Security & Anti-Leakage Redactor
 * Masks all payment credentials, PANs, CVVs, API tokens, passwords, and private keys
 * before context is dispatched to any external or internal LLM diagnostic engine.
 */

export interface RedactionResult {
  redactedText: string;
  redactionCount: number;
  redactedTypes: string[];
}

export function redactSensitiveData(text: string): RedactionResult {
  if (!text || typeof text !== 'string') {
    return { redactedText: '', redactionCount: 0, redactedTypes: [] };
  }

  let redacted = text;
  let count = 0;
  const types = new Set<string>();

  // 1. Private Keys (RSA, EC, OpenSSH, Generic)
  const privateKeyPattern = /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]+PRIVATE KEY-----/g;
  redacted = redacted.replace(privateKeyPattern, () => {
    count++;
    types.add('PRIVATE_KEY');
    return '[REDACTED_PRIVATE_KEY]';
  });

  // 2. Payment Cards (13 to 19 consecutive or dashed/spaced digits)
  const panPattern = /\b(?:\d[ -]*?){13,19}\b/g;
  redacted = redacted.replace(panPattern, (match) => {
    const rawDigits = match.replace(/[\s-]/g, '');
    if (rawDigits.length >= 13 && rawDigits.length <= 19) {
      count++;
      types.add('PAYMENT_CARD');
      return '[REDACTED_PAYMENT_CARD]';
    }
    return match;
  });

  // 3. CVV / CVC (3-4 digits preceded by cvc/cvv/security code)
  const cvvPattern = /(?:cvv|cvc|security\s*code|card\s*code)[:=\s]+["']?(\d{3,4})["']?/gi;
  redacted = redacted.replace(cvvPattern, (fullMatch) => {
    count++;
    types.add('CVV');
    return fullMatch.replace(/\d{3,4}/, '[REDACTED_CVV]');
  });

  // 4. Authorization Bearer Headers
  const bearerPattern = /(?:bearer|authorization[:=\s]+bearer)\s+([a-zA-Z0-9._~+/-]+=*)/gi;
  redacted = redacted.replace(bearerPattern, () => {
    count++;
    types.add('AUTH_BEARER');
    return 'Bearer [REDACTED_BEARER_TOKEN]';
  });

  // 5. API Keys & Known Provider Secrets (Pterodactyl ptla/ptlc, Stripe sk_live/sk_test/whsec, GitHub ghp_, Google AIza, JWTs)
  const knownTokensPattern = /\b(?:ptla_[a-zA-Z0-9]{30,}|ptlc_[a-zA-Z0-9]{30,}|sk_(?:live|test)_[a-zA-Z0-9_]{20,}|whsec_[a-zA-Z0-9]{24,}|ghp_[a-zA-Z0-9]{36,}|AIza[0-9A-Za-z-_]{35}|eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g;
  redacted = redacted.replace(knownTokensPattern, () => {
    count++;
    types.add('API_KEY_OR_TOKEN');
    return '[REDACTED_API_KEY]';
  });

  // 6. Explicit Passwords in Key-Value format (JSON, YAML, .env, or query params)
  const passwordPattern = /(["']?(?:password|passwd|secret|api_key|app_key|token|auth_token)["']?\s*[:=]\s*["']?)([^"',\s\r\n]{4,})(["']?)/gi;
  redacted = redacted.replace(passwordPattern, (_full, prefix, secretVal, suffix) => {
    if (secretVal.startsWith('[REDACTED_')) return _full;
    count++;
    types.add('PASSWORD_OR_SECRET');
    return `${prefix}[REDACTED_SECRET]${suffix}`;
  });

  // 7. Embedded HTTP URL Credentials (http://user:password@host)
  const urlCredPattern = /([a-z]+:\/\/[^/:]+:)([^@/:]+)(@)/gi;
  redacted = redacted.replace(urlCredPattern, (_full, prefix, _pass, suffix) => {
    count++;
    types.add('URL_CREDENTIAL');
    return `${prefix}[REDACTED_CREDENTIAL]${suffix}`;
  });

  return {
    redactedText: redacted,
    redactionCount: count,
    redactedTypes: Array.from(types),
  };
}
