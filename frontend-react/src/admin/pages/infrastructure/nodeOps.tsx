import { Checkbox, TextField } from '@/design-system';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { iso, HOUR } from '../../lib/format';
import type { InfraNode } from '../../types';

/** Node maintenance and cost operations. Mirrors PATCH /infrastructure/nodes/:id/maintenance (services:manage + step-up). */
export function useNodeOps() {
  const { data, patch, audit } = useAdmin();
  const dlg = useActionDialog();
  const ent = (n: InfraNode) => ({ type: 'node', id: n.id, label: n.name });
  const hosted = (n: InfraNode) => data.services.filter((s) => s.nodeId === n.id && (s.lifecycle === 'ACTIVE' || s.lifecycle === 'PAST_DUE'));
  const enter = (n: InfraNode) => {
    const svc = hosted(n);
    dlg.run({
      title: `Put ${n.name} in maintenance`, description: `${svc.length} active services run here (${svc.filter((s) => s.runtime === 'running').length} running). Drain stops new allocations; it does not move or stop existing services.`, confirmLabel: 'Enter maintenance', permission: 'services:manage', stepUp: true, tone: 'danger', reasonRequired: true, reasonLabel: 'Reason (shown on the public status page if published)',
      effects: ['Stop placing new orders on this node', 'Optionally mark affected components as under maintenance', `${svc.length} customers will see the node as in maintenance in their panel`],
      initial: { drain: 'yes', hours: '4', notify: 'yes' },
      validate: (v) => (Number(v['hours']) >= 1 && Number(v['hours']) <= 72 ? {} : { hours: 'Window must be 1–72 hours.' }),
      fields: ({ values, set, errors }) => <div className="grid gap-3"><Checkbox label="Drain: no new allocations" checked={values['drain'] === 'yes'} onCheckedChange={(v) => set('drain', v ? 'yes' : 'no')} /><TextField label="Expected duration (hours)" inputMode="numeric" value={values['hours']} onChange={(e) => set('hours', e.target.value)} error={errors['hours']} /><Checkbox label="Email customers with services on this node" checked={values['notify'] === 'yes'} onCheckedChange={(v) => set('notify', v ? 'yes' : 'no')} /></div>,
      onConfirm: ({ values, reason }) => { patch('nodes', n.id, { maintenance: { enabled: true, drain: values['drain'] === 'yes', reason, since: iso(0), until: iso(Number(values['hours']) * HOUR) } }); audit('infrastructure.maintenance_entered', ent(n), { reason, after: { drain: values['drain']! } }); return `${n.name} is in maintenance`; },
    });
  };
  const exit = (n: InfraNode) => dlg.run({ title: `End maintenance on ${n.name}`, description: 'Returns the node to normal. It accepts new allocations again.', confirmLabel: 'End maintenance', permission: 'services:manage', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { patch('nodes', n.id, { maintenance: { enabled: false, drain: false, reason: null, since: null, until: null } }); audit('infrastructure.maintenance_ended', ent(n), { reason }); return `${n.name} is back in service`; } });
  const setCost = (n: InfraNode) => dlg.run({ title: `Monthly cost of ${n.name}`, description: 'Used only for the estimated margin on the capacity page. Leave empty to mark the cost as unknown.', confirmLabel: 'Save cost', permission: 'catalog:manage', reasonRequired: false, initial: { cost: n.monthlyCost ? (n.monthlyCost.amount / 100).toFixed(2) : '' }, validate: (v) => (v['cost'] === '' || /^\d+([.,]\d{1,2})?$/.test(v['cost']!) ? {} : { cost: 'Enter an amount like 219.00 (EUR) or leave empty.' }), fields: ({ values, set, errors }) => <TextField label="Monthly cost (EUR)" inputMode="decimal" value={values['cost']} onChange={(e) => set('cost', e.target.value)} error={errors['cost']} />, onConfirm: ({ values }) => { patch('nodes', n.id, { monthlyCost: values['cost'] ? { amount: Math.round(Number(values['cost']!.replace(',', '.')) * 100), currency: 'EUR' } : null }); audit('infrastructure.node_cost_updated', ent(n)); return 'Cost saved'; } });
  const reconcile = (n: InfraNode) => dlg.run({ title: `Reconcile ${n.name}`, description: 'Reads every server on the node from the provider and compares allocations. Read-only.', confirmLabel: 'Reconcile node', permission: 'services:manage', stepUp: true, effects: ['List servers and allocations on the node', 'Flag orphaned allocations and servers unknown to Fortless'], onConfirm: () => { audit('infrastructure.reconcile', ent(n)); return `Reconciliation finished: ${hosted(n).length} services compared, no orphans found (simulated)`; } });
  return { node: dlg.node, enter, exit, setCost, reconcile, hosted };
}
