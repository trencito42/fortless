import { useState } from 'react';
import { Button, Card, CardHeader, Notice, StatusBadge, TextField } from '@/design-system';
import { PasskeyList, RecoveryCodes, SessionList, TwoFactorSetup } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { relative } from '../../format';

function Password() {
  const api = useApi();
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [er, setEr] = useState<Record<string, string>>({}); const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string }>();
  const submit = async () => { const e: Record<string, string> = {}; if (!cur) e.cur = 'Enter your current password.'; if (next.length < 12) e.next = 'Use at least 12 characters.'; if (next && next === cur) e.next = 'Choose a different password.'; setEr(e); setNote(undefined); if (Object.keys(e).length) return; try { await api.changePassword(cur, next); setCur(''); setNext(''); setNote({ tone: 'good', text: 'Password changed. Other sessions were revoked.' }); } catch (error) { setNote({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not change the password.' }); } };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Password" description="Changing it signs out your other devices." />
      <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid max-w-md gap-4">
        <TextField label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} error={er.cur} />
        <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={er.next} description="At least 12 characters." />
        {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
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
  const [enrol, setEnrol] = useState(false); const [enrolPassword, setEnrolPassword] = useState(''); const [mfa, setMfa] = useState<{ secret: string; uri: string }>(); const [mfaError, setMfaError] = useState<string>(); const [codes, setCodes] = useState<string[]>();
  const [stepUp, setStepUp] = useState(false); const [stepPassword, setStepPassword] = useState(''); const [stepCode, setStepCode] = useState('');
  const regenerate = async () => { setMfaError(undefined); try { await api.completeMfaStepUp(stepPassword, stepCode); setCodes(await api.regenerateRecoveryCodes()); setStepUp(false); setStepPassword(''); setStepCode(''); profile.reload(); } catch (error) { setMfaError(error instanceof Error ? error.message : 'Could not verify this session.'); } };
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
              {p.mfaEnabled ? <Button variant="secondary" onClick={() => { setMfaError(undefined); setStepUp(true); }}>Generate new recovery codes</Button> : <Button variant="primary" onClick={() => setEnrol(true)}>Set up authenticator</Button>}
              {p.mfaEnabled ? null : null}
            </div>
            {mfaError ? <Notice tone="bad">{mfaError}</Notice> : null}
            {stepUp ? <div className="grid max-w-sm gap-3"><Notice tone="warn">Confirm your password and current authenticator code. This sensitive action requires recent step-up verification.</Notice><TextField label="Current password" type="password" autoComplete="current-password" value={stepPassword} onChange={(event) => setStepPassword(event.target.value)} /><TextField label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" value={stepCode} onChange={(event) => setStepCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /><div><Button variant="secondary" disabled={!stepPassword || stepCode.length !== 6} onClick={() => void regenerate()}>Verify and generate</Button></div></div> : null}
            {enrol && !mfa ? <div className="grid max-w-sm gap-3"><TextField label="Current password" type="password" autoComplete="current-password" value={enrolPassword} onChange={(event) => setEnrolPassword(event.target.value)} /><div><Button variant="secondary" onClick={() => { setMfaError(undefined); api.beginMfaEnrollment(enrolPassword).then(setMfa, (error: Error) => setMfaError(error.message)); }}>Continue</Button></div></div> : null}
            {mfa ? <TwoFactorSetup qr={<div role="img" aria-label="Authenticator setup URI" className="grid size-40 place-items-center overflow-hidden rounded-md bg-s3 p-3 text-center text-[10px] font-semibold text-ink3"><span className="break-all">{mfa.uri}</span></div>} secret={mfa.secret} onVerify={async (code) => { const recovery = await api.confirmMfaEnrollment(code); setEnrol(false); setMfa(undefined); setEnrolPassword(''); setCodes(recovery); profile.reload(); }} /> : null}
            {codes ? <RecoveryCodes codes={codes} onRegenerate={async () => { setCodes(undefined); setStepUp(true); }} /> : null}
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
