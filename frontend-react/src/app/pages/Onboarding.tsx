import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, LogoMark, Select, Switch, TextField, type IconName } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { Link, useNavigate } from '../router';
import { useApi, useApiQuery } from '../data/DataProvider';
import type { NotificationPrefs } from '../domain/types';

/**
 * Account setup after sign-up. It is about the ACCOUNT, not about deploying a server (that is /app/deploy).
 *
 * What is saved where:
 *  - Your name        -> PATCH /api/v1/account/profile (only asked when the account has no usable name).
 *  - Email alerts     -> PUT  /api/v1/notification-preferences (billing, service and support email).
 *  - Teammate invite  -> POST /api/v1/account/members/invite.
 *  - "What you will build" and experience level have NO backend storage. They only personalise the last screen and are kept in this browser.
 *  - Progress and the "finished" marker are kept in this browser too. They are a convenience, never an access check: nothing in the app is gated on them.
 */

type Step = 'welcome' | 'build' | 'profile' | 'alerts' | 'team' | 'done';
const ORDER: Step[] = ['welcome', 'build', 'profile', 'alerts', 'team', 'done'];
const LABEL: Record<Step, string> = { welcome: 'Welcome', build: 'What you’ll build', profile: 'Your name', alerts: 'Security and alerts', team: 'Your team', done: 'Ready' };

const USES: { id: string; label: string; hint: string; icon: IconName }[] = [
  { id: 'games', label: 'Game servers', hint: 'Minecraft, Counter-Strike and more', icon: 'flag-01' },
  { id: 'bots', label: 'Discord bots', hint: 'Always online, auto-restart', icon: 'discord' },
  { id: 'apps', label: 'Apps and APIs', hint: 'Node.js and Python', icon: 'code' },
  { id: 'domains', label: 'Domains', hint: 'Register and manage DNS', icon: 'globe-02' },
  { id: 'explore', label: 'Just looking', hint: 'Show me around first', icon: 'sparkles' },
];
const LEVELS = [
  { id: 'new', label: 'New to hosting', hint: 'Keep the explanations coming.' },
  { id: 'some', label: 'Some experience', hint: 'I have run a server before.' },
  { id: 'pro', label: 'I do this for work', hint: 'Show me the technical controls.' },
];
const ROLES = [{ value: 'admin', label: 'Technical admin: manage services' }, { value: 'viewer', label: 'Viewer: read-only access' }];

interface Saved { step: Step; uses: string[]; level: string; done: boolean; invited: string; alerts?: { billing: boolean; service: boolean; support: boolean } }
const blank: Saved = { step: 'welcome', uses: [], level: '', done: false, invited: '' };
const KEY = (id: string) => `fl-onboarding:${id}`;
function read(id: string): Saved { try { const v = JSON.parse(localStorage.getItem(KEY(id)) ?? 'null') as Saved | null; return v && ORDER.includes(v.step) ? { ...blank, ...v } : blank; } catch { return blank; } }
function write(id: string, v: Saved) { try { localStorage.setItem(KEY(id), JSON.stringify(v)); } catch { /* storage unavailable: progress lasts for this visit only */ } }

const looksUnset = (n: string, email: string) => !n.trim() || n.trim().toLowerCase() === email.toLowerCase() || n.includes('@');

export default function Onboarding() {
  const api = useApi();
  const nav = useNavigate();
  const who = useApiQuery((a) => a.identity());
  const prefsQ = useApiQuery((a) => a.notificationPrefs());

  if (who.status === 'error') return <Shell step="welcome" pct={0}><div role="alert" className="grid gap-3"><h1 className="text-[28px] font-extrabold tracking-[-0.03em]">We couldn’t load your account</h1><p className="text-ink2">Your session may have expired. Sign in again to continue; nothing you have done is lost.</p><div><a href={`/login?next=${encodeURIComponent('/app/onboarding')}`} className="inline-flex h-11 items-center rounded-full bg-accent px-5 font-bold text-on-accent">Sign in</a></div></div></Shell>;
  if (who.status !== 'ready') return <Shell step="welcome" pct={0}><div aria-busy="true" aria-label="Loading" className="grid gap-3"><div className="h-9 w-72 rounded-full bg-s2" /><div className="h-5 w-96 max-w-full rounded-full bg-s2" /></div></Shell>;
  return <Flow key={who.data.email} identity={who.data} prefs={prefsQ.status === 'ready' ? prefsQ.data : null} prefsFailed={prefsQ.status === 'error'} api={api} go={nav} />;
}

function Shell({ step, pct, children, aside }: { step: Step; pct: number; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-s1 text-ink lg:grid lg:grid-cols-[minmax(300px,400px)_1fr]">
      <aside className="bg-night px-5 py-5 text-night-ink sm:px-8 lg:min-h-dvh lg:py-10" aria-label="Setup progress">
        <div className="flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 font-extrabold tracking-[-0.04em]" aria-label="Fortless home"><LogoMark size={26} className="text-night-ink" /><span className="text-[19px]">fortless</span></a>
          <Link to="/app" className="text-[13px] font-semibold text-night-dim underline-offset-2 hover:text-night-ink hover:underline">Skip setup</Link>
        </div>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-night3" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-lime transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[13px] text-night-dim">{step === 'welcome' ? 'About two minutes' : LABEL[step]}</p>
        {aside}
      </aside>
      <main id="main" className="px-4 py-8 sm:px-8 lg:px-14 lg:py-14"><div className="mx-auto w-full max-w-[680px]">{children}</div></main>
    </div>
  );
}

function Flow({ identity, prefs, prefsFailed, api, go }: { identity: { fullName: string; email: string; mfaEnabled: boolean }; prefs: NotificationPrefs | null; prefsFailed: boolean; api: ReturnType<typeof useApi>; go: (to: string) => void }) {
  const id = identity.email;
  const [saved] = useState(() => read(id));
  const needsName = looksUnset(identity.fullName, identity.email);
  const [step, setStep] = useState<Step>(saved.step === 'done' ? 'welcome' : saved.step);
  const [uses, setUses] = useState<string[]>(saved.uses);
  const [level, setLevel] = useState(saved.level);
  const [name, setName] = useState(needsName ? '' : identity.fullName);
  const [alerts, setAlerts] = useState(() => saved.alerts ?? { billing: prefs?.topics.billing?.email ?? true, service: prefs?.topics.service?.email ?? true, support: prefs?.topics.support?.email ?? true });
  const [invite, setInvite] = useState('');
  const [role, setRole] = useState('admin');
  const [invited, setInvited] = useState(saved.invited);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstName = (name || identity.fullName).trim().split(/\s+/)[0] ?? '';

  // Screens actually shown. The name screen only appears when we do not already know the name.
  const steps = useMemo(() => ORDER.filter((s) => s !== 'profile' || needsName), [needsName]);
  const idx = steps.indexOf(step);
  const pct = Math.round((idx / (steps.length - 1)) * 100);

  useEffect(() => { write(id, { step, uses, level, done: step === 'done' || saved.done, invited, alerts }); }, [id, step, uses, level, invited, alerts, saved.done]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo?.({ top: 0 }); }, [step]);
  useEffect(() => { if (prefs && !saved.alerts) setAlerts({ billing: prefs.topics.billing?.email ?? true, service: prefs.topics.service?.email ?? true, support: prefs.topics.support?.email ?? true }); }, [prefs, saved.alerts]);

  const move = useCallback((to: Step) => { setErrors({}); setStep(to); }, []);
  const next = () => move(steps[Math.min(steps.length - 1, idx + 1)]!);
  const back = () => move(steps[Math.max(0, idx - 1)]!);

  async function continueFrom() {
    const er: Record<string, string> = {};
    if (step === 'build' && uses.length === 0) er.uses = 'Choose at least one, or “Just looking”.';
    if (step === 'profile' && !name.trim()) er.name = 'Enter the name we should use.';
    if (step === 'team' && invite.trim() && !/^\S+@\S+\.\S+$/.test(invite.trim())) er.invite = 'Enter a valid email address, or leave it empty.';
    if (Object.keys(er).length) { setErrors(er); return; }
    setBusy(true);
    try {
      if (step === 'profile') await api.saveProfile({ fullName: name.trim() });
      if (step === 'alerts' && prefs) {
        await api.saveNotificationPrefs({ ...prefs, topics: { ...prefs.topics, billing: { ...prefs.topics.billing!, email: alerts.billing }, service: { ...prefs.topics.service!, email: alerts.service }, support: { ...prefs.topics.support!, email: alerts.support } } });
      }
      if (step === 'team' && invite.trim()) {
        await api.inviteMember(invite.trim(), role as 'admin' | 'viewer');
        setInvited(invite.trim()); setInvite('');
      }
      next();
    } catch (e) {
      const key = step === 'profile' ? 'name' : step === 'team' ? 'invite' : 'form';
      setErrors({ [key]: (e as Error).message || 'That did not save. Your answers are still here; try again.' });
    } finally { setBusy(false); }
  }

  const toggleUse = (u: string) => setUses((x) => (u === 'explore' ? (x.includes(u) ? [] : [u]) : x.includes(u) ? x.filter((y) => y !== u) : [...x.filter((y) => y !== 'explore'), u]));
  const h1 = 'text-[clamp(1.9rem,4.5vw,2.7rem)] font-extrabold leading-[1.05] tracking-[-0.04em] outline-none';
  const Err = ({ m }: { m?: string }) => (m ? <p role="alert" className="text-[13.5px] font-semibold text-bad">{m}</p> : null);
  const pick = (on: boolean) => cn('relative flex items-center gap-3 rounded-2xl p-4 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent', on ? 'bg-accent-bg text-accent-ink' : 'bg-s2 hover:bg-s3');
  const fade = 'animate-[fl-fade_200ms_ease] motion-reduce:animate-none';

  // Next actions chosen from what the person said they want to build. Only routes that exist in the app.
  const recs = useMemo(() => {
    const r: { icon: IconName; title: string; text: string; to: string }[] = [];
    if (uses.includes('games')) r.push({ icon: 'layers-01', title: 'Deploy a game server', text: 'Pick a game, see the price, then order.', to: '/app/deploy' });
    if (uses.includes('bots')) r.push({ icon: 'discord', title: 'Host a Discord bot', text: 'Set your start command and token, then go online.', to: '/app/deploy' });
    if (uses.includes('apps')) r.push({ icon: 'package', title: 'Deploy an application', text: 'Upload your code and choose a size.', to: '/app/deploy' });
    if (uses.includes('domains')) r.push({ icon: 'globe-02', title: 'Find a domain', text: 'Search a name and manage its DNS.', to: '/app/domains/search' });
    if (!r.length) r.push({ icon: 'rocket-01', title: 'See what you can host', text: 'Browse the options and prices.', to: '/app/deploy' });
    r.push({ icon: 'layout-grid', title: 'Explore your dashboard', text: 'Services, billing and support in one place.', to: '/app' }, { icon: 'book-01', title: level === 'new' ? 'Read the quick start' : 'Browse the guides', text: 'Short guides for every kind of service.', to: '/app/knowledge' });
    return r.slice(0, 4);
  }, [uses, level]);

  const aside = step === 'welcome' ? null : (
    <ol className="mt-8 hidden gap-1 lg:grid" aria-label="Steps">
      {steps.map((s, i) => (
        <li key={s} aria-current={s === step ? 'step' : undefined} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-semibold', s === step ? 'bg-night2 text-night-ink' : i < idx ? 'text-night-ink' : 'text-night-dim')}>
          <span className={cn('grid size-6 place-items-center rounded-full text-[12px] font-bold', i < idx ? 'bg-lime text-lime-ink' : s === step ? 'bg-night-ink text-night' : 'bg-night3')}>{i < idx ? <Icon name="tick-02" size={13} /> : i + 1}</span>{LABEL[s]}
        </li>
      ))}
    </ol>
  );

  return (
    <Shell step={step} pct={pct} aside={aside}>
      <div key={step} className={fade}>
        {step === 'welcome' ? (
          <section aria-labelledby="ob-h" className="grid gap-6">
            <h1 id="ob-h" ref={heading} tabIndex={-1} className="text-[clamp(2.4rem,6vw,4rem)] font-extrabold leading-[0.98] tracking-[-0.045em] outline-none">{saved.done ? `Welcome back${firstName ? `, ${firstName}` : ''}.` : `Hello${firstName ? `, ${firstName}` : ''}.`}</h1>
            <p className="max-w-[52ch] text-[18px] text-ink2">{saved.done ? 'You already finished setup on this device. Go straight to your dashboard, or run through it again.' : 'Your email is confirmed and your account is ready. A few quick choices will tailor it; nothing costs anything and every answer can be changed later.'}</p>
            <div className="flex flex-wrap items-center gap-3">
              {saved.done ? <><Button variant="primary" size="lg" onClick={() => go('/app')}>Open dashboard</Button><Button variant="ghost" size="lg" onClick={() => move('build')}>Run setup again</Button></> : <><Button variant="primary" size="lg" onClick={() => move('build')}>Let’s go</Button><Button variant="ghost" size="lg" onClick={() => go('/app')}>Skip for now</Button></>}
            </div>
          </section>
        ) : null}

        {step === 'build' ? (
          <section aria-labelledby="ob-h" className="grid gap-7">
            <header className="grid gap-2"><h1 id="ob-h" ref={heading} tabIndex={-1} className={h1}>What are you here to build?</h1><p className="text-ink2">Pick anything that applies. We use it to suggest your first step.</p></header>
            <div role="group" aria-label="What you will build" className="grid gap-3 sm:grid-cols-2">
              {USES.map((u) => { const on = uses.includes(u.id); return (
                <button key={u.id} type="button" aria-pressed={on} onClick={() => toggleUse(u.id)} className={pick(on)}>
                  <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', on ? 'bg-accent text-on-accent' : 'bg-s3 text-ink2')}><Icon name={u.icon} size={22} /></span>
                  <span className="grid gap-0.5"><span className="text-[16px] font-extrabold">{u.label}</span><span className={cn('text-[13.5px]', on ? 'text-accent-ink' : 'text-ink2')}>{u.hint}</span></span>
                  {on ? <Icon name="tick-02" size={18} className="ml-auto" /> : null}
                </button>); })}
            </div>
            <Err m={errors.uses} />
            {uses.length > 0 && !uses.includes('explore') ? (
              <div role="radiogroup" aria-label="Your experience" className={cn('grid gap-3', fade)}>
                <p className="text-[15px] font-extrabold">How much have you hosted before? <span className="font-medium text-ink3">Optional</span></p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {LEVELS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={level === l.id} onClick={() => setLevel(level === l.id ? '' : l.id)} className={cn(pick(level === l.id), 'grid gap-0.5')}><span className="font-extrabold">{l.label}</span><span className="text-[13px] opacity-80">{l.hint}</span></button>)}
                </div>
              </div>
            ) : null}
            <p className="text-[13px] text-ink3">Your choices here stay in this browser to tailor the next screens. They are not stored on your account.</p>
          </section>
        ) : null}

        {step === 'profile' ? (
          <section aria-labelledby="ob-h" className="grid gap-6">
            <header className="grid gap-2"><h1 id="ob-h" ref={heading} tabIndex={-1} className={h1}>What should we call you?</h1><p className="text-ink2">Used on invoices, support replies and the team list.</p></header>
            <TextField label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          </section>
        ) : null}

        {step === 'alerts' ? (
          <section aria-labelledby="ob-h" className="grid gap-6">
            <header className="grid gap-2"><h1 id="ob-h" ref={heading} tabIndex={-1} className={h1}>Keep it safe, keep it quiet.</h1><p className="text-ink2">Security emails are always on. Choose the rest.</p></header>
            <div className="rounded-2xl bg-s2 p-4"><p className="flex items-center gap-2 text-[15px] font-extrabold"><Icon name="shield-01" size={18} className={identity.mfaEnabled ? 'text-good' : 'text-ink3'} />{identity.mfaEnabled ? 'Two-step sign-in is on' : 'Two-step sign-in is off'}</p>
              <p className="mt-1 text-[14px] text-ink2">{identity.mfaEnabled ? 'Your account asks for an authenticator code at sign-in.' : 'We recommend turning it on. You can do it any time in Security settings.'}</p></div>
            {prefsFailed || !prefs ? <p className="rounded-2xl bg-s2 p-4 text-[14px] text-ink2">{prefsFailed ? 'We couldn’t load your email preferences, so they are unchanged. You can set them later in Notifications.' : 'Loading your preferences…'}</p> : (
              <div className="grid gap-3">
                <div className="rounded-2xl bg-s2 p-4"><Switch label="Server status" description="A server crashed, was suspended or finished installing." checked={alerts.service} onCheckedChange={(v) => setAlerts((a) => ({ ...a, service: v }))} /></div>
                <div className="rounded-2xl bg-s2 p-4"><Switch label="Invoices and payments" description="New invoices, failed payments and receipts." checked={alerts.billing} onCheckedChange={(v) => setAlerts((a) => ({ ...a, billing: v }))} /></div>
                <div className="rounded-2xl bg-s2 p-4"><Switch label="Support replies" description="The team answered one of your tickets." checked={alerts.support} onCheckedChange={(v) => setAlerts((a) => ({ ...a, support: v }))} /></div>
              </div>
            )}
          </section>
        ) : null}

        {step === 'team' ? (
          <section aria-labelledby="ob-h" className="grid gap-6">
            <header className="grid gap-2"><h1 id="ob-h" ref={heading} tabIndex={-1} className={h1}>Building with someone?</h1><p className="text-ink2">Invite a teammate now, or skip. They only get access after they accept.</p></header>
            {invited ? <p role="status" className="flex items-center gap-2 rounded-2xl bg-good-bg p-4 text-[14.5px] font-semibold text-good"><Icon name="checkmark-circle-02" size={18} />Invitation sent to {invited}.</p> : null}
            <div className="grid gap-4 rounded-2xl bg-s2 p-4">
              <TextField label="Teammate’s email" type="email" inputMode="email" autoComplete="off" placeholder="name@example.com" value={invite} onChange={(e) => setInvite(e.target.value)} error={errors.invite} />
              <Select label="What can they do?" value={role} onValueChange={(v) => setRole(String(v))} options={ROLES} />
            </div>
          </section>
        ) : null}

        {step === 'done' ? (
          <section aria-labelledby="ob-h" className="grid gap-6">
            <h1 id="ob-h" ref={heading} tabIndex={-1} className="text-[clamp(2.2rem,5.5vw,3.4rem)] font-extrabold leading-[1] tracking-[-0.045em] outline-none">You’re ready{firstName ? `, ${firstName}` : ''}.</h1>
            <p className="max-w-[52ch] text-[17px] text-ink2">Here is where we’d start, based on what you told us.</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {recs.map((n, i) => (
                <li key={n.title}><Link to={n.to} className={cn('flex h-full items-start gap-3 rounded-2xl p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent', i === 0 ? 'bg-night text-night-ink hover:bg-night2' : 'bg-s2 hover:bg-s3')}>
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', i === 0 ? 'bg-lime text-lime-ink' : 'bg-accent-bg text-accent-ink')}><Icon name={n.icon} size={20} /></span>
                  <span className="grid gap-0.5"><span className="font-extrabold">{n.title}</span><span className={cn('text-[13.5px]', i === 0 ? 'text-night-dim' : 'text-ink2')}>{n.text}</span></span></Link></li>
              ))}
            </ul>
            {!identity.mfaEnabled ? <p className="text-[14px] text-ink2">Tip: turn on two-step sign-in in <Link to="/app/account/security" className="font-bold text-accent-ink underline underline-offset-2">Security settings</Link>.</p> : null}
          </section>
        ) : null}
      </div>

      {errors.form ? <p role="alert" className="mt-4 text-[13.5px] font-semibold text-bad">{errors.form}</p> : null}
      {step !== 'welcome' && step !== 'done' ? (
        <div className="mt-10 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={back} disabled={busy}>Back</Button>
          <div className="flex items-center gap-2">
            {step !== 'build' && step !== 'profile' ? <Button variant="ghost" onClick={() => { setInvite(''); next(); }} disabled={busy}>Skip</Button> : null}
            <Button variant="primary" size="lg" loading={busy} loadingLabel="Saving" onClick={continueFrom}>{step === 'team' ? (invite.trim() ? 'Send invite and finish' : 'Finish') : 'Continue'}</Button>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
