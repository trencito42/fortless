import type { ReactNode } from 'react';
import { StatusBadge, Icon, type IconName } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { serverStatus, type ServerState } from '@/features';
import type { ServiceRow, ServiceState, Workload } from '../domain/types';
import { SERVICE_LIFECYCLE_PRESENTATION } from '../domain/serviceLifecycle';
import { pct } from '../format';

export const ServiceStateBadge = ({ state }: { state: ServiceState }) => { const s = serverStatus[state as ServerState]; return <StatusBadge tone={s.tone} live={s.live}>{s.label}</StatusBadge>; };
export const ServiceStatusBadge = ({ service }: { service: Pick<ServiceRow, 'state' | 'lifecycle'> }) => {
  if (service.lifecycle === 'active') return <ServiceStateBadge state={service.state} />;
  const status = SERVICE_LIFECYCLE_PRESENTATION[service.lifecycle];
  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
};

export const WORKLOAD_ICON: Record<Workload, IconName> = { minecraft: 'layers-01', cs16: 'flag-01', cs2: 'flag-01', 'discord-bot': 'discord', nodejs: 'code', python: 'terminal', database: 'database' };
export const WorkloadIcon = ({ workload, size = 20 }: { workload: Workload; size?: number }) => <span className="grid size-9 shrink-0 place-items-center rounded-md bg-s3 text-ink2"><Icon name={WORKLOAD_ICON[workload]} size={size} /></span>;

/** Thin usage bar. The numbers are always written next to it; color is a hint, not the information. */
export function Meter({ used, limit, label, format }: { used: number; limit: number; label: string; format: (n: number) => string }) {
  const p = pct(used, limit);
  const tone = p >= 90 ? 'bg-bad' : p >= 75 ? 'bg-warn' : 'bg-accent';
  return (
    <div className="grid min-w-[7rem] gap-1" role="img" aria-label={`${label}: ${format(used)} of ${format(limit)}, ${p}%`}>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px] font-semibold"><span className="text-ink3">{label}</span><span className="text-ink2 tabular-nums">{format(used)} / {format(limit)}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-s3"><div className={cn('h-full rounded-full', tone)} style={{ width: `${p}%` }} /></div>
    </div>
  );
}

/** Label/value stat used in compact summary rows. */
export const Stat = ({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'bad' | 'warn' | 'good' }) => (
  <div className="grid gap-0.5">
    <p className="text-[13px] font-bold text-ink3">{label}</p>
    <p className={cn('text-[26px] leading-none font-extrabold tracking-[-0.04em] tabular-nums', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn')}>{value}</p>
    {hint ? <p className="text-[13px] font-semibold text-ink3">{hint}</p> : null}
  </div>
);
