import { Button, Icon, type IconName } from '@/design-system';
import type { ProviderConnection } from '../types';
import { Status, connectionHealth } from './status';
import { relative } from '../lib/format';
import { useNav } from '../router';
import { useSession } from '../session';
import { useAdmin } from '../store';
import { useToast } from '../toast';

const icon: Record<ProviderConnection['type'], IconName> = { PTERODACTYL: 'server', WINGS: 'cpu', STRIPE: 'credit-card', SMTP: 'mail-01', DNS: 'globe-02' };

/** Provider connection summary. The secret is always shown masked; there is no reveal control because the browser never receives it. */
export function ConnectionCard({ c, detail = true }: { c: ProviderConnection; detail?: boolean }) {
  const nav = useNav();
  const toast = useToast();
  const { patch, audit } = useAdmin();
  const { can } = useSession();
  const test = () => {
    if (c.health === 'not_configured') { toast({ tone: 'bad', title: `${c.name}: not configured`, description: 'The backend has no adapter for this integration, so there is nothing to test.' }); return; }
    patch('connections', c.id, { lastSyncAt: new Date().toISOString() }); audit('integration.connection_tested', { type: 'integration', id: c.id, label: c.name });
    toast({ tone: c.health === 'degraded' ? 'warn' : 'good', title: `${c.name}: ${c.health === 'degraded' ? 'reachable, degraded' : 'reachable'} (simulated)`, description: 'No request was made to the real service.' });
  };
  return (
    <article aria-label={c.name} className="grid content-start gap-3 rounded-lg bg-s1 p-4 sm:p-5">
      <header className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-s3 text-ink2"><Icon name={icon[c.type]} size={22} /></span><div className="min-w-0 flex-1"><h3 className="text-[16px] font-extrabold tracking-[-0.03em]">{c.name}</h3><p className="truncate text-[13px] font-medium text-ink3">{c.endpoint}</p></div><Status map={connectionHealth} value={c.health} /></header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px]">
        <div><dt className="text-ink3">Last sync</dt><dd className="font-bold">{relative(c.lastSyncAt)}</dd></div><div><dt className="text-ink3">Latency</dt><dd className="font-bold">{c.latencyMs != null ? `${c.latencyMs} ms` : '—'}</dd></div>
        <div><dt className="text-ink3">Version</dt><dd className="font-bold">{c.version ?? '—'}</dd></div><div><dt className="text-ink3">Credential</dt><dd className="font-mono text-[12.5px] font-bold">{c.secret}</dd></div>
      </dl>
      {c.lastError ? <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-[13px] font-semibold text-warn">{c.lastError}</p> : null}
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" leadingIcon="refresh" onClick={test} disabled={!can('services:manage')} title={!can('services:manage') ? 'Requires services:manage' : undefined}>Test connection</Button>{detail ? <Button size="sm" variant="ghost" onClick={() => nav(`/settings/integrations/${c.id}`)}>Details</Button> : null}</div>
    </article>
  );
}
