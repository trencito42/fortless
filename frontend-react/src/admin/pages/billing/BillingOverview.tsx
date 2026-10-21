import { useMemo, useState } from 'react';
import { Button, ChartFrame, SegmentedControl, TimeSeriesChart } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { MoneyByCurrency, MoneyText } from '../../components/Money';
import { RelatedTable } from '../../components/RelatedTable';
import { PreviewNote } from '../../components/PreviewNote';
import { Status, subscriptionStatus, invoiceStatus, invoiceKey } from '../../components/status';
import { InvoiceLink, ServiceLink, CustomerLink } from '../../components/entities';
import { col, nw } from '../../components/cols';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { ADMIN_NOW, DAY, date, money, num, sumByCurrency } from '../../lib/format';
import { CURRENCIES, collected, dailySeries, mrr, overdue } from '../../lib/metrics';
import type { Currency, Invoice, Subscription } from '../../types';

export default function BillingOverview() {
  const { data } = useAdmin();
  const nav = useNav();
  const [cur, setCur] = useState<Currency>('EUR');
  const m = useMemo(() => {
    const in30 = (iso: string) => Date.parse(iso) > ADMIN_NOW - 30 * DAY;
    const od = overdue(data);
    const failed = data.payments.filter((p) => p.status === 'failed' && in30(p.createdAt));
    const refunded = sumByCurrency(data.refunds.filter((r) => r.kind === 'refund' && r.status === 'processed' && in30(r.createdAt)).map((r) => r.amount));
    const credits = sumByCurrency(data.refunds.filter((r) => r.kind === 'credit_note' && r.status === 'processed' && in30(r.createdAt)).map((r) => r.amount));
    const subs = data.subscriptions;
    return {
      od, failed, refunded, credits, paid30: data.invoices.filter((i) => i.status === 'PAID' && in30(i.issuedAt)).length,
      subs: { active: subs.filter((s) => s.status === 'ACTIVE').length, past: subs.filter((s) => s.status === 'PAST_DUE').length, ending: subs.filter((s) => s.status === 'CANCEL_AT_PERIOD_END').length, canceled: subs.filter((s) => s.status === 'CANCELED').length },
      renewals: subs.filter((s) => s.status === 'PAST_DUE' || s.failedAttempts > 0).slice(0, 6),
      pendingRefunds: data.refunds.filter((r) => r.status === 'pending_approval'),
      series: dailySeries(data, cur, 30), c: collected(data, 30), mrr: mrr(data),
    };
  }, [data, cur]);
  const monthly = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, k) => { const d = new Date(Date.UTC(2026, 9 - (5 - k), 1)); return { key: d.toISOString().slice(0, 7), label: d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }), amount: 0 }; });
    for (const p of data.payments) if (p.amount.currency === cur && (p.status === 'succeeded' || p.status === 'partially_refunded')) { const mo = months.find((x) => x.key === p.createdAt.slice(0, 7)); if (mo) mo.amount += p.amount.amount; }
    return months;
  }, [data.payments, cur]);
  const curTotal = m.c.find((x) => x.currency === cur) ?? { currency: cur, amount: 0 };
  return (
    <AdminPage title="Billing & payments" description="Cash collected, recurring revenue, receivables and refunds. Currencies are always shown separately. All numbers are synthetic.">
      <KpiGrid cols={4} items={[
        { label: 'Collected, last 30 days', value: <MoneyByCurrency values={m.c} />, icon: 'wallet-01', hint: 'Succeeded payments, net of nothing', to: '/billing/transactions' },
        { label: 'MRR (monthly equivalent)', value: <MoneyByCurrency values={m.mrr} />, icon: 'analytics-01', hint: 'Active, ending and past-due subscriptions', to: '/billing/subscriptions' },
        { label: 'Overdue invoices', value: num(m.od.rows.length), icon: 'invoice-01', hint: m.od.totals.map(money).join(' · ') || 'None', to: '/billing/invoices' },
        { label: 'Failed payments (30 d)', value: num(m.failed.length), icon: 'alert-circle', hint: 'Card declined, insufficient funds, expired', to: '/billing/transactions' },
        { label: 'Paid invoices (30 d)', value: num(m.paid30), icon: 'tick-02' },
        { label: 'Refunds (30 d)', value: <MoneyByCurrency values={m.refunded} empty="None" />, icon: 'receipt', to: '/billing/refunds' },
        { label: 'Credit notes (30 d)', value: <MoneyByCurrency values={m.credits} empty="None" />, icon: 'file-01', to: '/billing/refunds' },
        { label: 'Subscriptions', value: `${num(m.subs.active)} active`, icon: 'arrow-reload-horizontal', hint: `${m.subs.past} past due · ${m.subs.ending} ending · ${m.subs.canceled} canceled`, to: '/billing/subscriptions' },
      ]} />
      <Columns>
        <ChartFrame title="Daily collected" description={`${money(curTotal)} in 30 days`} summary={`Daily collected payments ${cur}`} height={230} actions={<SegmentedControl aria-label="Currency" size="sm" value={cur} onValueChange={setCur} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />}>
          <TimeSeriesChart kind="area" data={m.series} xKey="day" series={[{ key: 'amount', label: 'Collected', color: 'accent' }]} formatX={(v) => String(v).slice(5)} formatY={(v) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 0 }).format(v / 100)} label="Daily collected" />
        </ChartFrame>
        <ChartFrame title="Collected by month" description="Last six months, same currency" summary={`Monthly collected ${cur}`} height={230}>
          <TimeSeriesChart kind="bar" data={monthly} xKey="label" series={[{ key: 'amount', label: 'Collected', color: 'violet' }]} formatY={(v) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 0 }).format(v / 100)} label="Monthly collected" />
        </ChartFrame>
      </Columns>
      <Columns>
        <Section title="Renewals needing attention" actions={<Button size="sm" variant="ghost" onClick={() => nav('/billing/subscriptions')}>All</Button>}>
          <RelatedTable rows={m.renewals} getRowId={(s) => s.id} caption="Failed renewals" pageSize={6} empty="No failed renewals." columns={[col<Subscription>('s', 'Service', (s) => <ServiceLink id={s.serviceId} />, { primary: true }), col<Subscription>('st', 'Status', (s) => <Status map={subscriptionStatus} value={s.status} />), col<Subscription>('f', 'Failed', (s) => s.failedAttempts, { numeric: true }), col<Subscription>('p', 'Price', (s) => <MoneyText value={s.price} />, { numeric: true })]} />
        </Section>
        <Section title="Overdue invoices" actions={<Button size="sm" variant="ghost" onClick={() => nav('/billing/invoices')}>All</Button>}>
          <RelatedTable rows={m.od.rows} getRowId={(i) => i.id} caption="Overdue invoices" pageSize={6} empty="Nothing overdue." onRowClick={(i) => nav(`/billing/invoices/${i.id}`)} columns={[col<Invoice>('n', 'Invoice', (i) => <InvoiceLink id={i.id} />, { primary: true }), col<Invoice>('c', 'Customer', (i) => <CustomerLink id={i.customerId} />), col<Invoice>('s', 'Status', (i) => <Status map={invoiceStatus} value={invoiceKey(i)} />), col<Invoice>('d', 'Due', (i) => nw(date(i.dueAt))), col<Invoice>('t', 'Total', (i) => <MoneyText value={i.total} />, { numeric: true })]} />
        </Section>
      </Columns>
      {m.pendingRefunds.length ? <Section title="Refunds awaiting approval" actions={<Button size="sm" variant="primary" onClick={() => nav('/billing/refunds')}>Review</Button>}><p className="text-ink2">{m.pendingRefunds.length} request{m.pendingRefunds.length > 1 ? 's' : ''} waiting for a second staff member.</p></Section> : null}
      <PreviewNote>Figures are generated demo data. “Collected” is cash from succeeded payments and is not revenue recognition. MRR assumes each plan price divided by its cycle length.</PreviewNote>
    </AdminPage>
  );
}
