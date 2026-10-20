(() => {
  'use strict';
  const page = document.body.dataset.authPage;
  const form = document.querySelector('form[data-auth-form]');
  const alertBox = document.getElementById('formAlert');
  const submit = form?.querySelector('button[type=submit]');
  const stored = localStorage.getItem('fortless_theme');
  if (stored) document.documentElement.dataset.theme = stored;
  const passwordIcons = {
    hidden: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>',
    visible: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.585 10.587a2 2 0 0 0 2.828 2.828"/><path d="M9.878 5.088A10.43 10.43 0 0 1 12 4.875c6 0 9.75 7.125 9.75 7.125a17.605 17.605 0 0 1-2.042 2.957"/><path d="M6.61 6.611C3.83 8.493 2.25 12 2.25 12s3.75 7.125 9.75 7.125a9.756 9.756 0 0 0 3.39-.612"/></svg>',
  };

  const show = (message, good = false) => {
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `alert${good ? ' good' : ''}`;
    alertBox.hidden = false;
  };
  const csrf = async () => {
    const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not initialize the secure form.');
    return (await response.json()).csrfToken;
  };
  const post = async (url, body) => {
    const csrfToken = await csrf();
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });
    let data = {};
    try { data = await response.json(); } catch { /* empty response */ }
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
  };
  document.querySelectorAll('[data-password-toggle]').forEach((button) => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
    button.setAttribute('aria-pressed', String(!visible));
    button.innerHTML = visible ? passwordIcons.hidden : passwordIcons.visible;
  }));

  if (page === 'mfa' && form) {
    const otpWrap = form.querySelector('[data-otp-wrap]');
    const recoveryWrap = form.querySelector('[data-recovery-wrap]');
    const recoveryInput = form.querySelector('#recoveryCode');
    const codeInput = form.querySelector('#code');
    const toggle = form.querySelector('[data-recovery-toggle]');
    const digits = [...form.querySelectorAll('[data-otp] input')];
    const syncOtp = () => { codeInput.value = digits.map((input) => input.value).join(''); };
    digits.forEach((input, index) => {
      input.addEventListener('input', () => {
        const numeric = input.value.replace(/\D/g, '');
        if (numeric.length >= 6) {
          digits.forEach((digit, digitIndex) => { digit.value = numeric[digitIndex] || ''; });
          syncOtp();
          digits[5]?.focus();
          return;
        }
        input.value = numeric.slice(-1);
        syncOtp();
        if (input.value) digits[index + 1]?.focus();
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Backspace' && !input.value) digits[index - 1]?.focus();
      });
      input.addEventListener('paste', (event) => {
        const pasted = event.clipboardData?.getData('text').trim() || '';
        const numeric = pasted.replace(/\D/g, '');
        if (numeric.length !== 6) return;
        event.preventDefault();
        digits.forEach((digit, digitIndex) => { digit.value = numeric[digitIndex] || ''; });
        syncOtp();
        digits[5]?.focus();
      });
    });
    toggle.addEventListener('click', () => {
      const recoveryMode = recoveryWrap.hidden;
      recoveryWrap.hidden = !recoveryMode;
      otpWrap.hidden = recoveryMode;
      recoveryInput.disabled = !recoveryMode;
      digits.forEach((input) => { input.disabled = recoveryMode; });
      toggle.textContent = recoveryMode ? 'Use authenticator code' : 'Use a recovery code';
      codeInput.value = '';
      (recoveryMode ? recoveryInput : digits[0])?.focus();
    });
    recoveryInput.addEventListener('input', () => { codeInput.value = recoveryInput.value.trim(); });
  }


  if (page === 'complete' && form) {
    const token = new URLSearchParams(location.search).get('token') || '';
    post('/api/v1/auth/register/inspect', { token }).then((data) => {
      form.email.value = data.email;
      form.hidden = false;
      form.name.focus();
    }).catch((error) => {
      document.getElementById('completeSub').textContent = 'We could not use this link.';
      show(error.message);
      document.getElementById('restart').hidden = false;
    });
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    alertBox.hidden = true;
    submit.disabled = true;
    const original = submit.textContent;
    submit.textContent = 'Please wait…';
    try {
      if (page === 'login') {
        const data = await post('/api/v1/auth/login', { email: form.email.value, password: form.password.value });
        const next = new URLSearchParams(location.search).get('next');
        const legacyRoutes = { servers: '/app', deploy: '/app/deploy', billing: '/app/billing', tickets: '/app/support', audit: '/app/activity', settings: '/app/settings' };
        const legacyDestination = legacyRoutes[location.hash.slice(1)];
        const destination = legacyDestination || (next && next.startsWith('/') && !next.startsWith('//') ? next : '/app');
        location.href = data.requiresMfa ? `/mfa/challenge?next=${encodeURIComponent(destination)}` : destination;
      } else if (page === 'mfa') {
        const otpInputs = [...form.querySelectorAll('[data-otp] input:not(:disabled)')];
        if (otpInputs.length) form.code.value = otpInputs.map((input) => input.value).join('');
        await post('/api/v1/auth/mfa/challenge', { code: form.code.value });
        const next = new URLSearchParams(location.search).get('next');
        location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
      } else if (page === 'register') {
        const email = form.email.value.trim();
        if (!form.terms.checked) { show('Accept the Terms of Service and Privacy Policy to continue.'); submit.disabled = false; submit.textContent = original; return; }
        const data = await post('/api/v1/auth/register', { email, acceptTerms: true });
        form.hidden = true;
        document.getElementById('sentEmail').textContent = email;
        document.getElementById('sent').hidden = false;
        if (data.emailDelivery === 'CONFIGURATION_REQUIRED') show('Transactional email is not configured yet, so no message was sent.');
        const resend = document.getElementById('resend');
        const hint = document.getElementById('resendHint');
        window.setTimeout(() => { resend.disabled = false; hint.textContent = 'Nothing arrived? Check spam, or send it again.'; }, 60000);
        resend.addEventListener('click', async () => {
          resend.disabled = true;
          try { await post('/api/v1/auth/register', { email, acceptTerms: true }); hint.textContent = 'Sent again. It can take a minute to arrive.'; }
          catch (error) { hint.textContent = error.message; }
        });
      } else if (page === 'complete') {
        const token = new URLSearchParams(location.search).get('token') || '';
        await post('/api/v1/auth/register/complete', { token, name: form.name.value, password: form.password.value });
        location.href = '/app/onboarding';
      } else if (page === 'forgot') {
        await post('/api/v1/auth/forgot-password', { email: form.email.value });
        form.hidden = true;
        show('If an eligible account exists, password recovery instructions can be sent. Email delivery is currently configuration-gated.', true);
      } else if (page === 'reset') {
        const token = new URLSearchParams(location.search).get('token') || '';
        await post('/api/v1/auth/reset-password', { token, password: form.password.value });
        form.hidden = true;
        show('Password changed. Every previous session has been revoked.', true);
        window.setTimeout(() => { location.href = '/login'; }, 1600);
      } else if (page === 'verify') {
        const token = new URLSearchParams(location.search).get('token') || '';
        await post('/api/v1/auth/verify-email', { token });
        show('Email verified. Sign in to continue.', true);
        window.setTimeout(() => { location.href = '/login'; }, 1200);
      }
    } catch (error) { show(error.message); submit.disabled = false; submit.textContent = original; }
  });

  // Passkey sign-in: a button, plus the browser's own passkey suggestion in the email field when it supports it.
  if (page === 'login' && window.PublicKeyCredential && navigator.credentials) {
    const toBuffer = (b64u) => { const b = atob(b64u.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer; };
    const toB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const passkeyButton = document.getElementById('passkeyLogin');
    let controller = null;
    const signIn = async (conditional) => {
      controller?.abort();
      controller = new AbortController();
      const options = await post('/api/v1/auth/passkeys/login-options', {});
      const credential = await navigator.credentials.get({
        publicKey: { challenge: toBuffer(options.challenge), rpId: options.rpId, timeout: options.timeout, userVerification: 'preferred' },
        mediation: conditional ? 'conditional' : undefined,
        signal: controller.signal,
      });
      if (!credential) return;
      await post('/api/v1/auth/passkeys/login-verify', {
        credentialId: toB64u(credential.rawId),
        challenge: options.challenge,
        clientDataJSON: toB64u(credential.response.clientDataJSON),
        authenticatorData: toB64u(credential.response.authenticatorData),
        signature: toB64u(credential.response.signature),
      });
      const next = new URLSearchParams(location.search).get('next');
      location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
    };
    if (passkeyButton) {
      passkeyButton.hidden = false;
      passkeyButton.addEventListener('click', async () => {
        alertBox && (alertBox.hidden = true);
        try { await signIn(false); }
        catch (error) {
          if (error && error.name === 'NotAllowedError') show('Passkey sign-in was cancelled.');
          else if (error && error.name !== 'AbortError') show(error.message || 'Passkey sign-in failed.');
        }
      });
    }
    form?.addEventListener('submit', () => controller?.abort());
    PublicKeyCredential.isConditionalMediationAvailable?.().then((ok) => { if (ok) signIn(true).catch(() => {}); }).catch(() => {});
  }
  if (page === 'verify') form?.requestSubmit();
  const prefill = new URLSearchParams(location.search).get('email');
  if (prefill && form && form.email && !form.email.value && prefill.length < 255) form.email.value = prefill;
})();
