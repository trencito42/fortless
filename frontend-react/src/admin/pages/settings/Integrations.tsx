import { AdminPage } from '../../components/Page';
import { KpiGrid } from '../../components/Cards';
import { ConnectionCard } from '../../components/ConnectionCard';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';

export default function Integrations() {
  const { data } = useAdmin();
  const c = data.connections;
  return (
    <AdminPage title="Integrations" description="Everything Fortless connects to. Open one for details, scopes and recent errors.">
      <KpiGrid cols={4} items={[{ label: 'Connected', value: c.filter((x) => x.health === 'connected').length }, { label: 'Degraded', value: c.filter((x) => x.health === 'degraded').length }, { label: 'Errors', value: c.filter((x) => x.health === 'error').length }, { label: 'Not configured', value: c.filter((x) => x.health === 'not_configured').length }]} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">{c.map((x) => <ConnectionCard key={x.id} c={x} />)}</div>
      <PreviewNote />
    </AdminPage>
  );
}
