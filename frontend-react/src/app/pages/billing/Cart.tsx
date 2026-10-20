import { Button, Notice } from '@/design-system';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';

/** Fortless creates an order directly from a signed quote; there is no server-side cart API. */
export default function Cart() {
  const nav = useNavigate();
  return (
    <div className="grid max-w-2xl gap-5">
      <PageHeader title="Cart" description="Orders are prepared from an authoritative server quote." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Cart' }]} />
      <Notice tone="info" title="No persistent cart">Fortless does not currently expose a customer cart. Configure a server to create a signed quote and continue directly to secure checkout.</Notice>
      <div><Button variant="primary" onClick={() => nav('/app/deploy')}>Deploy a server</Button></div>
    </div>
  );
}
