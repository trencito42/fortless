import type { ReactNode } from 'react';
import { Button, Icon, LogoMark, type IconName } from '@/design-system';
import { Link, useNavigate } from '../router';

export type SystemKind = 'not-found' | 'forbidden' | 'error' | 'maintenance' | 'unavailable' | 'session-expired';

const COPY: Record<SystemKind, { icon: IconName; code?: string; title: string; body: string; primary?: { label: string; to: string }; secondary?: { label: string; to: string } }> = {
  'not-found': { icon: 'search-01', code: '404', title: 'This page does not exist', body: 'The address may be mistyped, or the page was moved. Your servers and billing are unaffected.', primary: { label: 'Go to dashboard', to: '/app' }, secondary: { label: 'Open knowledge base', to: '/app/knowledge' } },
  forbidden: { icon: 'lock', code: '403', title: 'You do not have access to this', body: 'Your role on this account cannot open this page. Ask the account owner to change your permissions.', primary: { label: 'Go to dashboard', to: '/app' }, secondary: { label: 'Contact support', to: '/app/support/new' } },
  error: { icon: 'alert-circle', code: '500', title: 'Something went wrong on our side', body: 'The request failed and we have recorded it. Your servers keep running. Try again in a moment.', primary: { label: 'Try again', to: '/app' }, secondary: { label: 'Contact support', to: '/app/support/new' } },
  maintenance: { icon: 'wrench-01', title: 'Scheduled maintenance', body: 'The control panel is being upgraded and is read-only until about 03:30 UTC. Running servers are not affected.', secondary: { label: 'Read the announcement', to: '/app/announcements' } },
  unavailable: { icon: 'cloud', title: 'Temporarily unavailable', body: 'We cannot reach the service that powers this page. This usually clears within a few minutes.', primary: { label: 'Try again', to: '/app' } },
  'session-expired': { icon: 'clock-01', title: 'Your session expired', body: 'For your security you were signed out after a period of inactivity. Sign in to continue where you left off.', primary: { label: 'Sign in', to: '/auth/login' } },
};

/** Full-page system states. They render without the app shell, so they work even when the shell cannot load. */
export function SystemScreen({ kind, children }: { kind: SystemKind; children?: ReactNode }) {
  const c = COPY[kind];
  const nav = useNavigate();
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10" id="main">
      <div className="grid w-full max-w-lg justify-items-center gap-5 text-center">
        <Link to="/app" aria-label="Fortless home"><LogoMark size={36} /></Link>
        <span className="grid size-14 place-items-center rounded-full bg-s3 text-ink2"><Icon name={c.icon} size={26} /></span>
        <div className="grid gap-2">
          {c.code ? <p className="font-mono text-[13px] font-bold text-ink3">Error {c.code}</p> : null}
          <h1 className="font-display text-[28px] leading-tight font-extrabold tracking-[-0.045em] text-balance">{c.title}</h1>
          <p className="text-ink2">{c.body}</p>
        </div>
        {children}
        <div className="flex flex-wrap justify-center gap-2">
          {c.primary ? <Button variant="primary" onClick={() => (kind === 'error' || kind === 'unavailable' ? location.reload() : nav(c.primary!.to))}>{c.primary.label}</Button> : null}
          {c.secondary ? <Button variant="secondary" onClick={() => nav(c.secondary!.to)}>{c.secondary.label}</Button> : null}
        </div>
      </div>
    </main>
  );
}
