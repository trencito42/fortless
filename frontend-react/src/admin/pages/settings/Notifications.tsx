import { useState } from 'react';
import { Button, Notice, Select, Switch } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { PreviewNote, Unsupported } from '../../components/PreviewNote';
import { useSettings } from '../../hooks/useSettings';
import { useSession } from '../../session';

const EVENTS: Array<[string, string, string]> = [['critical', 'Critical Action Center items', 'Failed provisioning, unreconciled payments, urgent tickets'], ['payments', 'Payment problems', 'Failed webhooks, disputes, failed renewals'], ['security', 'Security events', 'Suspicious sign-ins, staff without MFA, denied step-up'], ['support', 'Support queue', 'New unassigned tickets, SLA about to breach'], ['infra', 'Infrastructure', 'Node degraded, capacity above 90%, worker stalled']];
const CHANNELS: Array<[string, string, boolean]> = [['email', 'Email', true], ['inapp', 'In-app', true], ['push', 'Push / SMS', false]];

export default function Notifications() {
  const { values, save } = useSettings('notifications');
  const { can } = useSession();
  const [v, setV] = useState(values);
  const dirty = JSON.stringify(v) !== JSON.stringify(values);
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const off = EVENTS.filter(([k]) => CHANNELS.every(([c]) => v[`${k}.${c}`] !== 'true'));
  return (
    <AdminPage title="Notifications" description="How staff hear about problems. These are routing preferences for the platform’s alerts; each person can still mute their own in-app bell." actions={<><Button variant="ghost" disabled={!dirty} onClick={() => setV(values)}>Discard</Button><Button variant="primary" disabled={!dirty || !can('admin:access')} onClick={() => save(v)}>Save</Button></>}>
      {off.length ? <Notice tone="warn" title="Some alerts have no channel">{off.map(([, l]) => l).join(', ')} would be silent. Pick at least one channel.</Notice> : null}
      <Section title="Alert routing"><div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-left"><caption className="sr-only">Alert types and delivery channels</caption><thead><tr className="text-ink3"><th scope="col" className="py-2 pr-3 text-[12.5px] font-bold">Alert</th>{CHANNELS.map(([, l]) => <th key={l} scope="col" className="px-3 py-2 text-center text-[12.5px] font-bold">{l}</th>)}</tr></thead><tbody>{EVENTS.map(([k, l, d]) => <tr key={k} className="odd:bg-s2/50"><th scope="row" className="py-3 pr-3 pl-2"><span className="block">{l}</span><span className="block text-[12.5px] font-medium text-ink3">{d}</span></th>{CHANNELS.map(([c, cl, ok]) => <td key={c} className="px-3 py-3 text-center"><div className="inline-block"><Switch hideLabel label={`${l} by ${cl}`} checked={v[`${k}.${c}`] === 'true'} disabled={!ok} onCheckedChange={(x) => set(`${k}.${c}`, String(x))} /></div></td>)}</tr>)}</tbody></table></div></Section>
      <Unsupported title="Push and SMS are not available">No push or SMS provider is connected, so those channels are disabled instead of pretending to deliver.</Unsupported>
      <Section title="Delivery"><div className="grid gap-4 sm:grid-cols-2"><Select label="Email digest" value={v['digest']} onValueChange={(x) => set('digest', x ?? 'daily')} options={[{ value: 'off', label: 'No digest' }, { value: 'daily', label: 'Daily summary' }, { value: 'weekly', label: 'Weekly summary' }]} /><div className="self-end"><Switch label="Quiet hours (22:00–07:00 UTC)" checked={v['quietHours'] === 'true'} onCheckedChange={(x) => set('quietHours', String(x))} description="Critical items still alert." /></div></div></Section>
      <PreviewNote />
    </AdminPage>
  );
}
