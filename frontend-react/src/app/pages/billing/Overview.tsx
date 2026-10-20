import { Button, ButtonGroup, Card, CardHeader, EmptyState, Notice, StatusBadge } from '@/design-system';
import { invoiceStatus } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApiQuery } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { Stat } from '../../components/bits';
import { date, daysUntil, money } from '../../format';

export default function BillingOverview() {
  const nav = useNavigate();
  const invoices = useApiQuery((a) => a.listInvoices());
  const subs = useApiQuery((a) => a.listSubscriptions());
  const methods = useApiQuery((a) => a.listPaymentMethods());
  return (
    <div className="grid gap-6">
      <PageHeader title="Billing" description="What you owe, what renews next, and how you pay." actions={<ButtonGroup aria-label="Billing actions"><Button variant="primary" leadingIcon="credit-card" onClick={() => nav('/app/billing/invoices')}>Pay invoices</Button><Button variant="secondary" onClick={() => nav('/app/billing/plans')}>Plans & pricing</Button></ButtonGroup>} />
      <CapabilityNote area="billing" />
      <ResourceView res={invoices} reload={invoices.reload} label="Loading billing">
        {(inv) => {
          const due = inv.filter((i) => i.state === 'open' || i.state === 'overdue'); const total = due.reduce((a, i) => a + i.total.amount, 0);
          const overdue = due.filter((i) => i.state === 'overdue');
          return (
            <>
              {overdue.length ? <Notice tone="bad" title={`${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''}`} action={<Button size="sm" variant="secondary" onClick={() => nav('/app/billing/invoices')}>Pay now</Button>}>Services with unpaid invoices are suspended after 7 days. Pay to keep them running.</Notice> : null}
              <section aria-label="Summary" className="grid gap-3 sm:grid-cols-3">
                <Card><Stat label="Balance due" value={money({ amount: total, currency: 'EUR' })} tone={overdue.length ? 'bad' : due.length ? 'warn' : undefined} hint={due.length ? `${due.length} open invoice${due.length > 1 ? 's' : ''}` : 'Nothing to pay'} /></Card>
                <Card>{subs.status === 'ready' ? <Stat label="Active subscriptions" value={subs.data.filter((s) => s.state === 'active').length} hint={`${subs.data.filter((s) => s.state === 'cancel-scheduled').length} ending, ${subs.data.filter((s) => s.state === 'past-due').length} past due`} /> : <Stat label="Active subscriptions" value="…" />}</Card>
                <Card>{methods.status === 'ready' ? <Stat label="Default payment method" value={methods.data.find((m) => m.isDefault) ? `•••• ${methods.data.find((m) => m.isDefault)!.last4}` : 'None'} hint={methods.data.length ? `${methods.data.length} saved` : 'Add a card to renew automatically'} /> : <Stat label="Default payment method" value="…" />}</Card>
              </section>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <Card pad="lg" className="grid gap-3">
                  <CardHeader title="Recent invoices" actions={<Button size="sm" variant="ghost" onClick={() => nav('/app/billing/invoices')}>View all</Button>} />
                  {inv.length === 0 ? <EmptyState icon="invoice-01" title="No invoices yet" description="Your first invoice appears after your first order." /> : (
                    <ul className="grid divide-y divide-ink/10">
                      {inv.slice(0, 5).map((i) => (
                        <li key={i.id}><button type="button" onClick={() => nav(`/app/billing/invoices/${i.id}`)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-accent-ink">
                          <span className="min-w-0"><span className="block font-bold">{i.number}</span><span className="block text-[13px] text-ink3">{date(i.issuedOn)}</span></span>
                          <span className="flex items-center gap-3"><StatusBadge tone={invoiceStatus[i.state].tone}>{invoiceStatus[i.state].label}</StatusBadge><span className="font-semibold tabular-nums">{money(i.total)}</span></span>
                        </button></li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card pad="lg" className="grid gap-3">
                  <CardHeader title="Upcoming renewals" actions={<Button size="sm" variant="ghost" onClick={() => nav('/app/billing/subscriptions')}>Manage</Button>} />
                  <ResourceView res={subs} reload={subs.reload} label="Loading renewals">
                    {(list) => { const next = list.filter((s) => s.renewsOn && s.state === 'active').sort((a, b) => a.renewsOn!.localeCompare(b.renewsOn!)); return next.length === 0 ? <EmptyState icon="calendar-01" title="Nothing renews soon" /> : (
                      <ul className="grid divide-y divide-ink/10">{next.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 py-3"><span><span className="block font-bold">{s.serviceName}</span><span className="block text-[13px] text-ink3">{date(s.renewsOn!)} · in {daysUntil(s.renewsOn!)} days · {s.cycle}</span></span><span className="font-semibold tabular-nums">{money(s.price)}</span></li>)}</ul>); }}
                  </ResourceView>
                </Card>
              </div>
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
