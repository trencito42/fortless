import { useState } from 'react';
import { Button, Notice, TextField } from '@/design-system';
import { adminRequest } from '../data/http';
import { useSession } from '../session';
import { LiveMutation, type MutationSpec } from './LiveMutation';
import { isRow, text, type Row } from './helpers';
import { billingProfileBody } from './bodies';

/** Billing profile of an account (PUT, step-up). Country is a two-letter code; the tax id stays unverified until staff verifies it elsewhere. */
export function LiveBillingProfileAction({ account, profile, reload }: { account: Row; profile: unknown; reload: () => void }) {
  const { can } = useSession();
  if (!can('accounts:manage')) return null;
  const p = isRow(profile) ? profile : {};
  const id = text(account['id']);
  const spec: MutationSpec = {
    title: 'Edit billing profile', confirmLabel: 'Save billing profile', endpoint: `/accounts/${encodeURIComponent(id)}/billing-profile`, method: 'PUT', description: 'Legal details used on future invoices. Issued invoices are not changed. Requires recent step-up.',
    initial: { companyName: text(p['company_name']), taxId: text(p['tax_id']), taxIdType: text(p['tax_id_type']), addressLine1: text(p['address_line1']), addressLine2: text(p['address_line2']), city: text(p['city']), postalCode: text(p['postal_code']), country: text(p['country']) },
    fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Company name" value={values['companyName']} onChange={(e) => set('companyName', e.target.value)} error={errors['companyName']} maxLength={120} className="sm:col-span-2" />
      <TextField label="Tax id" value={values['taxId']} onChange={(e) => set('taxId', e.target.value)} error={errors['taxId']} maxLength={30} />
      <TextField label="Tax id type" value={values['taxIdType']} onChange={(e) => set('taxIdType', e.target.value)} maxLength={30} description="Reverse charge applies only to verified types." />
      <TextField label="Address line 1" value={values['addressLine1']} onChange={(e) => set('addressLine1', e.target.value)} error={errors['addressLine1']} maxLength={150} className="sm:col-span-2" />
      <TextField label="Address line 2" value={values['addressLine2']} onChange={(e) => set('addressLine2', e.target.value)} maxLength={150} className="sm:col-span-2" />
      <TextField label="City" value={values['city']} onChange={(e) => set('city', e.target.value)} error={errors['city']} maxLength={80} />
      <TextField label="Postal code" value={values['postalCode']} onChange={(e) => set('postalCode', e.target.value)} error={errors['postalCode']} maxLength={20} />
      <TextField label="Country (ISO code)" value={values['country']} onChange={(e) => set('country', e.target.value.toUpperCase())} error={errors['country']} maxLength={2} />
    </div>,
    validate: (v) => ({ ...((v['addressLine1']?.trim().length ?? 0) < 2 ? { addressLine1: 'Address is required.' } : {}), ...((v['city']?.trim().length ?? 0) < 2 ? { city: 'City is required.' } : {}), ...(!/^[A-Za-z0-9 -]{2,20}$/.test(v['postalCode']?.trim() ?? '') ? { postalCode: 'Use 2–20 letters, digits, spaces or hyphens.' } : {}), ...(!/^[A-Z]{2}$/.test(v['country'] ?? '') ? { country: 'Use a two-letter code, e.g. DE.' } : {}), ...(v['taxId'] && !/^[A-Za-z0-9 .\-/]{1,30}$/.test(v['taxId']) ? { taxId: 'Use letters, digits, spaces and . - / only.' } : {}) }),
    body: (_r, v) => billingProfileBody(v),
  };
  return <LiveMutation spec={spec} onDone={reload} trigger={<Button size="sm" variant="secondary">Billing profile</Button>} />;
}

/** Runs the renewal job now. The result (counts per outcome) is shown after the call; nothing is assumed about individual payments. */
export function LiveRenewalsAction({ reload }: { reload: () => void }) {
  const { can } = useSession();
  const [result, setResult] = useState<Row | null>(null);
  if (!can('accounts:manage')) return null;
  const spec: MutationSpec = {
    title: 'Process renewals now', confirmLabel: 'Run renewals', tone: 'danger', description: 'Charges every subscription that is due, using idempotent payment attempts. Outcomes are confirmed by Stripe webhooks, not by this call. Requires recent step-up.',
    run: async () => { const r = await adminRequest<Row>('/billing/process-renewals', { method: 'POST', body: '{}' }); setResult(r); },
  };
  return <div className="grid gap-2">
    <LiveMutation spec={spec} onDone={reload} trigger={<Button size="sm" variant="secondary">Process renewals now</Button>} />
    {result ? <Notice tone="info" title="Renewal run finished">{Object.entries(result).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(v)}`).join(' · ') || 'The job returned no counters.'}</Notice> : null}
  </div>;
}
