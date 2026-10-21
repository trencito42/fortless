import { SegmentedBar } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { Unsupported } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { ADMIN_NOW, DAY } from '../../lib/format';

export default function ConversionAnalytics() {
  const { data } = useAdmin();
  const o = data.orders.filter((x) => Date.parse(x.createdAt) > ADMIN_NOW - 90 * DAY);
  const n = (f: (x: (typeof o)[number]) => boolean) => o.filter(f).length;
  const started = o.length, awaiting = n((x) => x.status !== 'DRAFT'), paid = n((x) => ['PAID', 'FULFILLING', 'COMPLETED', 'PARTIALLY_FULFILLED', 'FULFILLMENT_FAILED'].includes(x.status)), done = n((x) => x.status === 'COMPLETED');
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  return (
    <AdminPage title="Conversion analytics" description="What can be measured from the order data, and what cannot.">
      <Unsupported title="Visitor analytics are not collected">The platform does not record page views, sources, campaigns or sessions. Traffic, bounce, source/medium and A/B test results are unavailable and are not estimated here.</Unsupported>
      <KpiGrid cols={4} items={[
        { label: 'Visitors', state: 'unavailable', unavailableReason: 'No analytics collection', icon: 'view' }, { label: 'Signup rate', state: 'unavailable', unavailableReason: 'Needs visitor counts', icon: 'user-add-01' },
        { label: 'Checkout → paid (90 d)', value: pct(paid, awaiting), icon: 'credit-card', hint: `${paid} of ${awaiting} submitted orders` }, { label: 'Paid → delivered (90 d)', value: pct(done, paid), icon: 'rocket-01', hint: `${done} of ${paid} paid orders` },
      ]} />
      <Columns>
        <Section title="Order funnel, last 90 days" description="From real order states in the demo data."><div className="grid gap-3">{[['Orders started', started, 'bg-s4'], ['Submitted for payment', awaiting, 'bg-info'], ['Paid', paid, 'bg-accent'], ['Delivered', done, 'bg-good']].map(([l, v, t]) => <div key={String(l)} className="grid gap-1"><div className="flex justify-between text-[13.5px]"><b>{l}</b><span className="tabular-nums text-ink2">{v}</span></div><SegmentedBar segments={[{ key: String(l), label: String(l), value: Number(v), tone: String(t) }]} total={Math.max(started, 1)} size="lg" summary={`${l}: ${v} of ${started}`} /></div>)}</div></Section>
        <Section title="Not measurable yet"><ul className="grid list-disc gap-1.5 pl-5 text-ink2"><li>Traffic sources and campaign attribution</li><li>Landing-page conversion and drop-off</li><li>Coupon uplift versus baseline</li><li>Cohort retention beyond subscription status</li></ul></Section>
      </Columns>
    </AdminPage>
  );
}
