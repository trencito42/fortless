import { Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { KpiGrid, Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { Status, workerStatus } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { col } from '../../components/cols';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { iso, relative } from '../../lib/format';
import type { Worker } from '../../types';

export default function Workers() {
  const { data, patch, audit } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const queues = [...new Set(data.workers.map((w) => w.queue))];
  const restart = (w: Worker) => act.run({ title: `Restart ${w.id}`, description: 'Graceful stop, then start. The job it was running is released and picked up by another worker; idempotency keys stop double execution.', confirmLabel: 'Restart worker', permission: 'services:manage', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { patch('workers', w.id, { status: 'idle', lastHeartbeat: iso(0), currentJobId: null }); audit('worker.restarted', { type: 'worker', id: w.id, label: w.queue }, { reason }); return `${w.id} restarted`; } });
  return (
    <AdminPage title="Workers" description="Processes that pull jobs from the queues. A worker that stops sending heartbeats is marked stalled and its job is released.">
      <KpiGrid cols={4} items={[{ label: 'Workers', value: data.workers.length }, { label: 'Busy', value: data.workers.filter((w) => w.status === 'busy').length }, { label: 'Stalled', value: data.workers.filter((w) => w.status === 'stalled').length, hint: 'No heartbeat for over 60 s' }, { label: 'Failures (24 h)', value: data.workers.reduce((a, w) => a + w.failed24h, 0), hint: `${data.workers.reduce((a, w) => a + w.processed24h, 0).toLocaleString('en-IE')} processed` }]} />
      <Section title="Queues"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{queues.map((q) => { const ws = data.workers.filter((w) => w.queue === q); return <div key={q} className="rounded-lg bg-s2 p-3.5"><p className="font-bold">{q}</p><p className="text-[13px] text-ink3">{ws.length} worker{ws.length > 1 ? 's' : ''}</p><p className="mt-1 text-[13.5px]">{ws.filter((w) => w.status === 'stalled').length ? <span className="font-bold text-bad">stalled</span> : <span className="font-semibold text-good">healthy</span>}</p></div>; })}</div></Section>
      <Section title="Workers"><RelatedTable rows={data.workers} getRowId={(w) => w.id} caption="Workers" pageSize={10} columns={[
        col<Worker>('id', 'Worker', (w) => <span className="font-mono text-[13px] font-semibold">{w.id}</span>, { primary: true, sort: (w) => w.id }), col<Worker>('q', 'Queue', (w) => w.queue, { sort: (w) => w.queue }), col<Worker>('s', 'Status', (w) => <Status map={workerStatus} value={w.status} />, { sort: (w) => w.status }), col<Worker>('h', 'Last heartbeat', (w) => relative(w.lastHeartbeat), { sort: (w) => w.lastHeartbeat }), col<Worker>('p', 'Processed (24 h)', (w) => w.processed24h.toLocaleString('en-IE'), { numeric: true, sort: (w) => w.processed24h }), col<Worker>('f', 'Failed (24 h)', (w) => w.failed24h, { numeric: true, sort: (w) => w.failed24h }), col<Worker>('v', 'Version', (w) => <span className="font-mono text-[12.5px]">{w.version}</span>, { hideOnMobile: true }),
        col<Worker>('a', 'Actions', (w) => <Button size="sm" variant={w.status === 'stalled' ? 'primary' : 'ghost'} disabled={!can('services:manage')} onClick={() => restart(w)}>Restart…</Button>, { hideOnMobile: false }),
      ]} /></Section>
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
