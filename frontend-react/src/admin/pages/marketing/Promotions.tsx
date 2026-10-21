import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { CouponManager } from '../products/CouponManager';

/** Same coupon records as Products → Coupons, plus where each code is used by campaigns. */
export default function Promotions() {
  const { data } = useAdmin();
  const used = data.campaigns.filter((c) => c.couponCode);
  return (
    <AdminPage title="Promotions & coupons" description="Coupons are catalog data (enforced at checkout). This view adds the campaigns that advertise them.">
      <CouponManager />
      <Section title="Campaigns using a coupon">{used.length ? <ul className="grid gap-2">{used.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><b>{c.name}</b><span className="font-mono text-[12.5px] font-bold">{c.couponCode}{data.coupons.find((x) => x.code === c.couponCode)?.isActive ? '' : ' (inactive)'}</span></li>)}</ul> : <p className="text-ink3">None.</p>}</Section>
      <PreviewNote />
    </AdminPage>
  );
}
