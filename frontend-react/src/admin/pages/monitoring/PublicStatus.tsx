import { useState } from 'react';
import { Badge, Button, Notice, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { Status, componentHealth, incidentStatus } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useToast } from '../../toast';
import { dateTime } from '../../lib/format';
import { overallOf } from './monitoringOps';
import { publicLeak } from './IncidentEditor';

export default function PublicStatus() {
  const { data, audit } = useAdmin();
  const nav = useNav();
  const toast = useToast();
  const [banner, setBanner] = useState('');
  const [err, setErr] = useState<string>();
  const pub = data.components.filter((c) => c.public);
  const hidden = data.components.filter((c) => !c.public);
  const overall = overallOf(pub);
  const incidents = data.incidents.filter((i) => i.published && i.status !== 'resolved');
  const groups = [...new Set(pub.map((c) => c.group))];
  return (
    <AdminPage title="Public status page" description="Exactly what customers and visitors see. Only the fields shown below are ever published; node ids, IP addresses, latency, job and customer data stay internal." actions={<Button variant="secondary" leadingIcon="arrow-up-right-01" onClick={() => window.open('/status', '_blank', 'noopener')}>Open live page</Button>}>
      <Columns>
        <Section title="Public preview" description="Rendered from current component health and published incidents.">
          <div className="grid gap-3 rounded-lg bg-s2 p-4">
            <Notice tone={overall === 'operational' ? 'good' : overall === 'major_outage' ? 'bad' : 'warn'} title={overall === 'operational' ? 'All systems operational' : componentHealth[overall]!.label}>{banner || (incidents.length ? `${incidents.length} active incident${incidents.length > 1 ? 's' : ''}` : 'No known issues.')}</Notice>
            {groups.map((g) => <div key={g}><p className="mb-1 text-[12.5px] font-bold text-ink3">{g}</p><ul className="grid gap-1">{pub.filter((c) => c.group === g).map((c) => <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-s1 px-3 py-2"><span className="font-semibold">{c.name}</span><Status map={componentHealth} value={c.health} /></li>)}</ul></div>)}
            {incidents.map((i) => <div key={i.id} className="rounded-md bg-s1 p-3"><p className="font-extrabold">{i.title}</p><Status map={incidentStatus} value={i.status} /><p className="mt-1 text-[14px]">{i.updates[0]?.message}</p><p className="text-[12.5px] text-ink3">Updated {dateTime(i.updates[0]?.at)}</p></div>)}
          </div>
        </Section>
        <div className="grid content-start gap-5">
          <Section title="Banner message" description="Short notice above the component list. Cleared when empty."><form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); const l = publicLeak(banner); if (l) { setErr(`Contains an ${l}. Public text must not expose internal details.`); return; } setErr(undefined); audit('status.banner_set', { type: 'status_page', id: 'public' }); toast({ tone: 'good', title: 'Banner updated in the preview only' }); }}><Textarea label="Banner" value={banner} onChange={(e) => setBanner(e.target.value)} rows={3} maxLength={200} counter error={err} /><div><Button type="submit" size="sm" variant="primary">Update preview</Button></div></form></Section>
          <Section title="Not published" description="Components marked internal. Change visibility on Component health." actions={<Button size="sm" variant="ghost" onClick={() => nav('/monitoring/components')}>Manage</Button>}>{hidden.length ? <ul className="grid gap-1.5">{hidden.map((c) => <li key={c.id} className="rounded-md bg-s2 px-3 py-2 font-semibold">{c.name}</li>)}</ul> : <p className="text-ink3">Every component is public.</p>}<p className="mt-2 text-[13px] text-ink3">Internal incidents: {data.incidents.filter((i) => !i.published).length}</p></Section>
          <Section title="Never published"><ul className="grid list-disc gap-1 pl-5 text-ink2"><li>Node ids, hostnames and IP addresses</li><li>Latency, heartbeat and capacity figures</li><li>Customer, order, job and service ids</li><li>Provider errors and internal notes</li></ul><Badge tone="good" className="mt-2">Enforced by the public-message check</Badge></Section>
        </div>
      </Columns>
      <PreviewNote />
    </AdminPage>
  );
}
