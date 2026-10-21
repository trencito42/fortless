import { AdminPage } from '../../components/Page';
import { KpiGrid } from '../../components/Cards';
import { ConnectionCard } from '../../components/ConnectionCard';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';

export default function Providers() {
  const { data } = useAdmin();
  const c = data.connections;
  return (
    <AdminPage title="Provider connections" description="Panels, node agents and external services Fortless talks to. Credentials live only on the server; here you see health, last sync and a masked reference.">
      <KpiGrid cols={4} items={[{ label: 'Connected', value: c.filter((x) => x.health === 'connected').length, icon: 'plug-01' }, { label: 'Degraded', value: c.filter((x) => x.health === 'degraded').length, icon: 'alert-01' }, { label: 'Errors', value: c.filter((x) => x.health === 'error').length, icon: 'alert-circle' }, { label: 'Not configured', value: c.filter((x) => x.health === 'not_configured').length, icon: 'settings-01', hint: 'No backend adapter' }]} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">{c.map((x) => <ConnectionCard key={x.id} c={x} />)}</div>
      <PreviewNote>“Test connection” is simulated here. Provider admin tokens (for example Pterodactyl application keys) are never sent to the browser; the real check runs on the server.</PreviewNote>
    </AdminPage>
  );
}
