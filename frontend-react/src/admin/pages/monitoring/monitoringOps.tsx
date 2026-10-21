import { Select } from '@/design-system';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { componentHealth } from '../../components/status';
import type { ComponentHealth, StatusComponent } from '../../types';

export const overallOf = (cs: StatusComponent[]): ComponentHealth => (cs.some((c) => c.health === 'major_outage') ? 'major_outage' : cs.some((c) => c.health === 'partial_outage') ? 'partial_outage' : cs.some((c) => c.health === 'degraded') ? 'degraded' : cs.some((c) => c.health === 'maintenance') ? 'maintenance' : 'operational');

/** Component health is a measurement/decision about one component; an incident is a communication about a problem. They are changed separately on purpose. */
export function useComponentOps() {
  const { patch, audit } = useAdmin();
  const dlg = useActionDialog();
  const setHealth = (c: StatusComponent) => dlg.run({
    title: `Set health of ${c.name}`, description: 'Overrides the displayed health. This is shown on the public status page if the component is public. Opening or closing an incident does not change it automatically.', confirmLabel: 'Apply health', permission: 'services:manage', stepUp: true, reasonRequired: true, initial: { h: c.health },
    fields: ({ values, set }) => <Select label="Health" value={values['h']} onValueChange={(v) => set('h', v ?? c.health)} options={(Object.keys(componentHealth) as ComponentHealth[]).map((h) => ({ value: h, label: componentHealth[h]!.label }))} />,
    onConfirm: ({ values, reason }) => { patch('components', c.id, { health: values['h'] as ComponentHealth, checkedAt: new Date().toISOString() }); audit('status.component_health_set', { type: 'component', id: c.id, label: c.name }, { reason, before: { health: c.health }, after: { health: values['h']! } }); return `${c.name}: ${componentHealth[values['h']!]!.label}`; },
  });
  return { node: dlg.node, setHealth };
}
