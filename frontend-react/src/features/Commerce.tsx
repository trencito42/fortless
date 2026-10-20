import { useState } from 'react';
import { Button, Card, CardHeader, Checkbox, DescriptionList, EmptyState, IconButton, Notice, Select } from '@/design-system';

export interface CartLine { id: string; title: string; detail: string; /** Already formatted, for example "€9.00". */ price: string }

/** Items in the cart. Removing is optimistic only in the caller; this reports the click and shows an empty state with a way forward. */
export function CartItems({ items, onRemove, emptyAction }: { items: CartLine[]; onRemove: (item: CartLine) => void | Promise<void>; emptyAction?: React.ReactNode }) {
  return (
    <Card pad="lg" className="grid gap-3">
      <CardHeader title={`Items (${items.length})`} />
      {items.length === 0 ? <EmptyState icon="shopping-cart-01" title="Your cart is empty" description="Deploy a server or register a domain to add something." action={emptyAction} /> : (
        <ul className="grid divide-y divide-ink/10" aria-label="Cart items">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0"><span className="block font-bold">{i.title}</span><span className="block text-[13px] text-ink3">{i.detail}</span></span>
              <span className="flex items-center gap-2"><span className="font-semibold tabular-nums">{i.price}</span><IconButton label={`Remove ${i.title}`} icon="delete-02" size="sm" variant="ghost" onClick={() => void onRemove(i)} /></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export interface CheckoutSummaryProps {
  /** Rows above the total. Amounts arrive formatted; nothing is calculated here. */
  rows: { label: string; value: string }[];
  total: { label: string; value: string };
  methods: { value: string; label: string; description?: string }[];
  methodId: string | null;
  onMethodChange: (id: string | null) => void;
  termsLabel: string;
  /** Resolves when the order is placed. A rejection is shown inside the card and nothing else changes. */
  onSubmit: () => Promise<void>;
  submitLabel?: string;
  /** Plain statement of what is simulated or what happens next. */
  footnote?: string;
}

/** Checkout card: totals, payment method, terms and one primary action. The action stays disabled until the terms are accepted. */
export function CheckoutSummary({ rows, total, methods, methodId, onMethodChange, termsLabel, onSubmit, submitLabel = 'Place order', footnote }: CheckoutSummaryProps) {
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    if (!methodId) { setError('Choose a payment method.'); return; }
    setBusy(true); setError(undefined);
    try { await onSubmit(); } catch (e) { setError(e instanceof Error ? e.message : 'Checkout failed. Nothing was charged.'); } finally { setBusy(false); }
  };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Checkout" />
      <DescriptionList items={[...rows.map((r) => ({ label: r.label, value: r.value })), { label: total.label, value: <strong className="text-[17px]">{total.value}</strong> }]} />
      <Select label="Payment method" value={methodId} onValueChange={onMethodChange} options={methods} placeholder="Choose a card" />
      <Checkbox label={termsLabel} checked={terms} onCheckedChange={setTerms} />
      {error ? <Notice tone="bad" title="Payment failed">{error}</Notice> : null}
      <Button variant="primary" size="lg" loading={busy} disabled={!terms} onClick={() => void submit()}>{submitLabel}</Button>
      {footnote ? <p className="text-[13px] text-ink3">{footnote}</p> : null}
    </Card>
  );
}
