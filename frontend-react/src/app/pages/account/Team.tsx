import { useState } from 'react';
import { Button, Dialog, Notice, Select, TextField } from '@/design-system';
import { TeamMembers, type PermissionGroup } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import type { TeamMemberRecord } from '../../domain/types';

const GROUPS: PermissionGroup[] = [
  { id: 'services', label: 'Services', permissions: [{ id: 'service.read', label: 'View services' }, { id: 'service.control', label: 'Start, stop and restart' }, { id: 'files.write', label: 'Edit files' }, { id: 'backups.create', label: 'Create backups' }] },
  { id: 'billing', label: 'Billing', permissions: [{ id: 'billing.read', label: 'View invoices' }, { id: 'billing.pay', label: 'Pay invoices' }] },
  { id: 'support', label: 'Support', permissions: [{ id: 'support.read', label: 'Read tickets' }, { id: 'support.write', label: 'Reply to tickets' }] },
];

export default function Team() {
  const api = useApi();
  const res = useApiQuery((a) => a.team());
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [role, setRole] = useState<string | null>('developer'); const [err, setErr] = useState<string>(); const [note, setNote] = useState<{ tone: 'good' | 'warn'; text: string }>();
  return (
    <div className="grid max-w-4xl gap-5">
      <PageHeader title="Team" description="People who can work on this account, with exactly the access you give them." crumbs={[{ label: 'Account', to: '/app/account' }, { label: 'Team' }]} actions={<Button variant="primary" leadingIcon="user-add-01" onClick={() => { setEmail(''); setErr(undefined); setOpen(true); }}>Invite member</Button>} />
      <CapabilityNote area="account" />
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <ResourceView res={res} reload={res.reload} label="Loading team">
        {(list: TeamMemberRecord[]) => <TeamMembers members={list.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, permissions: m.permissions, pending: m.status === 'invited' }))} groups={GROUPS} onSavePermissions={async () => { setNote({ tone: 'warn', text: 'Fine-grained permission changes are not exposed by the account API. No changes were saved.' }); }} onRemove={async (m) => api.removeMember(m.id)} onInvite={() => setOpen(true)} />}
      </ResourceView>
      <Dialog open={open} onOpenChange={setOpen} title="Invite a team member" description="They receive an email and choose their own password."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { setErr(undefined); api.inviteMember(email.trim(), (role ?? 'viewer') as TeamMemberRecord['role']).then(() => { setOpen(false); setNote({ tone: 'good', text: `Invitation sent to ${email.trim()}.` }); }, (e: Error) => setErr(e.message)); }}>Send invitation</Button></>}>
        <div className="grid gap-4">
          <TextField label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={err} />
          <Select label="Role" value={role} onValueChange={setRole} options={[{ value: 'admin', label: 'Technical admin', description: 'Manage services and technical settings' }, { value: 'billing', label: 'Billing manager', description: 'Invoices and billing' }, { value: 'viewer', label: 'Viewer', description: 'Read only' }]} />
        </div>
      </Dialog>
    </div>
  );
}
