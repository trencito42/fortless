import { Button, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { Status, contentStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { ADMIN_NOW, date, num } from '../../lib/format';

export default function MarketingOverview() {
  const { data } = useAdmin();
  const nav = useNav();
  const activeCoupons = data.coupons.filter((c) => c.isActive && Date.parse(c.expiresAt) > ADMIN_NOW);
  const running = data.campaigns.filter((c) => c.status === 'running' || c.status === 'scheduled');
  return (
    <AdminPage title="Marketing" description="Campaign plans, coupons and promotions. Visitor analytics, referral rewards and bulk marketing email are not part of the backend yet and are marked as such." actions={<Button variant="primary" onClick={() => nav('/marketing/campaigns')}>Campaigns</Button>}>
      <KpiGrid cols={4} items={[
        { label: 'Active coupons', value: activeCoupons.length, icon: 'tag-01', hint: `${num(data.coupons.reduce((a, c) => a + c.redemptionsCount, 0))} redemptions to date`, to: '/marketing/promotions' },
        { label: 'Campaigns running or scheduled', value: running.length, icon: 'bulb', to: '/marketing/campaigns' },
        { label: 'Referral programme', value: 'Not supported', icon: 'user-add-01', hint: 'No backend model', to: '/marketing/referrals' },
        { label: 'Conversion analytics', value: 'Partial', icon: 'analytics-01', hint: 'Order funnel only', to: '/marketing/analytics' },
      ]} />
      <Columns>
        <Section title="Campaigns"><ul className="grid gap-2">{data.campaigns.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><span className="grid"><b>{c.name}</b><span className="text-[12.5px] text-ink3">{c.channel} · from {date(c.startsAt)}</span></span><Status map={contentStatus} value={c.status} /></li>)}</ul></Section>
        <Section title="Coupons expiring soon">{activeCoupons.length ? <ul className="grid gap-2">{[...activeCoupons].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)).slice(0, 4).map((c) => <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><EntityLink to="/marketing/promotions" mono>{c.code}</EntityLink><span className="text-[12.5px] font-semibold text-ink3">until {date(c.expiresAt)} · {c.redemptionsCount}/{c.maxRedemptions}</span></li>)}</ul> : <p className="text-ink3">No active coupons.</p>}</Section>
      </Columns>
      <Notice tone="info" title="What exists today">Coupons are enforced by the quote engine. Campaigns here are plans (audience, dates, coupon). Sending bulk email, tracking visitors or paying referral credit needs backend capabilities that do not exist yet.</Notice>
    </AdminPage>
  );
}
