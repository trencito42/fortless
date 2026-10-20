import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, Notice, Select, StatusBadge, TextField } from '@/design-system';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import type { BillingProfile } from '../../domain/types';

const VAT = /^[A-Z]{2}[A-Z0-9]{2,12}$/;
const VAT_UI = { none: { tone: 'neutral', label: 'No VAT ID' }, pending: { tone: 'warn', label: 'Checking' }, valid: { tone: 'good', label: 'Valid' }, invalid: { tone: 'bad', label: 'Not valid' } } as const;

function Form({ initial }: { initial: BillingProfile }) {
  const api = useApi();
  const [p, setP] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string }>();
  useEffect(() => setP(initial), [initial]);
  const set = <K extends keyof BillingProfile>(k: K, v: BillingProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const er: Record<string, string> = {};
    if (!p.addressLine1.trim()) er.addressLine1 = 'Enter a street address.';
    if (!p.city.trim()) er.city = 'Enter a city.';
    if (!p.postalCode.trim()) er.postalCode = 'Enter a postal code.';
    if (p.vatId && !VAT.test(p.vatId.replace(/\s/g, '').toUpperCase())) er.vatId = 'A VAT ID starts with a country code, for example RO12345678.';
    setErrors(er); if (Object.keys(er).length) return;
    setBusy(true); setNote(undefined);
    try { const saved = await api.saveBillingProfile({ ...p, vatId: p.vatId?.replace(/\s/g, '').toUpperCase() || undefined }); setP(saved); setNote({ tone: 'good', text: 'Billing profile saved. It applies to your next invoice.' }); } catch (e) { setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' }); } finally { setBusy(false); }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid max-w-3xl gap-5">
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card pad="lg" className="grid gap-4">
        <CardHeader title="Billing details" description="Printed on every invoice." />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Company (optional)" autoComplete="organization" value={p.company ?? ''} onChange={(e) => set('company', e.target.value)} />
          <TextField label="Full name" autoComplete="name" value={p.fullName} readOnly description="Managed from the account profile." />
          <TextField className="sm:col-span-2" label="Invoice email" type="email" autoComplete="email" value={p.email} readOnly description="Managed from the account identity." />
          <TextField className="sm:col-span-2" label="Address" autoComplete="address-line1" value={p.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} error={errors.addressLine1} />
          <TextField label="City" autoComplete="address-level2" value={p.city} onChange={(e) => set('city', e.target.value)} error={errors.city} />
          <TextField label="Postal code" autoComplete="postal-code" value={p.postalCode} onChange={(e) => set('postalCode', e.target.value)} error={errors.postalCode} />
          <Select label="Country" value={p.country} onValueChange={(v) => set('country', v ?? p.country)} options={[{ value: 'RO', label: 'Romania' }, { value: 'DE', label: 'Germany' }, { value: 'NL', label: 'Netherlands' }, { value: 'FR', label: 'France' }, { value: 'FI', label: 'Finland' }]} />
          <TextField label="Invoice currency" value={p.currency} readOnly description="The billing backend currently invoices in EUR." />
        </div>
      </Card>
      <Card pad="lg" className="grid gap-4">
        <CardHeader title="VAT" description="Businesses in the EU with a valid VAT ID are invoiced without VAT where the reverse charge applies." actions={<StatusBadge tone={VAT_UI[p.vatStatus].tone}>{VAT_UI[p.vatStatus].label}</StatusBadge>} />
        <TextField label="VAT ID" placeholder="RO12345678" autoCapitalize="characters" value={p.vatId ?? ''} onChange={(e) => { set('vatId', e.target.value); set('vatStatus', e.target.value ? 'pending' : 'none'); }} error={errors.vatId} description="A submitted VAT ID remains pending until the backend records verification." />
      </Card>
      <div><Button type="submit" variant="primary" loading={busy}>Save billing profile</Button></div>
    </form>
  );
}

export default function BillingProfilePage() {
  const res = useApiQuery((a) => a.billingProfile());
  return (
    <div className="grid gap-5">
      <PageHeader title="Billing profile" description="Who we invoice, where, and with which tax treatment." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Billing profile' }]} />
      <CapabilityNote area="billing" />
      <ResourceView res={res} reload={res.reload} label="Loading profile">{(p) => <Form initial={p} />}</ResourceView>
    </div>
  );
}
