import { Badge, Notice, Select, SliderField, Switch } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { relative } from '../../lib/format';
import type { FeatureFlag } from '../../types';

export default function Flags() {
  const { data, patch, audit } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('services:manage');
  const toggle = (f: FeatureFlag, on: boolean) => act.run({ title: `${on ? 'Enable' : 'Disable'} “${f.label}”`, description: f.description, confirmLabel: on ? 'Enable flag' : 'Disable flag', permission: 'services:manage', stepUp: f.risk !== 'low', tone: f.risk === 'high' ? 'danger' : 'default', reasonRequired: f.risk !== 'low', effects: [f.scope === 'staff_only' ? 'Visible to staff only' : f.scope === 'percentage' ? `Rolls out to ${f.rollout}% of accounts` : 'Applies to everyone', f.risk === 'high' ? 'High-risk flag: customer-visible or irreversible side effects' : 'Reversible'], onConfirm: ({ reason }) => { patch('featureFlags', f.key, { enabled: on, updatedAt: new Date().toISOString() }); audit('settings.flag_changed', { type: 'feature_flag', id: f.key, label: f.label }, { reason, after: { enabled: String(on) } }); return `${f.label}: ${on ? 'on' : 'off'}`; } });
  const rollout = (f: FeatureFlag, v: number) => { patch('featureFlags', f.key, { rollout: v }); };
  const scope = (f: FeatureFlag, s: FeatureFlag['scope']) => act.run({ title: `Change scope of “${f.label}”`, confirmLabel: 'Change scope', permission: 'services:manage', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { patch('featureFlags', f.key, { scope: s }); audit('settings.flag_scope_changed', { type: 'feature_flag', id: f.key, label: f.label }, { reason, after: { scope: s } }); return 'Scope changed'; } });
  return (
    <AdminPage title="Feature flags" description="Switch capabilities on and off without a deploy. A flag controls exposure; the code behind it must already exist.">
      <Notice tone="warn" title="react_admin is off on purpose">The new admin is available only at the preview address. Turning the flag on in production is a separate, approved release step and is not done by this preview.</Notice>
      <ResourceTable<FeatureFlag>
        tableId="flags" caption="Feature flags" rows={data.featureFlags} getRowId={(f) => f.key} rowLabel={(f) => f.label} searchText={(f) => `${f.key} ${f.label} ${f.description}`}
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'on', label: 'On', test: (f) => f.enabled }, { value: 'off', label: 'Off', test: (f) => !f.enabled }, { value: 'high', label: 'High risk', test: (f) => f.risk === 'high' }]}
        columns={[
          col<FeatureFlag>('n', 'Flag', (f) => <span className="grid md:min-w-[16rem] max-w-[34rem]"><b>{f.label}</b><span className="font-mono text-[12px] text-ink3">{f.key}</span><span className="text-[13px] text-ink2">{f.description}</span></span>, { primary: true, sort: (f) => f.label }),
          col<FeatureFlag>('e', 'Enabled', (f) => <Switch hideLabel label={`Enabled: ${f.label}`} checked={f.enabled} disabled={!m} onCheckedChange={(v) => toggle(f, v)} />, { sort: (f) => String(f.enabled) }),
          col<FeatureFlag>('s', 'Scope', (f) => <Select label={`Scope of ${f.label}`} hideLabel size="sm" value={f.scope} disabled={!m} onValueChange={(v) => v && v !== f.scope && scope(f, v as FeatureFlag['scope'])} options={[{ value: 'global', label: 'Everyone' }, { value: 'staff_only', label: 'Staff only' }, { value: 'percentage', label: 'Percentage' }]} />),
          col<FeatureFlag>('r', 'Rollout', (f) => (f.scope === 'percentage' ? <div className="min-w-[10rem]"><SliderField label={`Rollout for ${f.label}`} value={f.rollout} min={0} max={100} step={5} formatValue={(v) => `${v}%`} onValueChange={(v) => rollout(f, v)} disabled={!m} /></div> : <span className="text-ink3">{f.scope === 'global' ? (f.enabled ? '100%' : '0%') : 'staff'}</span>), { hideOnMobile: true }),
          col<FeatureFlag>('k', 'Risk', (f) => <Badge tone={f.risk === 'high' ? 'bad' : f.risk === 'medium' ? 'warn' : 'neutral'}>{f.risk}</Badge>, { sort: (f) => f.risk }),
          col<FeatureFlag>('o', 'Owner', (f) => f.owner, { sort: (f) => f.owner, hideOnMobile: true }),
          col<FeatureFlag>('u', 'Updated', (f) => nw(relative(f.updatedAt)), { sort: (f) => f.updatedAt, hideOnMobile: true }),
        ]}
        empty={{ title: 'No flags' }}
      />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
