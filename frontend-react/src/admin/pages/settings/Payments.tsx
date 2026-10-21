import { useState } from 'react';
import { Badge, Button, DescriptionList, Notice, Select, StatusBadge, Switch, TextField } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useSettings } from '../../hooks/useSettings';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { dateTime, iso, relative } from '../../lib/format';

export default function Payments() {
  const { values, save } = useSettings('payments');
  const { data } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const [desc, setDesc] = useState(values['descriptor'] ?? '');
  const [threeDs, setThreeDs] = useState(values['threeDs'] ?? 'automatic');
  const [card, setCard] = useState(values['methodCard'] === 'true');
  const [sepa, setSepa] = useState(values['methodSepa'] === 'true');
  const [checks, setChecks] = useState<Array<[string, boolean, string]> | null>(null);
  const dirty = desc !== values['descriptor'] || threeDs !== values['threeDs'] || card !== (values['methodCard'] === 'true') || sepa !== (values['methodSepa'] === 'true');
  const err = desc.length < 5 || desc.length > 22 || !/^[A-Z0-9 .*-]+$/.test(desc) ? 'Statement descriptor must be 5–22 characters: capital letters, digits, space, . * -' : undefined;
  const conn = data.connections.find((c) => c.id === 'conn_stripe')!;
  const lastEvent = data.webhooks.find((w) => w.provider === 'stripe');
  const verify = () => act.run({ title: 'Verify Stripe configuration', description: 'The server checks that the API key works, the webhook endpoint is registered and recent events verify. Keys are never sent to the browser.', confirmLabel: 'Run verification', permission: 'services:manage', stepUp: true, reasonRequired: false, effects: ['GET /v1/account with the server-side key', 'List webhook endpoints and compare the URL', 'Verify the signature of the latest stored event'], onConfirm: () => { setChecks([['API key accepted', true, 'Live mode, account restricted to the configured business'], ['Webhook endpoint registered', true, values['endpoint'] ?? ''], ['Signing secret matches latest event', !lastEvent || lastEvent.signatureVerified, lastEvent ? `${lastEvent.id}` : 'No event yet'], ['Unprocessed failed events', data.webhooks.filter((w) => w.status === 'failed').length === 0, `${data.webhooks.filter((w) => w.status === 'failed').length} failed event(s)`]]); save({ lastVerified: iso(0) }, 'settings.payments_verified'); return 'Verification finished (simulated)'; } });
  const submit = () => { if (err) return; act.run({ title: 'Save payment settings', confirmLabel: 'Save settings', permission: 'services:manage', stepUp: true, tone: 'danger', reasonRequired: true, description: 'Changes how customers pay. Turning off a method hides it at checkout; existing subscriptions are not changed.', onConfirm: ({ reason }) => { save({ descriptor: desc, threeDs, methodCard: String(card), methodSepa: String(sepa) }, 'settings.payments_updated', reason); } }); };
  return (
    <AdminPage title="Payments" description="Stripe connection, accepted methods and verification. Credentials are shown masked and can only be rotated on the server." actions={<><Button variant="secondary" leadingIcon="tick-02" disabled={!can('services:manage')} onClick={verify}>Verify…</Button><Button variant="primary" disabled={!dirty || !!err || !can('services:manage')} onClick={submit}>Save…</Button></>}>
      <Notice tone="info" title="Credentials are never shown or editable here">API keys and the webhook secret live in the server environment. To rotate one, update the environment on the server and restart; this page then shows the new masked reference.</Notice>
      <Columns>
        <Section title="Connection" actions={<StatusBadge tone={conn.health === 'connected' ? 'good' : 'warn'}>{conn.health}</StatusBadge>}><DescriptionList items={[{ label: 'Mode', value: <Badge tone="violet">{values['mode']}</Badge> }, { label: 'Publishable key', value: values['publishable'], mono: true }, { label: 'Secret key', value: values['secret'], mono: true }, { label: 'Webhook secret', value: values['webhookSecret'], mono: true }, { label: 'Webhook endpoint', value: values['endpoint'], mono: true, copy: values['endpoint'] }, { label: 'Last verified', value: values['lastVerified'] ? `${relative(values['lastVerified'])} (${dateTime(values['lastVerified'])})` : 'Not verified in this session' }, { label: 'Last Stripe event', value: lastEvent ? `${lastEvent.type} · ${relative(lastEvent.receivedAt)}` : '—' }]} /></Section>
        <Section title="Verification result">{checks ? <ul className="grid gap-2">{checks.map(([l, ok, d]) => <li key={l} className="flex items-start justify-between gap-2 rounded-md bg-s2 px-3 py-2.5"><span><b>{l}</b><span className="block text-[12.5px] text-ink3">{d}</span></span><Badge tone={ok ? 'good' : 'bad'}>{ok ? 'Pass' : 'Fail'}</Badge></li>)}</ul> : <p className="text-ink3">Run “Verify…” to check the connection. Results are simulated in this preview.</p>}</Section>
      </Columns>
      <Section title="Checkout"><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Switch label="Cards" checked={card} onCheckedChange={setCard} /><Switch label="SEPA Direct Debit" checked={sepa} onCheckedChange={setSepa} description="Flag checkout_sepa controls the rollout." /></div><div className="grid gap-4"><TextField label="Statement descriptor" value={desc} onChange={(e) => setDesc(e.target.value.toUpperCase())} error={err} description="Shown on the customer’s bank statement." /><Select label="3-D Secure" value={threeDs} onValueChange={(v) => setThreeDs(v ?? 'automatic')} options={[{ value: 'automatic', label: 'Automatic (when the issuer requires)' }, { value: 'required', label: 'Always require' }]} /></div></div></Section>
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
