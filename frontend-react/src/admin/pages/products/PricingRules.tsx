import { Badge, Notice, Switch } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col } from '../../components/cols';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import type { PriceRule } from '../../types';

const kindLabel: Record<PriceRule['kind'], string> = { currency: 'Currency', cycle: 'Billing cycle', discount: 'Discount', tax: 'Tax' };
// What the backend actually implements today; everything else is a planned concept shown for design review.
const backed: Record<string, boolean> = { prl_eur: true, prl_usd: true, prl_ron: true, prl_quarter: true, prl_annual: true, prl_vat_table: true, prl_reverse: true, prl_vat_us: false, prl_loyal: false };

export default function PricingRules() {
  const { data, patch, audit } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const manage = can('catalog:manage');
  const toggle = (r: PriceRule, next: PriceRule['status']) => act.run({ title: `${next === 'active' ? 'Activate' : 'Disable'} “${r.name}”`, confirmLabel: next === 'active' ? 'Activate rule' : 'Disable rule', permission: 'catalog:manage', stepUp: true, reasonRequired: true, tone: next === 'active' ? 'default' : 'danger', description: 'Affects quotes created after the change. Signed quotes already issued keep their price until they expire.', onConfirm: ({ reason }) => { patch('priceRules', r.id, { status: next }); audit('catalog.price_rule_changed', { type: 'price_rule', id: r.id, label: r.name }, { reason, after: { status: next } }); return `${r.name}: ${next}`; } });
  return (
    <AdminPage title="Pricing rules" description="Currency prices, cycle discounts, tax and automatic discounts that the quote engine applies. Quotes are signed and time-bound; nothing here can be changed by the client.">
      <Notice tone="info" title="What the backend implements today">Prices are stored per plan, currency and billing cycle. VAT comes from a country table and EU reverse charge. Coupons are validated per quote. Rules marked “Concept” are not executable yet.</Notice>
      <ResourceTable<PriceRule>
        tableId="price-rules" caption="Pricing rules" rows={data.priceRules} getRowId={(r) => r.id} rowLabel={(r) => r.name} searchText={(r) => `${r.name} ${r.description} ${r.scope}`}
        segments={[{ value: 'all', label: 'All', test: () => true }, ...(['currency', 'cycle', 'discount', 'tax'] as const).map((k) => ({ value: k, label: kindLabel[k], test: (r: PriceRule) => r.kind === k }))]}
        columns={[
          col<PriceRule>('n', 'Rule', (r) => <span className="grid md:min-w-[14rem]"><b>{r.name}</b><span className="text-[13px] text-ink2">{r.description}</span></span>, { primary: true, sort: (r) => r.name }),
          col<PriceRule>('k', 'Kind', (r) => <Badge>{kindLabel[r.kind]}</Badge>, { sort: (r) => r.kind }),
          col<PriceRule>('v', 'Value', (r) => r.value, { hideOnMobile: true }),
          col<PriceRule>('s', 'Scope', (r) => r.scope, { hideOnMobile: true }),
          col<PriceRule>('b', 'Backend', (r) => <Badge tone={backed[r.id] ? 'good' : 'warn'}>{backed[r.id] ? 'Implemented' : 'Concept'}</Badge>),
          col<PriceRule>('on', 'Active', (r) => <Switch hideLabel label={`Active: ${r.name}`} checked={r.status === 'active'} disabled={!manage || !backed[r.id]} onCheckedChange={(v) => toggle(r, v ? 'active' : 'disabled')} />, { sort: (r) => r.status }),
        ]}
        empty={{ title: 'No pricing rules' }}
      />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
