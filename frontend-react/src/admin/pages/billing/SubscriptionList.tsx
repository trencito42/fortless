import { useMemo } from 'react';
import { Switch } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, subscriptionStatus } from '../../components/status';
import { CustomerLink, ServiceLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { useToast } from '../../toast';
import { date, daysBetween, intervalLabel, iso, num } from '../../lib/format';
import type { Subscription } from '../../types';
import { NumberField } from '@/design-system';

export default function SubscriptionList() {
  const { data, patch, audit } = useAdmin();
  const nav = useNav();
  const toast = useToast();
  const { can } = useSession();
  const act = useActionDialog();
  const cust = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);
  const m = can('accounts:manage');
  const seg = (v: string, label: string, test: (s: Subscription) => boolean) => ({ value: v, label, test });
  const ent = (s: Subscription) => ({ type: 'subscription', id: s.id, label: s.planName });
  const retry = (s: Subscription) => act.run({ title: 'Retry renewal payment', description: `Charges the saved payment method for ${s.planName}.`, confirmLabel: 'Retry charge', permission: 'accounts:manage', stepUp: true, effects: ['Create a payment attempt with a new idempotency key', 'Outcome is confirmed by webhook, not by this call'], onConfirm: ({ reason }) => { patch('subscriptions', s.id, (c) => ({ failedAttempts: c.failedAttempts + 1 })); audit('subscription.renewal_retried', ent(s), { accountId: s.customerId, reason }); return 'Retry queued. Status changes only after the Stripe webhook.'; } });
  const grace = (s: Subscription) => act.run({ title: 'Extend grace period', description: 'Keeps the service running while payment is outstanding.', confirmLabel: 'Extend grace', permission: 'accounts:manage', stepUp: true, reasonRequired: true, initial: { days: '3' }, validate: (v) => (Number(v['days']) >= 1 && Number(v['days']) <= 14 ? {} : { days: 'Choose 1 to 14 days.' }), fields: ({ values, set, errors }) => <NumberField label="Extra days" value={Number(values['days'])} onValueChange={(v) => set('days', String(v ?? ''))} min={1} max={14} error={errors['days']} />, onConfirm: ({ values, reason }) => { patch('subscriptions', s.id, { graceUntil: iso(Number(values['days']) * 86_400_000), status: 'GRACE' }); audit('subscription.grace_extended', ent(s), { accountId: s.customerId, reason }); return `Grace extended by ${values['days']} days`; } });
  const cancel = (s: Subscription, now: boolean) => act.run({ title: now ? 'Cancel subscription now' : 'Cancel at period end', description: now ? 'Stops renewal immediately and cancels the subscription. The service is suspended by the next billing run.' : 'The service keeps running until the paid period ends.', confirmLabel: now ? 'Cancel now' : 'Cancel at period end', permission: 'accounts:manage', stepUp: true, tone: 'danger', reasonRequired: true, onConfirm: ({ reason }) => { patch('subscriptions', s.id, { status: now ? 'CANCELED' : 'CANCEL_AT_PERIOD_END', autoRenew: false }); audit('subscription.canceled', ent(s), { accountId: s.customerId, reason }); return now ? 'Subscription canceled' : 'Will end at period end'; } });
  return (
    <AdminPage title="Subscriptions & renewals" description="Billing cycles, auto-renew state and failed renewals. A subscription is the billing contract; the service lifecycle follows it through billing runs.">
      <KpiGrid cols={5} items={[
        { label: 'Active', value: num(data.subscriptions.filter((s) => s.status === 'ACTIVE').length) }, { label: 'In grace', value: num(data.subscriptions.filter((s) => s.status === 'GRACE').length) },
        { label: 'Past due', value: num(data.subscriptions.filter((s) => s.status === 'PAST_DUE').length) }, { label: 'Ending at period end', value: num(data.subscriptions.filter((s) => s.status === 'CANCEL_AT_PERIOD_END').length) },
        { label: 'Renewing in 7 days', value: num(data.subscriptions.filter((s) => (s.status === 'ACTIVE') && daysBetween(s.currentPeriodEnd) <= 7 && daysBetween(s.currentPeriodEnd) >= 0).length) },
      ]} />
      <ResourceTable<Subscription>
        tableId="subscriptions" caption="Subscriptions" rows={data.subscriptions} getRowId={(s) => s.id} rowLabel={(s) => s.id}
        searchText={(s) => `${s.id} ${s.planName} ${cust.get(s.customerId) ?? ''} ${s.serviceId}`} searchPlaceholder="Search plan, customer, service"
        segments={[seg('all', 'All', () => true), seg('ACTIVE', 'Active', (s) => s.status === 'ACTIVE'), seg('PAST_DUE', 'Past due', (s) => s.status === 'PAST_DUE'), seg('GRACE', 'In grace', (s) => s.status === 'GRACE'), seg('CANCEL_AT_PERIOD_END', 'Ending', (s) => s.status === 'CANCEL_AT_PERIOD_END'), seg('CANCELED', 'Canceled', (s) => s.status === 'CANCELED'), seg('failed', 'Failed renewals', (s) => s.failedAttempts > 0)]}
        filters={[{ id: 'cycle', label: 'Cycle', options: Object.entries(intervalLabel).map(([k, l]) => ({ value: k, label: l })), test: (s, v) => s.interval === v }, { id: 'auto', label: 'Auto-renew', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], test: (s, v) => s.autoRenew === (v === 'on') }, { id: 'cur', label: 'Currency', options: ['EUR', 'USD', 'RON'].map((c) => ({ value: c, label: c })), test: (s, v) => s.price.currency === v }]}
        dateField={{ label: 'Period ends', get: (s) => s.currentPeriodEnd }}
        onRowClick={(s) => nav(`/services/${s.serviceId}/billing`)}
        columns={[
          col<Subscription>('s', 'Service', (s) => <span className="grid md:min-w-[8rem]"><ServiceLink id={s.serviceId} /><span className="text-[12.5px] text-ink3">{s.planName}</span></span>, { primary: true, sort: (s) => s.serviceId }),
          col<Subscription>('c', 'Customer', (s) => <span className="block md:min-w-[8rem]"><CustomerLink id={s.customerId} /></span>, { sort: (s) => cust.get(s.customerId) ?? '' }),
          col<Subscription>('st', 'Status', (s) => <Status map={subscriptionStatus} value={s.status} />, { sort: (s) => s.status }),
          col<Subscription>('i', 'Cycle', (s) => intervalLabel[s.interval], { sort: (s) => s.interval }),
          col<Subscription>('p', 'Price', (s) => <MoneyText value={s.price} />, { sort: (s) => s.price.amount, numeric: true }),
          col<Subscription>('e', 'Period ends', (s) => nw(date(s.currentPeriodEnd)), { sort: (s) => s.currentPeriodEnd }),
          col<Subscription>('a', 'Auto-renew', (s) => <Switch hideLabel label={`Auto-renew for ${s.id}`} checked={s.autoRenew} disabled={!m || s.status === 'CANCELED'} onCheckedChange={(v) => { patch('subscriptions', s.id, { autoRenew: v }); toast({ tone: 'info', title: `Auto-renew ${v ? 'on' : 'off'} (preview)` }); }} />, { sort: (s) => String(s.autoRenew) }),
          col<Subscription>('f', 'Failed', (s) => s.failedAttempts || '—', { sort: (s) => s.failedAttempts, numeric: true }),
          col<Subscription>('g', 'Grace until', (s) => (s.graceUntil ? nw(date(s.graceUntil)) : '—'), { sort: (s) => s.graceUntil ?? '', hideOnMobile: true }),
        ]}
        rowActions={(s) => [
          { id: 'retry', label: 'Retry renewal…', icon: 'replay', disabled: !m || s.status !== 'PAST_DUE', disabledReason: s.status !== 'PAST_DUE' ? 'Only past-due subscriptions' : 'Requires accounts:manage', onSelect: () => retry(s) },
          { id: 'grace', label: 'Extend grace…', icon: 'clock-01', disabled: !m || (s.status !== 'PAST_DUE' && s.status !== 'GRACE'), onSelect: () => grace(s) },
          { id: 'sep', kind: 'separator' },
          { id: 'end', label: 'Cancel at period end…', icon: 'cancel-01', disabled: !m || s.status !== 'ACTIVE', onSelect: () => cancel(s, false) },
          { id: 'now', label: 'Cancel now…', icon: 'delete-02', tone: 'danger', disabled: !m || s.status === 'CANCELED', onSelect: () => cancel(s, true) },
        ]}
        empty={{ title: 'No subscriptions' }}
      />
      {act.node}
    </AdminPage>
  );
}
