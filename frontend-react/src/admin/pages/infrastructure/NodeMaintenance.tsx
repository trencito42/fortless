import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { Status, nodeHealth } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { REGION_NAMES } from '../../fixtures/commerce';
import { dateTime, relative } from '../../lib/format';
import { useNodeOps } from './nodeOps';

export default function NodeMaintenance() {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const ops = useNodeOps();
  const m = can('services:manage');
  return (
    <AdminPage title="Node maintenance" description="Enter or leave maintenance, drain a node and see who is affected. Maintenance state is infrastructure; announcing it publicly is a separate step under Monitoring." actions={<Button variant="secondary" onClick={() => nav('/monitoring/maintenance/new')}>Schedule public maintenance</Button>}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.nodes.map((n) => { const svc = ops.hosted(n); const running = svc.filter((s) => s.runtime === 'running').length; return (
          <Section key={n.id} title={n.name} description={REGION_NAMES[n.region]} actions={<Status map={nodeHealth} value={n.health} />}>
            <dl className="grid grid-cols-3 gap-2 text-[13.5px]"><div><dt className="text-ink3">Active</dt><dd className="font-bold">{svc.length}</dd></div><div><dt className="text-ink3">Running</dt><dd className="font-bold">{running}</dd></div><div><dt className="text-ink3">Offline</dt><dd className="font-bold">{svc.length - running}</dd></div></dl>
            {n.maintenance.enabled ? <div className="mt-3 grid gap-1 rounded-md bg-info-bg p-3 text-[13.5px] text-info"><p className="font-extrabold">{n.maintenance.drain ? 'Draining' : 'In maintenance'} since {relative(n.maintenance.since)}</p><p>Until {dateTime(n.maintenance.until)}</p><p>{n.maintenance.reason}</p></div> : <p className="mt-3 text-[13.5px] text-ink2">Normal operation. Entering maintenance would affect {svc.length} services.</p>}
            <div className="mt-3 flex flex-wrap gap-2">{n.maintenance.enabled ? <Button size="sm" variant="primary" disabled={!m} onClick={() => ops.exit(n)}>End maintenance…</Button> : <Button size="sm" variant="secondary" disabled={!m} onClick={() => ops.enter(n)}>Enter maintenance…</Button>}<Button size="sm" variant="ghost" onClick={() => nav(`/infrastructure/nodes/${n.id}/services`)}>Affected services</Button>{n.maintenance.enabled ? <Badge tone="info">Public announcement: <EntityLink to="/monitoring/maintenance">mnt_0004</EntityLink></Badge> : null}</div>
          </Section>); })}
      </div>
      <PreviewNote />
      {ops.node}
    </AdminPage>
  );
}
