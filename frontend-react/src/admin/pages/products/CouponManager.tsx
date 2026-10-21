import { useEffect, useState } from 'react';
import { Badge, Button, DateField, NumberField, Select, Switch, TextField } from '@/design-system';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useAdminRouter } from '../../router';
import { useSession } from '../../session';
import { ADMIN_NOW, DAY, date, daysBetween, money } from '../../lib/format';
import type { Coupon, Currency } from '../../types';

const discountText = (c: Coupon) => (c.discountType === 'PERCENTAGE' ? `${c.discountValue}% off` : money({ amount: c.discountValue, currency: c.currency ?? 'EUR' }) + ' off');
const stateOf = (c: Coupon) => (c.redemptionsCount >= c.maxRedemptions ? 'exhausted' : Date.parse(c.expiresAt) < ADMIN_NOW ? 'expired' : c.isActive ? 'active' : 'inactive');

/** Coupon list + create dialog. Shared by Products → Coupons and Marketing → Promotions so both always show the same records. */
export function CouponManager({ openNew }: { openNew?: boolean }) {
  const { data, add, patch, audit, newId } = useAdmin();
  const { search } = useAdminRouter();
  const { can } = useSession();
  const act = useActionDialog();
  const manage = can('catalog:manage');
  const [started, setStarted] = useState(false);
  const create = () => act.run({
    title: 'Create coupon', description: 'Codes are case-insensitive, single-use per order, and validated server-side when the quote is created.', confirmLabel: 'Create coupon', permission: 'catalog:manage', reasonRequired: false,
    initial: { code: '', type: 'PERCENTAGE', value: '10', currency: 'EUR', max: '100', expires: new Date(ADMIN_NOW + 60 * DAY).toISOString().slice(0, 10), scope: 'All products' },
    validate: (v) => ({
      ...(!/^[A-Z0-9]{4,20}$/.test(v['code']!) ? { code: 'Use 4–20 uppercase letters or digits.' } : data.coupons.some((c) => c.code === v['code']) ? { code: 'This code already exists.' } : {}),
      ...(v['type'] === 'PERCENTAGE' ? (Number(v['value']) >= 1 && Number(v['value']) <= 90 ? {} : { value: 'Percentage must be 1–90.' }) : /^\d+([.,]\d{1,2})?$/.test(v['value']!) && Number(v['value']!.replace(',', '.')) > 0 ? {} : { value: 'Enter an amount like 5.00.' }),
      ...(!(Number(v['max']) >= 1) ? { max: 'At least 1 redemption.' } : {}), ...(Date.parse(v['expires']!) <= ADMIN_NOW ? { expires: 'Expiry must be in the future.' } : {}),
    }),
    fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Code" value={values['code']} onChange={(e) => set('code', e.target.value.toUpperCase())} error={errors['code']} maxLength={20} autoComplete="off" />
      <Select label="Discount type" value={values['type']} onValueChange={(v) => set('type', v ?? 'PERCENTAGE')} options={[{ value: 'PERCENTAGE', label: 'Percentage' }, { value: 'FIXED_AMOUNT', label: 'Fixed amount' }]} />
      <TextField label={values['type'] === 'PERCENTAGE' ? 'Percent off' : 'Amount off'} inputMode="decimal" value={values['value']} onChange={(e) => set('value', e.target.value)} error={errors['value']} />
      {values['type'] === 'FIXED_AMOUNT' ? <Select label="Currency" value={values['currency']} onValueChange={(v) => set('currency', v ?? 'EUR')} options={['EUR', 'USD', 'RON'].map((c) => ({ value: c, label: c }))} /> : <div />}
      <NumberField label="Max redemptions" value={Number(values['max'])} onValueChange={(v) => set('max', String(v ?? ''))} min={1} error={errors['max']} />
      <DateField label="Expires" value={values['expires']} onChange={(e) => set('expires', e.target.value)} error={errors['expires']} />
      <Select className="sm:col-span-2" label="Applies to" value={values['scope']} onValueChange={(v) => set('scope', v ?? '')} options={['All products', ...data.products.filter((p) => p.providerType !== 'NONE').map((p) => p.name)].map((x) => ({ value: x, label: x }))} />
    </div>,
    onConfirm: ({ values }) => {
      const fixed = values['type'] === 'FIXED_AMOUNT';
      const c: Coupon = { id: newId('cpn'), code: values['code']!, discountType: values['type'] as Coupon['discountType'], discountValue: fixed ? Math.round(Number(values['value']!.replace(',', '.')) * 100) : Number(values['value']), ...(fixed ? { currency: values['currency'] as Currency } : {}), maxRedemptions: Number(values['max']), redemptionsCount: 0, expiresAt: new Date(values['expires']! + 'T23:59:59Z').toISOString(), isActive: true, appliesTo: values['scope']! };
      add('coupons', c); audit('catalog.coupon_created', { type: 'coupon', id: c.id, label: c.code }, { after: { code: c.code, discount: discountText(c) } }); return `Coupon ${c.code} created`;
    },
  });
  // Opens the create dialog once when arriving from a quick action (?new=1).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if ((openNew || search.get('new') === '1') && !started && manage) { setStarted(true); create(); } }, [openNew, search, manage]);
  const toggle = (c: Coupon, v: boolean) => act.run({ title: v ? `Activate ${c.code}` : `Deactivate ${c.code}`, confirmLabel: v ? 'Activate' : 'Deactivate', permission: 'catalog:manage', description: v ? 'Customers can apply it again until it expires.' : 'No new quote can use it. Existing orders keep their discount.', onConfirm: () => { patch('coupons', c.id, { isActive: v }); audit('catalog.coupon_status_changed', { type: 'coupon', id: c.id, label: c.code }, { after: { active: String(v) } }); return `${c.code} ${v ? 'activated' : 'deactivated'}`; } });
  return (
    <>
      <ResourceTable<Coupon>
        tableId="coupons" caption="Coupons" rows={data.coupons} getRowId={(c) => c.id} rowLabel={(c) => c.code} searchText={(c) => `${c.code} ${c.appliesTo}`}
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'active', label: 'Active', test: (c) => stateOf(c) === 'active' }, { value: 'inactive', label: 'Inactive', test: (c) => stateOf(c) === 'inactive' }, { value: 'expired', label: 'Expired or exhausted', test: (c) => ['expired', 'exhausted'].includes(stateOf(c)) }]}
        toolbar={<Button variant="primary" size="sm" leadingIcon="add-01" onClick={create} disabled={!manage}>New coupon</Button>}
        columns={[
          col<Coupon>('code', 'Code', (c) => <span className="font-mono font-bold">{c.code}</span>, { primary: true, sort: (c) => c.code }),
          col<Coupon>('d', 'Discount', (c) => discountText(c), { sort: (c) => c.discountValue }),
          col<Coupon>('s', 'State', (c) => { const s = stateOf(c); return <Badge tone={s === 'active' ? 'good' : s === 'inactive' ? 'neutral' : 'warn'}>{s}</Badge>; }),
          col<Coupon>('u', 'Redeemed', (c) => <span className="whitespace-nowrap tabular-nums">{c.redemptionsCount} / {c.maxRedemptions}</span>, { sort: (c) => c.redemptionsCount, numeric: true }),
          col<Coupon>('e', 'Expires', (c) => <span title={`${daysBetween(c.expiresAt)} days`}>{nw(date(c.expiresAt))}</span>, { sort: (c) => c.expiresAt }),
          col<Coupon>('a', 'Applies to', (c) => c.appliesTo, { hideOnMobile: true }),
          col<Coupon>('on', 'Enabled', (c) => <Switch hideLabel label={`Enabled: ${c.code}`} checked={c.isActive} disabled={!manage} onCheckedChange={(v) => toggle(c, v)} />),
        ]}
        empty={{ title: 'No coupons', description: 'Create one to run a promotion.' }}
      />
      {act.node}
    </>
  );
}
