import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Checkbox, LogoMark, Notice, TextField } from '@/design-system';
import { OtpInput } from '@/features';
import { Link, useRouter } from '../router';

type View = 'login' | 'register' | 'verify-email' | 'reset' | 'reset-sent' | 'mfa';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Frame({ title, intro, children, footer }: { title: string; intro: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="grid w-full max-w-md gap-6">
        <Link to="/app" aria-label="Fortless home" className="justify-self-center"><LogoMark size={36} /></Link>
        <div className="grid gap-5 rounded-xl border border-ink/10 bg-s1 p-6 sm:p-8">
          <div className="grid gap-1.5"><h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.045em]">{title}</h1><p className="text-ink2">{intro}</p></div>
          {children}
        </div>
        {footer ? <p className="text-center text-[14px] text-ink2">{footer}</p> : null}
        <p className="text-center text-[13px] text-ink3">Prototype: sign-in is simulated. Any valid-looking email works; use <span className="font-mono font-semibold">wrong@example.com</span> to see a failure.</p>
      </div>
    </main>
  );
}

/** Auth screens. They share one frame, never show the app shell and never reveal whether an email exists. */
export default function AuthPages() {
  const { path, navigate } = useRouter();
  const view = (path.split('/')[2] ?? 'login') as View;
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState(''); const [remember, setRemember] = useState(true); const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}); const [form, setForm] = useState<string>(); const [busy, setBusy] = useState(false); const [mfaError, setMfaError] = useState<string>();
  const go = (v: View) => { setErrors({}); setForm(undefined); navigate(`/auth/${v}`); };

  const submit = (fn: () => Record<string, string> | Promise<Record<string, string> | void>) => async (e: FormEvent) => {
    e.preventDefault(); setForm(undefined);
    const errs = await Promise.resolve(fn()); setErrors(errs ?? {});
  };
  const run = async (next: () => void, fail?: string) => { setBusy(true); await wait(500); setBusy(false); if (fail) setForm(fail); else next(); };

  if (view === 'register') {
    const onSubmit = submit(() => {
      const er: Record<string, string> = {};
      if (!name.trim()) er.name = 'Enter your name.';
      if (!EMAIL.test(email)) er.email = 'Enter a valid email address.';
      if (password.length < 10) er.password = 'Use at least 10 characters.';
      if (!terms) er.terms = 'Accept the terms to create an account.';
      if (Object.keys(er).length === 0) void run(() => go('verify-email'));
      return er;
    });
    return (
      <Frame title="Create your account" intro="Deploy a server in a few minutes. No card needed to sign up." footer={<>Already have an account? <Link to="/auth/login" className="font-bold text-accent-ink underline">Sign in</Link></>}>
        <form noValidate onSubmit={onSubmit} className="grid gap-4">
          <TextField label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <TextField label="Password" type="password" autoComplete="new-password" description="At least 10 characters." value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <div className="grid gap-1"><Checkbox label="I agree to the Terms of Service and Privacy Policy" checked={terms} onCheckedChange={setTerms} />{errors.terms ? <p role="alert" className="text-[13px] font-semibold text-bad">{errors.terms}</p> : null}</div>
          <Button type="submit" variant="primary" size="lg" loading={busy}>Create account</Button>
        </form>
      </Frame>
    );
  }

  if (view === 'verify-email') {
    return (
      <Frame title="Check your email" intro={<>We sent a verification link to <strong className="text-ink">{email || 'your email address'}</strong>. It expires in 24 hours.</>}>
        {form ? <Notice tone="good">{form}</Notice> : null}
        <div className="grid gap-2">
          <Button variant="primary" size="lg" onClick={() => navigate('/app')}>I verified my email</Button>
          <Button variant="secondary" size="lg" loading={busy} onClick={() => void run(() => setForm('Verification email sent again.'))}>Resend email</Button>
          <Button variant="ghost" onClick={() => go('register')}>Use a different email</Button>
        </div>
      </Frame>
    );
  }

  if (view === 'reset' || view === 'reset-sent') {
    if (view === 'reset-sent') return (
      <Frame title="Check your email" intro="If an account exists for that address, a reset link is on its way. It expires in 30 minutes.">
        <Button variant="secondary" size="lg" onClick={() => go('login')}>Back to sign in</Button>
      </Frame>
    );
    const onSubmit = submit(() => { const er: Record<string, string> = EMAIL.test(email) ? {} : { email: 'Enter a valid email address.' }; if (!er.email) void run(() => go('reset-sent')); return er; });
    return (
      <Frame title="Reset your password" intro="Enter your email and we will send you a link to choose a new password." footer={<Link to="/auth/login" className="font-bold text-accent-ink underline">Back to sign in</Link>}>
        <form noValidate onSubmit={onSubmit} className="grid gap-4">
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <Button type="submit" variant="primary" size="lg" loading={busy}>Send reset link</Button>
        </form>
      </Frame>
    );
  }

  if (view === 'mfa') {
    return (
      <Frame title="Two-step verification" intro="Enter the 6-digit code from your authenticator app. Demo code: 123456." footer={<Link to="/auth/login" className="font-bold text-accent-ink underline">Use a different account</Link>}>
        <OtpInput onComplete={async (code) => { setBusy(true); await wait(400); setBusy(false); if (code === '123456') navigate('/app'); else setMfaError('That code is not valid. Check the time on your phone and try again.'); }} error={mfaError} disabled={busy} />
        <Button variant="ghost" onClick={() => setMfaError('Recovery codes are entered on the production sign-in screen.')}>Use a recovery code</Button>
      </Frame>
    );
  }

  const onSubmit = submit(() => {
    const er: Record<string, string> = {};
    if (!EMAIL.test(email)) er.email = 'Enter a valid email address.';
    if (!password) er.password = 'Enter your password.';
    if (Object.keys(er).length === 0) void run(() => navigate(email.startsWith('mfa') ? '/auth/mfa' : '/app'), email === 'wrong@example.com' ? 'Email or password is incorrect.' : undefined);
    return er;
  });
  return (
    <Frame title="Sign in to Fortless" intro="Manage your servers, billing and support in one place." footer={<>New to Fortless? <Link to="/auth/register" className="font-bold text-accent-ink underline">Create an account</Link></>}>
      {form ? <Notice tone="bad">{form}</Notice> : null}
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <TextField label="Email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="flex flex-wrap items-center justify-between gap-2"><Checkbox label="Keep me signed in" checked={remember} onCheckedChange={setRemember} /><Link to="/auth/reset" className="text-[14px] font-bold text-accent-ink underline">Forgot password?</Link></div>
        <Button type="submit" variant="primary" size="lg" loading={busy}>Sign in</Button>
      </form>
    </Frame>
  );
}
