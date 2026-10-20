import { useState } from 'react';
import { Button, Card, CardHeader, LoadingButton, NumberField, Notice, Select, StatusBadge, Switch, TextField } from '@/design-system';
import { useOp } from '@/features';
import type { AdministrationMethod, GameAdministrationStatusDto } from '../contracts';
import { useService } from '../context';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';

const METHOD_LABEL: Record<AdministrationMethod, string> = { AUTOMATIC: 'Automatic', NATIVE_CONSOLE: 'Native console', RCON: 'RCON' };
const TONE = { CONNECTED: 'good', AVAILABLE: 'good', SETUP_REQUIRED: 'warn', DISABLED: 'warn', UNREACHABLE: 'bad', UNSUPPORTED: 'neutral' } as const;

function Form({ a, onChanged }: { a: GameAdministrationStatusDto; onChanged: () => void }) {
  const { id, ports, can } = useService();
  const op = useOp();
  const [method, setMethod] = useState<AdministrationMethod>(a.selectedMethod);
  const [port, setPort] = useState<number | null>(a.administrationPort);
  const [password, setPassword] = useState(''); const [sync, setSync] = useState(false); const [err, setErr] = useState<string>();
  const usesRcon = method === 'RCON' || (method === 'AUTOMATIC' && a.effectiveProtocol.endsWith('_RCON'));
  const editable = can('startup.update');
  const save = async () => {
    if (password && (password.length < 8 || password.length > 191)) { setErr('Use 8 to 191 characters.'); return; }
    setErr(undefined);
    await op.run('save', async () => { await ports.players.saveAdministration(id, { method, port, password: password || undefined, syncToServer: sync || undefined }); setPassword(''); onChanged(); }, 'Admin settings saved.');
  };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Game administration" description={a.message} actions={<StatusBadge tone={TONE[a.state]}>{a.state.toLowerCase().replace(/_/g, ' ')}</StatusBadge>} />
      {op.feedback}
      {!editable ? <Notice tone="info">Your access level can see this status but not change it.</Notice> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Select label="Connection method" options={a.supportedMethods.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} value={method} disabled={!editable} onValueChange={(v) => v && setMethod(v as AdministrationMethod)} />
        {usesRcon ? <NumberField label="Administration port" description="Must be one of this server's allocated ports." min={1} max={65535} value={port} disabled={!editable} onValueChange={setPort} /> : null}
        {usesRcon ? <TextField className="md:col-span-2" label="RCON password" type="password" autoComplete="new-password" disabled={!editable} value={password} error={err}
          description={a.credentialsConfigured ? 'Configured. Leave blank to keep the current password. It is stored encrypted and never shown again.' : 'Set a strong password. It is stored encrypted and never shown again.'} onChange={(e) => setPassword(e.target.value)} /> : <p className="text-[13.5px] text-ink3 md:col-span-2">RCON is not needed. This mode uses the authorized native console when the game supports it.</p>}
        {usesRcon ? <div className="md:col-span-2"><Switch label="Write supported changes to the game configuration" description="Updates the game's own config file so RCON is enabled with these values. Restart to apply." checked={sync} disabled={!editable} onCheckedChange={setSync} /></div> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <LoadingButton variant="primary" disabled={!editable} onClick={save}>Save admin settings</LoadingButton>
        {can('player.moderate') ? <Button variant="secondary" onClick={() => void op.run('test', async () => { await ports.players.testAdministration(id); onChanged(); }, 'Connection test finished.')}>Test connection</Button> : null}
        {editable ? <Button variant="secondary" onClick={() => void op.run('auto', async () => { await ports.players.autoConfigure(id, {}); onChanged(); }, 'Configured automatically.')}>Set up automatically</Button> : null}
      </div>
    </Card>
  );
}

export function AdministrationForm() {
  const { id, ports } = useService();
  const res = useResource((s) => ports.players.administration(id, s), [id, ports]);
  return <ResourceView res={res} reload={res.reload} label="Loading game administration">{(d) => <Form key={`${d.status.selectedMethod}-${d.status.administrationPort}-${d.status.credentialsConfigured}`} a={d.status} onChanged={res.refresh} />}</ResourceView>;
}
