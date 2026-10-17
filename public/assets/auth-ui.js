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
        const data = await post('/api/v1/auth/register', { name: form.name.value, email: form.email.value, password: form.password.value });
        form.hidden = true;
        show(data.emailDelivery === 'CONFIGURATION_REQUIRED'
          ? 'Your account is pending verification. Transactional email is not configured yet, so no message was sent.'
          : 'Check your inbox to verify the account.', true);
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
        show('Email verified. Opening your dashboard…', true);
        window.setTimeout(() => { location.href = '/app'; }, 900);
      }
    } catch (error) { show(error.message); submit.disabled = false; submit.textContent = original; }
  });
  if (page === 'verify') form?.requestSubmit();
})();
