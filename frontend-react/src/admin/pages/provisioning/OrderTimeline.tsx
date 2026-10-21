import { useMemo } from 'react';
import { Badge, Icon, Select, StatusBadge, type BadgeTone, type IconName } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { EntityLink, JobLink, OrderLink, PaymentLink, ServiceLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useAdminRouter, useNav } from '../../router';
import { dateTime, money } from '../../lib/format';
import type { ReactNode } from 'react';

interface Stage { id: string; label: string; icon: IconName; tone: BadgeTone; state: string; time: string | null; body: ReactNode }

export default function OrderTimeline() {
  const { data } = useAdmin();
  const { search } = useAdminRouter();
  const nav = useNav();
  const interesting = useMemo(() => [...data.orders].filter((o) => o.status !== 'DRAFT').sort((a, b) => Number(['FULFILLMENT_FAILED', 'PARTIALLY_FULFILLED', 'FULFILLING', 'PAID'].includes(b.status)) - Number(['FULFILLMENT_FAILED', 'PARTIALLY_FULFILLED', 'FULFILLING', 'PAID'].includes(a.status)) || b.createdAt.localeCompare(a.createdAt)).slice(0, 60), [data.orders]);
  const id = search.get('order') ?? interesting[0]?.id ?? '';
  const o = data.orders.find((x) => x.id === id);
  const stages = useMemo<Stage[]>(() => {
    if (!o) return [];
    const pay = data.payments.find((p) => o.paymentIds.includes(p.id));
    const ev = data.webhooks.find((w) => w.id === pay?.webhookEventId);
    const jobs = data.jobs.filter((j) => o.jobIds.includes(j.id));
    const job = jobs[jobs.length - 1];
    const svc = data.services.filter((s) => s.orderId === o.id || o.lines.some((l) => l.serviceId === s.id));
    const unknown = jobs.some((j) => j.unknownOutcome);
    return [
      { id: 'order', label: 'Order', icon: 'shopping-cart-01', tone: o.status === 'CANCELED' || o.status === 'DRAFT' ? 'neutral' : o.status === 'FULFILLMENT_FAILED' ? 'bad' : o.status === 'COMPLETED' ? 'good' : o.status === 'PARTIALLY_FULFILLED' || o.status === 'AWAITING_PAYMENT' ? 'warn' : 'info', state: o.status.replace(/_/g, ' ').toLowerCase(), time: o.createdAt, body: <><OrderLink id={o.id} /><span className="block text-[12.5px] text-ink3">{o.lines.length} line item(s) · {money(o.total)}</span></> },
      { id: 'payment', label: 'Payment', icon: 'credit-card', tone: !pay ? 'neutral' : pay.status === 'succeeded' ? 'good' : pay.status === 'failed' ? 'bad' : 'info', state: pay ? `${pay.status}${pay.reconciled ? '' : ', not reconciled'}` : 'no payment', time: pay?.createdAt ?? null, body: pay ? <><PaymentLink id={pay.id} /><span className="block text-[12.5px] text-ink3">Confirmed by webhook only</span></> : <span className="text-ink3">Customer has not paid</span> },
      { id: 'webhook', label: 'Stripe webhook', icon: 'send', tone: !ev ? 'neutral' : ev.status === 'processed' ? 'good' : ev.status === 'failed' ? 'bad' : 'warn', state: ev ? ev.status.replace('_', ' ') : 'none', time: ev?.receivedAt ?? null, body: ev ? <><span className="font-mono text-[12.5px] break-all">{ev.type}</span>{ev.error ? <span className="block text-[12.5px] font-semibold text-bad">{ev.error}</span> : null}</> : <span className="text-ink3">No event yet</span> },
      { id: 'job', label: 'Provisioning job', icon: 'layers-01', tone: !job ? 'neutral' : job.status === 'completed' ? 'good' : job.status === 'running' || job.status === 'pending' ? 'info' : 'bad', state: job ? job.status.replace('_', ' ') : 'not queued', time: job?.createdAt ?? null, body: job ? <><JobLink id={job.id} />{job.error ? <span className="block text-[12.5px] font-semibold text-bad">{job.error.code}</span> : null}</> : <span className="text-ink3">Waits for payment</span> },
      { id: 'provider', label: 'Provider', icon: 'server', tone: unknown ? 'warn' : svc.length ? 'good' : job && (job.status === 'failed' || job.status === 'dead_letter') ? 'bad' : 'neutral', state: unknown ? 'outcome unknown' : svc.length ? 'server exists' : 'no server', time: svc[0]?.createdAt ?? null, body: unknown ? <span className="text-[12.5px] font-semibold text-warn">Query by tag before retrying</span> : svc[0] ? <span className="font-mono text-[12.5px]">{svc[0].provider.correlationTag}</span> : <span className="text-ink3">Nothing created</span> },
      { id: 'service', label: 'Service activation', icon: 'rocket-01', tone: svc.length === o.lines.length && svc.length ? 'good' : svc.length ? 'warn' : 'neutral', state: svc.length ? `${svc.length} of ${o.lines.length} active` : 'not active', time: svc[0]?.createdAt ?? null, body: svc.length ? <>{svc.map((s) => <ServiceLink key={s.id} id={s.id} />)}</> : <span className="text-ink3">—</span> },
    ];
  }, [o, data]);
  return (
    <AdminPage title="Order → service timeline" description="Follow one order through payment, webhook, job, provider and activation. Each step has its own state: payment confirmed does not mean the server exists.">
      <div className="max-w-xl"><Select label="Order" value={id || null} onValueChange={(v) => v && nav(`/provisioning/timeline?order=${v}`)} options={interesting.map((x) => ({ value: x.id, label: `${x.id} · ${x.status.replace(/_/g, ' ').toLowerCase()} · ${data.customers.find((c) => c.id === x.customerId)?.name ?? ''}` }))} description="Failed and in-progress orders are listed first." /></div>
      {o ? (
        <Section title={`${o.id}`} actions={<EntityLink to={`/orders/${o.id}`}>Open order</EntityLink>}>
          <ol className="grid gap-3 lg:grid-cols-6" aria-label="Fulfillment pipeline">
            {stages.map((s, i) => (
              <li key={s.id} className="relative grid content-start gap-2 rounded-lg bg-s2 p-3.5">
                <div className="flex items-center gap-2"><span className={cn('grid size-8 place-items-center rounded-full', s.tone === 'good' ? 'bg-good-bg text-good' : s.tone === 'bad' ? 'bg-bad-bg text-bad' : s.tone === 'warn' ? 'bg-warn-bg text-warn' : s.tone === 'info' ? 'bg-info-bg text-info' : 'bg-s3 text-ink3')}><Icon name={s.icon} size={17} /></span><span className="text-[12px] font-bold text-ink3">Step {i + 1}</span></div>
                <p className="font-extrabold">{s.label}</p>
                <StatusBadge tone={s.tone}>{s.state}</StatusBadge>
                <div className="text-[13.5px]">{s.body}</div>
                <p className="text-[12px] font-semibold text-ink3">{s.time ? dateTime(s.time) : '—'}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink2"><Badge tone="warn">Rule</Badge> A timeout or 5xx from the provider is an unknown outcome. The worker looks the server up by its correlation tag before any retry.</p>
        </Section>
      ) : <p className="text-ink3">No orders.</p>}
      <PreviewNote />
    </AdminPage>
  );
}
