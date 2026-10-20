import { Button, Notice } from '@/design-system';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { useNavigate } from '../../router';

export default function PaymentMethods() {
  const navigate = useNavigate();
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title="Payment methods" description="Payment details used for new orders." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Payment methods' }]} />
      <CapabilityNote area="billing" />
      <Notice tone="info" title="Managed by Stripe Checkout">Fortless does not expose a saved-payment-method API. Card details are collected on the payment provider's hosted checkout and never by this React application.</Notice>
      <div><Button variant="primary" onClick={() => navigate('/app/deploy')}>Start a secure checkout</Button></div>
    </div>
  );
}
