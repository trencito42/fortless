import { useState } from 'react';
import { Button, Card, CardHeader, Notice, StatusBadge, TextField } from '@/design-system';
import { PasskeyList, RecoveryCodes, SessionList, TwoFactorSetup } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { relative } from '../../format';

const CODES = ['k3f9-2mqa', 'x7ld-90pz', 'b81c-vn4t', 'q2we-7hyr', 'm5ts-0aux', 'z9jp-e3bd', 'c4rg-6lko', 'y1vn-8wqs'];

function Password() {
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [er, setEr] = useState<Record<string, string>>({}); const [ok, setOk] = useState(false);
  const submit = () => { const e: Record<string, string> = {}; if (!cur) e.cur = 'Enter your current password.'; if (next.length < 10) e.next = 'Use at least 10 characters.'; if (next && next === cur) e.next = 'Choose a password you have not used here.'; setEr(e); setOk(!Object.keys(e).length); if (!Object.keys(e).length) { setCur(''); setNext(''); } };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Password" description="Changing it signs out your other devices." />
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid max-w-md gap-4">
        <TextField label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} error={er.cur} />
        <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={er.next} description="At least 10 characters." />
        {ok ? <Notice tone="good">Password changed (simulated).</Notice> : null}
        <div><Button type="submit" variant="secondary">Change password</Button></div>
      </form>
    </Card>
  );
}

export default function Security() {
  const api = useApi();
  const profile = useApiQuery((a) => a.profile());
  const sessions = useApiQuery((a) => a.sessions());
  const passkeys = useApiQuery((a) => a.passkeys());
  const [enrol, setEnrol] = useState(false); const [codes, setCodes] = useState<string[]>();
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title="Security" description="Protect your account and everything billed to it." crumbs={[{ label: 'Account', to: '/app/account' }, { label: 'Security' }]} />
      <CapabilityNote area="account" />
      <Password />
      <ResourceView res={profile} reload={profile.reload} label="Loading security">
        {(p) => (
          <Card pad="lg" className="grid gap-4">
            <CardHeader title="Two-step verification" description="Ask for a code from your authenticator app at sign-in." actions={<StatusBadge tone={p.mfaEnabled ? 'good' : 'warn'}>{p.mfaEnabled ? 'On' : 'Off'}</StatusBadge>} />
            {p.mfaEnabled ? <p className="text-ink2">{p.recoveryCodesLeft} recovery codes left.</p> : null}
            <div className="flex flex-wrap gap-2">
              {p.mfaEnabled ? <Button variant="secondary" onClick={() => setCodes(CODES)}>Show new recovery codes</Button> : <Button variant="primary" onClick={() => setEnrol(true)}>Set up authenticator</Button>}
              {p.mfaEnabled ? null : null}
            </div>
            {enrol ? <TwoFactorSetup qr={<div role="img" aria-label="QR code placeholder" className="grid size-40 place-items-center rounded-md bg-s3 text-center text-[12px] font-semibold text-ink3">QR code<br />(prototype)</div>} secret="JBSW Y3DP EHPK 3PXP" onVerify={async (code) => { if (code !== '123456') throw new Error('That code is not valid. Demo code: 123456.'); await api.saveProfile({ mfaEnabled: true }); setEnrol(false); setCodes(CODES); }} /> : null}
            {codes ? <RecoveryCodes codes={codes} onRegenerate={async () => setCodes([...CODES].reverse())} /> : null}
          </Card>
        )}
      </ResourceView>
      <ResourceView res={passkeys} reload={passkeys.reload} label="Loading passkeys">
        {(list) => <PasskeyList passkeys={list.map((k) => ({ id: k.id, name: k.name, added: k.addedOn, lastUsed: k.lastUsed }))} onAdd={async () => { await api.addPasskey('This device'); }} onRemove={async (k) => api.removePasskey(k.id)} />}
      </ResourceView>
      <ResourceView res={sessions} reload={sessions.reload} label="Loading sessions">
        {(list) => <SessionList sessions={list.map((s) => ({ id: s.id, device: s.device, location: s.location, lastActive: relative(s.lastActive), current: s.current }))} onRevoke={async (s) => api.revokeSession(s.id)} onRevokeOthers={async () => { for (const s of list.filter((x) => !x.current)) await api.revokeSession(s.id); }} />}
      </ResourceView>
    </div>
  );
}
