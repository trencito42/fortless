import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Button, Checkbox, LogoMark, Notice } from '@/design-system';
import { OtpInput } from '@/features';
import { cn } from '@/lib/utils/cn';
import markUrl from '@/site/assets/fortless-mark.svg?url';
import markWhiteUrl from '@/site/assets/fortless-mark-white.svg?url';
import { Link, RouterProvider, useRouter } from '@/app/router';

/**
 * Sign-in, registration, email confirmation, password reset and MFA. This is only the interface: sessions, cookies, CSRF,
 * MFA and passkey verification all stay in the Fastify API (/api/v1/auth/*), which is the single authority. Nothing here
 * decides whether a person is signed in, and no response reveals whether an email address has an account.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function csrfToken(): Promise<string> {
  const res = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Could not start a secure session. Reload the page and try again.');
  return ((await res.json()) as { csrfToken: string }).csrfToken;
}
async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfToken() }, body: JSON.stringify(body) });
  let data: Record<string, unknown> = {};
  try { data = (await res.json()) as Record<string, unknown>; } catch { /* empty body */ }
  if (!res.ok) throw new Error(typeof data['error'] === 'string' ? data['error'] : 'The request could not be completed. Try again.');
  return data as T;
}
/** Only same-site absolute paths are followed after sign-in. */
const safeNext = (search: URLSearchParams) => { const n = search.get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/app'; };
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

const eyeOn = 'M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z';
const eyeOff = 'M3 3l18 18M10.6 6.3A9.7 9.7 0 0 1 12 6.25c6 0 9.75 5.75 9.75 5.75a17 17 0 0 1-3.1 3.7M6.6 7.9A16.6 16.6 0 0 0 2.25 12S6 18.75 12 18.75c1.5 0 2.9-.4 4.1-1M9.9 9.9a3 3 0 0 0 4.2 4.2';

function AField({ label, type = 'text', value, onChange, error, description, autoComplete, inputMode, readOnly, focusOnMount }: { label: string; type?: string; value: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; error?: string; description?: string; autoComplete?: string; inputMode?: 'email' | 'text'; readOnly?: boolean; focusOnMount?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [show, setShow] = useState(false);
  const pw = type === 'password';
  useEffect(() => { if (focusOnMount) input.current?.focus(); }, [focusOnMount]);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold">{label}</label>
      <div className={cn('flex min-h-12 items-center gap-2 rounded-[14px] bg-s2 px-3.5 transition-[background-color,outline-color] duration-200 focus-within:bg-s1 focus-within:outline-2 focus-within:outline-accent', error && 'outline-2 outline-bad', readOnly && 'opacity-75')}>
        <input ref={input} id={id} type={pw && show ? 'text' : type} value={value} onChange={onChange} readOnly={readOnly} autoComplete={autoComplete} inputMode={inputMode} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : description ? `${id}-d` : undefined}
          className="h-[46px] w-full min-w-0 border-0 bg-transparent text-[16px] outline-none" />
        {pw ? (
          <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((v) => !v)} className="grid size-9 shrink-0 place-items-center rounded-[11px] text-ink2 outline-none transition-colors hover:bg-s3 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
            <svg viewBox="0 0 24 24" className="size-[18px] fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={show ? eyeOff : eyeOn} /></svg>
          </button>
        ) : null}
      </div>
      {error ? <p id={`${id}-e`} role="alert" className="text-[13px] font-semibold text-bad">{error}</p> : description ? <p id={`${id}-d`} className="text-[12.5px] text-ink3">{description}</p> : null}
    </div>
  );
}

function Frame({ title, intro, children, footer, note = 'Protected session access' }: { title: string; intro: ReactNode; children: ReactNode; footer?: ReactNode; note?: string }) {
  const art = useRef<HTMLElement>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const on = (e: PointerEvent) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const el = art.current; if (!el) return; el.style.setProperty('--px', String((e.clientX / innerWidth - 0.5) * 2)); el.style.setProperty('--py', String((e.clientY / innerHeight - 0.5) * 2)); }); };
    addEventListener('pointermove', on, { passive: true });
    return () => { removeEventListener('pointermove', on); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { document.title = `${title} · Fortless`; }, [title]);
  return (
    <div className="grid min-h-dvh gap-[18px] bg-bg p-[18px] min-[781px]:grid-cols-[minmax(320px,520px)_minmax(0,1fr)] max-[780px]:block max-[780px]:p-0">
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-col rounded-3xl bg-s1 p-[clamp(24px,5vw,64px)] outline-none max-[780px]:min-h-dvh max-[780px]:rounded-none">
        <a href="/" className="inline-flex w-max items-center gap-2.5 rounded-lg text-[20px] font-extrabold leading-none tracking-[-0.04em] outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Fortless home"><LogoMark size={30} />fortless</a>
        <div className="auth-in m-auto grid w-full max-w-[390px] gap-5 py-8 max-[780px]:mt-[clamp(42px,10vh,92px)]">
          <div className="grid gap-2" style={{ '--i': 0 } as CSSProperties}><h1 className="text-[clamp(27px,4vw,36px)] font-extrabold leading-[1.08] tracking-[-0.045em]">{title}</h1><p className="text-ink2">{intro}</p></div>
          <div className="grid gap-5" style={{ '--i': 1 } as CSSProperties}>{children}</div>
          {footer ? <p className="text-center text-[13px] text-ink2 [&_a]:font-bold [&_a]:text-accent-ink" style={{ '--i': 2 } as CSSProperties}>{footer}</p> : null}
        </div>
        {note ? <p className="mt-auto flex items-center gap-2 pt-7 text-[12px] text-ink3"><span className="size-2 rounded-full bg-lime" aria-hidden="true" />{note}</p> : <span className="mt-auto" />}
      </main>
      <aside ref={art} aria-hidden="true" data-decorative className="auth-art max-[780px]:hidden" style={{ '--mark': `url("${markUrl}")`, '--mark-w': `url("${markWhiteUrl}")` } as CSSProperties}>
        <span className="pat" /><span className="shape s-lime" /><span className="shape s-blue" /><span className="shape s-dark" />
        <div className="relative z-[2] max-w-[590px]">
          <h2 className="text-[clamp(38px,6vw,76px)] font-extrabold leading-[0.96] tracking-[-0.06em]">Hosting,<br />minus the hassle.</h2>
          <p className="mt-4 max-w-[520px] text-[clamp(15px,2vw,19px)] text-[#c8d0dc]">One account for services, billing, support, and infrastructure controls.</p>
        </div>
      </aside>
    </div>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(undefined); try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  return { busy, error, setError, run };
}

/* ---------------------------------------------------------------- sign in */
const b64 = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer; };
const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function Login() {
  const { search, navigate } = useRouter();
  const [email, setEmail] = useState(search.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, setError, run } = useAction();
  const next = safeNext(search);
  const passkeys = typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;
  const controller = useRef<AbortController | null>(null);

  const passkeySignIn = async (conditional: boolean) => {
    controller.current?.abort();
    const c = (controller.current = new AbortController());
    const options = await post<{ challenge: string; rpId: string; timeout: number }>('/api/v1/auth/passkeys/login-options', {});
    const cred = (await navigator.credentials.get({ publicKey: { challenge: b64(options.challenge), rpId: options.rpId, timeout: options.timeout, userVerification: 'preferred' }, mediation: conditional ? 'conditional' : undefined, signal: c.signal })) as PublicKeyCredential | null;
    if (!cred) return;
    const r = cred.response as AuthenticatorAssertionResponse;
    await post('/api/v1/auth/passkeys/login-verify', { credentialId: b64u(cred.rawId), challenge: options.challenge, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) });
    location.assign(next);
  };
  useEffect(() => {
    if (!passkeys) return;
    (PublicKeyCredential as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> }).isConditionalMediationAvailable?.().then((ok) => { if (ok) void passkeySignIn(true).catch(() => undefined); }).catch(() => undefined);
    return () => controller.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) er.email = 'Enter a valid email address.';
    if (!password) er.password = 'Enter your password.';
    setErrors(er);
    if (Object.keys(er).length) return;
    controller.current?.abort();
    void run(async () => {
      const data = await post<{ requiresMfa?: boolean }>('/api/v1/auth/login', { email: email.trim(), password });
      if (data.requiresMfa) navigate(`/mfa/challenge?next=${encodeURIComponent(next)}`); else location.assign(next);
    });
  };
  return (
    <Frame title="Welcome back." intro="Sign in to your Fortless account." footer={<>New to Fortless? <Link to="/register">Create account</Link></>}>
      {search.get('reason') === 'expired' ? <Notice tone="info">Your session ended. Sign in again to continue.</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <AField label="Email address" type="email" autoComplete="username webauthn" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors['email']} focusOnMount />
        <AField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors['password']} />
        <div className="flex justify-end"><Link to="/forgot-password" className="text-[14px] font-bold text-accent-ink">Forgot password?</Link></div>
        <Button type="submit" variant="primary" size="lg" loading={busy} loadingLabel="Signing in">Sign in</Button>
        {passkeys ? <Button type="button" variant="secondary" size="lg" onClick={() => { setError(undefined); void passkeySignIn(false).catch((e: Error) => { if (e.name === 'NotAllowedError') setError('Passkey sign-in was cancelled.'); else if (e.name !== 'AbortError') setError(e.message || 'Passkey sign-in failed.'); }); }}>Sign in with a passkey</Button> : null}
      </form>
    </Frame>
  );
}

/* ----------------------------------------------------------------- register */
function Register() {
  const [email, setEmail] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<{ email: string; delivery: string } | null>(null);
  const [wait, setWait] = useState(0);
  const [note, setNote] = useState<string>();
  const { busy, error, run } = useAction();

  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const send = (address: string) => run(async () => {
    const data = await post<{ emailDelivery?: string }>('/api/v1/auth/register', { email: address, acceptTerms: true });
    setSent({ email: address, delivery: data.emailDelivery ?? '' }); setWait(60);
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) er['email'] = 'Enter a valid email address.';
    if (!terms) er['terms'] = 'Accept the Terms of Service and Privacy Policy to continue.';
    setErrors(er);
    if (!Object.keys(er).length) void send(email.trim());
  };

  if (sent) return (
    <Frame title="Check your inbox." intro={<>We emailed <strong className="text-ink [overflow-wrap:anywhere]">{sent.email}</strong>. New here? The message has a one-time link, valid for 24 hours, to finish your account. Already registered? It tells you to sign in instead.</>} footer={<>Already have an account? <Link to="/login">Sign in</Link> · <button type="button" className="font-bold text-accent-ink" onClick={() => setSent(null)}>Use a different email</button></>} note="">
      {sent.delivery === 'CONFIGURATION_REQUIRED' ? <Notice tone="warn">Transactional email is not configured yet, so no message was sent.</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {note ? <Notice tone="good">{note}</Notice> : null}
      <Button variant="secondary" size="lg" disabled={wait > 0} loading={busy} onClick={() => void send(sent.email).then(() => setNote('Sent again. It can take a minute to arrive.'))}>{wait > 0 ? `Send it again in ${wait}s` : 'Send it again'}</Button>
    </Frame>
  );
  return (
    <Frame title="Start with your email." intro="We’ll send a link to confirm it. Then you choose your name and password." footer={<>Already have an account? <Link to="/login">Sign in</Link></>} note="">
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <AField label="Email address" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors['email']} focusOnMount />
        <div className="grid gap-1">
          <Checkbox label={<>I agree to the <a href="/legal/terms" target="_blank" rel="noopener" className="font-bold text-accent-ink">Terms of Service</a> and <a href="/legal/privacy" target="_blank" rel="noopener" className="font-bold text-accent-ink">Privacy Policy</a>.</>} checked={terms} onCheckedChange={setTerms} />
          {errors['terms'] ? <p role="alert" className="text-[13px] font-semibold text-bad">{errors['terms']}</p> : null}
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy} loadingLabel="Sending">Continue</Button>
      </form>
    </Frame>
  );
}

/* ------------------------------------------------- finish registration (link) */
function CompleteRegistration() {
  const { search } = useRouter();
  const token = search.get('token') ?? '';
  const [email, setEmail] = useState<string | null>(null);
  const [bad, setBad] = useState<string>();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, run } = useAction();

  useEffect(() => {
    let live = true;
    post<{ email: string }>('/api/v1/auth/register/inspect', { token }).then((d) => live && setEmail(d.email)).catch((e) => live && setBad(errorText(e)));
    return () => { live = false; };
  }, [token]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (name.trim().length < 2) er['name'] = 'Enter your name.';
    if (password.length < 12) er['password'] = 'Use at least 12 characters.';
    setErrors(er);
    if (Object.keys(er).length) return;
    void run(async () => { const d = await post<{ next?: string }>('/api/v1/auth/register/complete', { token, name: name.trim(), password }); location.assign(d.next ?? '/app/onboarding'); });
  };
  if (bad) return <Frame title="We couldn’t use this link." intro={bad} footer={<Link to="/register">Start again</Link>} note="Protected one-time link"><span /></Frame>;
  return (
    <Frame title="Almost there." intro="Your email is confirmed. Choose your name and a password to finish." note="Protected one-time link">
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {email === null ? <div className="h-48 rounded-2xl bg-s2" aria-busy="true" aria-label="Checking your link" /> : (
        <form noValidate onSubmit={onSubmit} className="grid gap-4">
          <AField label="Email address" type="email" autoComplete="username" value={email} readOnly />
          <AField label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors['name']} focusOnMount />
          <AField label="Password" type="password" autoComplete="new-password" description="12+ characters with upper-case, lower-case, and a number." value={password} onChange={(e) => setPassword(e.target.value)} error={errors['password']} />
          <Button type="submit" variant="primary" size="lg" loading={busy} loadingLabel="Creating your account">Create my account</Button>
        </form>
      )}
    </Frame>
  );
}

/* ------------------------------------------- legacy verify link (pending accounts) */
function VerifyEmail() {
  const { search } = useRouter();
  const token = search.get('token') ?? '';
  const [state, setState] = useState<'working' | 'ok' | string>('working');
  useEffect(() => { let live = true; post('/api/v1/auth/verify-email', { token }).then(() => live && setState('ok')).catch((e) => live && setState(errorText(e))); return () => { live = false; }; }, [token]);
  return (
    <Frame title={state === 'ok' ? 'Email verified.' : state === 'working' ? 'Confirming your address.' : 'We couldn’t verify this link.'} intro={state === 'ok' ? 'Sign in to continue.' : state === 'working' ? 'This takes a moment.' : state} note="Account activation requires verification">
      {state === 'ok' ? <Button variant="primary" size="lg" onClick={() => location.assign('/login')}>Sign in</Button> : state === 'working' ? <div className="h-12 rounded-full bg-s2" aria-busy="true" /> : <Button variant="secondary" size="lg" onClick={() => location.assign('/login')}>Back to sign in</Button>}
    </Frame>
  );
}

/* ------------------------------------------------------------ password reset */
function Forgot() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();
  if (done) return <Frame title="Check your inbox." intro="If an eligible account exists for that address, a reset link is on its way." footer={<Link to="/login">Back to sign in</Link>}><span /></Frame>;
  return (
    <Frame title="Reset your password." intro="Enter your email and we’ll send a link to choose a new one." footer={<Link to="/login">Back to sign in</Link>}>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!EMAIL.test(email.trim())) { setErr('Enter a valid email address.'); return; } setErr(undefined); void run(async () => { await post('/api/v1/auth/forgot-password', { email: email.trim() }); setDone(true); }); }}>
        <AField label="Email address" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={err} focusOnMount />
        <Button type="submit" variant="primary" size="lg" loading={busy} loadingLabel="Sending">Send reset link</Button>
      </form>
    </Frame>
  );
}

function Reset() {
  const { search } = useRouter();
  const token = search.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();
  if (!token) return <Frame title="This link is incomplete." intro="Open the link from your email again, or request a new one." footer={<Link to="/forgot-password">Request a new link</Link>}><span /></Frame>;
  if (done) return <Frame title="Password changed." intro="Every previous session has been signed out. Sign in with your new password."><Button variant="primary" size="lg" onClick={() => location.assign('/login')}>Sign in</Button></Frame>;
  return (
    <Frame title="Choose a new password." intro="Pick something you haven’t used elsewhere." footer={<Link to="/login">Back to sign in</Link>}>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (password.length < 12) { setErr('Use at least 12 characters.'); return; } setErr(undefined); void run(async () => { await post('/api/v1/auth/reset-password', { token, password }); setDone(true); }); }}>
        <AField label="New password" type="password" autoComplete="new-password" description="12+ characters with upper-case, lower-case, and a number." value={password} onChange={(e) => setPassword(e.target.value)} error={err} focusOnMount />
        <Button type="submit" variant="primary" size="lg" loading={busy} loadingLabel="Saving">Change password</Button>
      </form>
    </Frame>
  );
}

/* ----------------------------------------------------------------------- MFA */
/** Apple Pay style confirmation: the ring draws, fills, then the check is drawn. */
function SuccessCheck() {
  return (
    <div className="grid place-items-center py-6" role="status" aria-label="Verified">
      <svg viewBox="0 0 96 96" width="96" height="96" className="ok-check" aria-hidden="true">
        <circle className="disc" cx="48" cy="48" r="44" fill="var(--good)" />
        <circle className="ring" cx="48" cy="48" r="44" fill="none" stroke="var(--good)" strokeWidth="4" strokeLinecap="round" transform="rotate(-90 48 48)" />
        <path className="tick" d="M30 49.5 43 62 67 36" fill="none" stroke="var(--on-ink)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Mfa() {
  const { search } = useRouter();
  const next = safeNext(search);
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const { busy, error, setError, run } = useAction();
  const [verified, setVerified] = useState(false);
  const verify = (c: string) => run(async () => {
    await post('/api/v1/auth/mfa/challenge', { code: c });
    setVerified(true);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => location.assign(next), reduced ? 350 : 1000);
  });
  if (verified) return <Frame title="Verified." intro="Taking you in…" note="Protected session challenge"><SuccessCheck /></Frame>;
  return (
    <Frame title="Verify it’s you." intro={recovery ? 'Enter one of your recovery codes. Each works once.' : 'Enter the six-digit code from your authenticator app.'} footer={<Link to="/login">Use another account</Link>} note="Protected session challenge">
      {recovery ? (
        <form noValidate className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (code.trim().length < 6) { setError('Enter a valid recovery code.'); return; } void verify(code.trim()); }}>
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <AField label="Recovery code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} focusOnMount />
          <Button type="submit" variant="primary" size="lg" loading={busy} loadingLabel="Checking">Continue</Button>
        </form>
      ) : <OtpInput onComplete={(c) => verify(c)} error={error} disabled={busy} />}
      <Button variant="ghost" onClick={() => { setRecovery((r) => !r); setError(undefined); setCode(''); }}>{recovery ? 'Use authenticator code' : 'Use a recovery code'}</Button>
    </Frame>
  );
}

function Screen() {
  const { path } = useRouter();
  switch (path) {
    case '/register': return <Register />;
    case '/complete-registration': return <CompleteRegistration />;
    case '/verify-email': return <VerifyEmail />;
    case '/forgot-password': return <Forgot />;
    case '/reset-password': return <Reset />;
    case '/mfa/challenge': return <Mfa />;
    default: return <Login />;
  }
}

export default function AuthApp() {
  return <RouterProvider><Screen /></RouterProvider>;
}
