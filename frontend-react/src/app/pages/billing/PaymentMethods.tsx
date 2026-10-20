import { useState } from 'react';
import { Button, Dialog, Notice, RadioCardGroup } from '@/design-system';
import { PaymentMethodList, type PaymentMethod } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import type { PaymentMethodRecord } from '../../domain/types';

const TEST_CARDS = [
  { value: 'ok', label: 'Visa •••• 4242', description: 'Succeeds', brand: 'visa' as const, last4: '4242', expMonth: 12, expYear: 2030 },
  { value: 'declined', label: 'Mastercard •••• 0087', description: 'Always declined, to test the failure state', brand: 'mastercard' as const, last4: '0087', expMonth: 6, expYear: 2029 },
  { value: 'amex', label: 'American Express •••• 0005', description: 'Succeeds', brand: 'amex' as const, last4: '0005', expMonth: 3, expYear: 2031 },
];

export default function PaymentMethods() {
  const api = useApi();
  const res = useApiQuery((a) => a.listPaymentMethods());
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('ok');
  const [err, setErr] = useState<string>();
  const ui = (m: PaymentMethodRecord): PaymentMethod => ({ id: m.id, brand: m.brand.toUpperCase(), last4: m.last4, expires: m.expMonth ? `${String(m.expMonth).padStart(2, '0')}/${m.expYear}` : 'n/a', isDefault: m.isDefault, expired: !!m.expYear && m.expYear < 2026 });
  const run = (fn: () => Promise<unknown>) => async () => { setErr(undefined); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'That did not work.'); } };
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title="Payment methods" description="Cards used for invoices and renewals." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Payment methods' }]} />
      <CapabilityNote area="billing" />
      {err ? <Notice tone="bad">{err}</Notice> : null}
      <ResourceView res={res} reload={res.reload} label="Loading cards">
        {(list) => <PaymentMethodList methods={list.map(ui)} onAdd={() => setOpen(true)} onMakeDefault={async (m) => run(() => api.setDefaultPaymentMethod(m.id))()} onRemove={async (m) => run(() => api.removePaymentMethod(m.id))()} />}
      </ResourceView>
      <Dialog open={open} onOpenChange={setOpen} title="Add a card" description="Prototype: choose a test card. In production, card details are typed into the payment provider's hosted fields and never touch our servers."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { const c = TEST_CARDS.find((x) => x.value === pick)!; void run(async () => { await api.addPaymentMethod({ brand: c.brand, last4: c.last4, expMonth: c.expMonth, expYear: c.expYear, holder: 'Alex Morgan' }); setOpen(false); })(); }}>Add card</Button></>}>
        <RadioCardGroup legend="Test card" columns={1} value={pick} onValueChange={setPick} options={TEST_CARDS.map(({ value, label, description }) => ({ value, label, description }))} />
      </Dialog>
    </div>
  );
}
