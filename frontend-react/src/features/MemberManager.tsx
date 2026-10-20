import { useState } from 'react';
import { ActionMenu, Button, Card, CardHeader, EmptyState, LoadingButton, Select, StatusBadge, TextField } from '@/design-system';
import { useOp, type OpResult } from './ops';

export type MemberPreset = 'viewer' | 'operator' | 'admin';
export interface ServiceMember { id: string; name: string; email: string; preset: MemberPreset }
export interface ServiceInvitation { id: string; email: string; preset: MemberPreset; expires: string }

export interface MemberManagerProps {
  members: ServiceMember[];
  invitations: ServiceInvitation[];
  onInvite: (email: string, preset: MemberPreset) => Promise<OpResult>;
  onRevoke: (i: ServiceInvitation) => Promise<OpResult>;
  onRemove: (m: ServiceMember) => Promise<OpResult>;
  onSetPreset: (m: ServiceMember, preset: MemberPreset) => Promise<OpResult>;
}

export const PRESET_INFO: Record<MemberPreset, { label: string; summary: string }> = {
  viewer: { label: 'Viewer', summary: 'Can watch the console output and browse files, backups and settings. Cannot send commands or read file contents.' },
  operator: { label: 'Operator', summary: 'Can start, stop and restart, use the console, edit files, create backups and moderate players.' },
  admin: { label: 'Admin', summary: 'Everything an operator can do, plus startup, settings, databases, schedules, network and backup restore.' },
};
const OPTIONS = (Object.keys(PRESET_INFO) as MemberPreset[]).map((v) => ({ value: v, label: PRESET_INFO[v].label }));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shares one server with other people. Each person signs in with their own account and gets one of three access levels. Owner only. */
export function MemberManager({ members, invitations, onInvite, onRevoke, onRemove, onSetPreset }: MemberManagerProps) {
  const op = useOp();
  const [email, setEmail] = useState(''); const [preset, setPreset] = useState<MemberPreset>('viewer'); const [err, setErr] = useState<string>();
  const invite = async () => {
    const v = email.trim().toLowerCase();
    if (!EMAIL.test(v)) { setErr('Enter a valid email address.'); return; }
    setErr(undefined);
    if (await op.run('invite', () => onInvite(v, preset), `Invitation sent to ${v}.`)) setEmail('');
  };
  return (
    <div className="grid gap-4">
      <Card pad="lg" className="grid gap-4">
        <CardHeader title="Share this server" description="Invite someone by email. They need a Fortless account to accept." />
        <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto]">
          <TextField label="Email" type="email" value={email} error={err} onChange={(e) => setEmail(e.target.value)} />
          <Select label="Access level" options={OPTIONS} value={preset} onValueChange={(v) => v && setPreset(v as MemberPreset)} />
          <div className="md:pt-[26px]"><LoadingButton variant="primary" onClick={invite}>Send invitation</LoadingButton></div>
        </div>
        <p className="text-[13.5px] text-ink3">{PRESET_INFO[preset].summary}</p>
        {op.feedback}
      </Card>
      <Card pad="lg" className="grid gap-3">
        <CardHeader title="People with access" description={`${members.length} ${members.length === 1 ? 'person' : 'people'}`} />
        {members.length === 0 ? <EmptyState icon="user-group" title="Only you" description="Invite someone to share this server." /> : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-md bg-s2 p-3">
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{m.name}</p><p className="truncate text-[13px] text-ink3">{m.email}</p></div>
              <div className="w-40"><Select label={`Access for ${m.name}`} hideLabel size="sm" options={OPTIONS} value={m.preset} onValueChange={(v) => { if (v && v !== m.preset) void op.run('preset', () => onSetPreset(m, v as MemberPreset), `${m.name} is now ${PRESET_INFO[v as MemberPreset].label.toLowerCase()}.`); }} /></div>
              <ActionMenu label={`Actions for ${m.name}`} entries={[{ id: 'rm', label: 'Remove access', tone: 'danger', onSelect: () => void op.run('remove', () => onRemove(m), `${m.name} no longer has access.`) }]} />
            </li>))}</ul>
        )}
      </Card>
      {invitations.length ? (
        <Card pad="lg" className="grid gap-3">
          <CardHeader title="Pending invitations" />
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{invitations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-md bg-s2 p-3">
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{i.email}</p><p className="text-[13px] text-ink3">Expires {i.expires}</p></div>
              <StatusBadge tone="warn" dot={false}>{PRESET_INFO[i.preset].label}</StatusBadge>
              <Button size="sm" variant="secondary" onClick={() => void op.run('revoke', () => onRevoke(i), 'Invitation revoked.')}>Revoke</Button>
            </li>))}</ul>
        </Card>
      ) : null}
    </div>
  );
}
