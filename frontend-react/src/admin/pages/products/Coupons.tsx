import { AdminPage } from '../../components/Page';
import { PreviewNote } from '../../components/PreviewNote';
import { CouponManager } from './CouponManager';

export default function Coupons() {
  return (
    <AdminPage title="Coupons & promotions" description="Discount codes validated by the quote engine at checkout. Redemption counts are incremented atomically when an order is paid.">
      <CouponManager />
      <PreviewNote />
    </AdminPage>
  );
}
