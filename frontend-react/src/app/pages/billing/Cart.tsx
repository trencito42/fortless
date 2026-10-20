import { useState } from 'react';
import { Button, Notice } from '@/design-system';
import { CartItems, CheckoutSummary } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { money } from '../../format';
import type { Money, OrderRecord } from '../../domain/types';

const eur = (amount: number): Money => ({ amount, currency: 'EUR' });

/** Cart and checkout preview on one page: what you are buying, what you pay today, and how. Payment is simulated. */
export default function Cart() {
  const api = useApi(); const nav = useNavigate();
  const cart = useApiQuery((a) => a.cart());
  const methods = useApiQuery((a) => a.listPaymentMethods());
  const [pm, setPm] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderRecord>();
  if (order) return (
    <div className="grid max-w-xl gap-5">
      <PageHeader title="Order placed" description={`Order ${order.number} is being set up.`} />
      <Notice tone="good" title="Thank you">This is a simulated order. In production you receive an email and the service appears once payment is confirmed.</Notice>
      <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => nav('/app/billing/orders')}>View orders</Button><Button variant="secondary" onClick={() => nav('/app/services')}>Go to servers</Button></div>
    </div>
  );
  return (
    <div className="grid gap-5">
      <PageHeader title="Cart" description="Review your items and pay. Prices include VAT at checkout." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Cart' }]} />
      <CapabilityNote area="billing" />
      <ResourceView res={cart} reload={cart.reload} label="Loading cart">
        {(items) => {
          const sub = items.reduce((a, i) => a + i.price.amount, 0); const tax = Math.round(sub * 0.19);
          const defaultId = methods.status === 'ready' ? methods.data.find((m) => m.isDefault)?.id ?? null : null;
          return (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <CartItems items={items.map((i) => ({ id: i.id, title: i.title, detail: `${i.detail} · ${i.cycle}`, price: money(i.price) }))} onRemove={(i) => api.removeFromCart(i.id)} emptyAction={<Button variant="primary" onClick={() => nav('/app/deploy')}>Deploy a server</Button>} />
              {items.length ? (
                <CheckoutSummary
                  rows={[{ label: 'Subtotal', value: money(eur(sub)) }, { label: 'VAT 19%', value: money(eur(tax)) }]} total={{ label: 'Due today', value: money(eur(sub + tax)) }}
                  methods={methods.status === 'ready' ? methods.data.map((m) => ({ value: m.id, label: `${m.brand.toUpperCase()} •••• ${m.last4}`, description: m.last4 === '0087' ? 'Prototype: this card is declined.' : undefined })) : []}
                  methodId={pm ?? defaultId} onMethodChange={setPm} termsLabel="I agree to the Terms of Service" submitLabel="Place order (simulated)" footnote="Nothing is charged in this prototype."
                  onSubmit={async () => { setOrder(await api.checkout({ paymentMethodId: pm ?? defaultId ?? '', acceptedTerms: true })); }}
                />
              ) : null}
            </div>
          );
        }}
      </ResourceView>
    </div>
  );
}
