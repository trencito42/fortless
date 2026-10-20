import { useState } from 'react';
import { ActionMenu, AlertDialog, DestructiveAction, Select, Button, Card, CardHeader, Checkbox, DataTable, EmptyState, LoadingButton, StatusBadge, TextField, Dialog, DialogClose, type ColumnDef } from '@/design-system';

export interface PaymentMethod { id: string; brand: string; last4: string; expires: string; isDefault: boolean; expired?: boolean }
/** Stripe-style saved cards. Card entry itself must use the provider's hosted fields; this only lists and manages saved methods. */
export function PaymentMethodList({ methods, onAdd, onMakeDefault, onRemove }: { methods: PaymentMethod[]; onAdd: () => void | Promise<void>; onMakeDefault: (m: PaymentMethod) => Promise<void>; onRemove: (m: PaymentMethod) => Promise<void> }) {
  const [removing, setRemoving] = useState<PaymentMethod | null>(null);
  return (
    <Card pad="lg" className="grid gap-4">
      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)} tone="danger" title={`Remove card ending ${removing?.last4 ?? ''}?`} description="Renewals that use this card will need another payment method." confirmLabel="Remove card" onConfirm={async () => { if (removing) await onRemove(removing); }} />
      <CardHeader title="Payment methods" actions={<LoadingButton variant="secondary" leadingIcon="add-01" onClick={onAdd}>Add card</LoadingButton>} />
      {methods.length === 0 ? <EmptyState icon="credit-card" title="No saved cards" description="Add a card to renew automatically." /> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{methods.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-md bg-s2 p-3">
            <span className="grid size-10 place-items-center rounded-md bg-s3 text-[11px] font-extrabold uppercase">{m.brand.slice(0, 4)}</span>
            <div className="min-w-0 flex-1"><p className="font-bold">{m.brand} ending {m.last4}</p><p className="text-[13px] text-ink3">Expires {m.expires}</p></div>
            {m.isDefault ? <StatusBadge tone="accent" dot={false}>Default</StatusBadge> : null}
            {m.expired ? <StatusBadge tone="bad">Expired</StatusBadge> : null}
            <ActionMenu label={`Actions for card ${m.last4}`} entries={[{ id: 'd', label: 'Make default', disabled: m.isDefault || m.expired, onSelect: () => void onMakeDefault(m) }, { id: 'x', label: 'Remove', tone: 'danger', disabled: m.isDefault, disabledReason: 'Choose another default first', onSelect: () => setRemoving(m) }]} />
          </li>))}</ul>
      )}
    </Card>
  );
}

export interface ApiKey { id: string; name: string; prefix: string; created: string; lastUsed?: string; expires?: string }
const EXPIRY = [{ value: 'never', label: 'Never expires' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }];
export function ApiKeyManager({ keys, onCreate, onRevoke }: { keys: ApiKey[]; onCreate: (name: string, opts: { expiresInDays: number | null }) => Promise<{ secret: string }>; onRevoke: (k: ApiKey) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('never');
  const [secret, setSecret] = useState<string | null>(null);
  const columns: ColumnDef<ApiKey, unknown>[] = [
    { accessorKey: 'name', header: 'Name', meta: { primary: true } },
    { accessorKey: 'prefix', header: 'Key', cell: (c) => <code className="font-mono">{c.row.original.prefix}…</code> },
    { accessorKey: 'created', header: 'Created' },
    { accessorKey: 'lastUsed', header: 'Last used', cell: (c) => c.row.original.lastUsed ?? 'Never' },
    { accessorKey: 'expires', header: 'Expires', cell: (c) => c.row.original.expires ?? 'Never' },
    { id: 'a', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, cell: (c) => <DestructiveAction size="sm" aria-label={`Revoke key ${c.row.original.name}`} title={`Revoke ${c.row.original.name}?`} description="Anything using this key stops working immediately. This cannot be undone." confirmLabel="Revoke key" onConfirm={() => onRevoke(c.row.original)}>Revoke</DestructiveAction> },
  ];
  return (
    <div className="grid gap-3">
      <div className="flex justify-end"><Button variant="primary" leadingIcon="add-01" onClick={() => { setSecret(null); setName(''); setExpiry('never'); setOpen(true); }}>Create key</Button></div>
      <DataTable data={keys} columns={columns} getRowId={(k) => k.id} caption="API keys" empty={{ title: 'No API keys', description: 'Create a key to call the API from scripts.' }} />
      <Dialog open={open} onOpenChange={setOpen} title={secret ? 'Copy your key now' : 'Create API key'} description={secret ? 'It is shown only once.' : undefined}
        footer={secret ? <DialogClose render={<Button variant="primary">Done</Button>} /> : <><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" onClick={async () => { const r = await onCreate(name, { expiresInDays: expiry === 'never' ? null : Number(expiry) }); setSecret(r.secret); }}>Create key</LoadingButton></>}>
        {secret ? <code className="block rounded-md bg-s2 p-3 font-mono break-all">{secret}</code> : <div className="grid gap-4"><TextField label="Name" description="For example: CI deploy" value={name} onChange={(e) => setName(e.target.value)} /><Select label="Expiry" value={expiry} onValueChange={(v) => setExpiry(v ?? 'never')} options={EXPIRY} /></div>}
      </Dialog>
    </div>
  );
}

export interface Member { id: string; name: string; email: string; role: string; permissions: string[]; pending?: boolean }
export interface PermissionGroup { id: string; label: string; permissions: { id: string; label: string }[] }
/** Team and Pterodactyl-style subuser permissions: members list plus a permission editor dialog. */
export function TeamMembers({ members, groups, onSavePermissions, onRemove, onInvite, onInviteMember }: { members: Member[]; groups: PermissionGroup[]; onSavePermissions: (m: Member, perms: string[]) => Promise<void>; onRemove: (m: Member) => Promise<void>; onInvite?: () => void; onInviteMember?: (email: string, permissions: string[]) => Promise<void> }) {
  const [edit, setEdit] = useState<Member | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [invPerms, setInvPerms] = useState<string[]>([]);
  const emailError = email && !/^\S+@\S+\.\S+$/.test(email) ? 'Enter a valid email address' : undefined;
  const columns: ColumnDef<Member, unknown>[] = [
    { accessorKey: 'name', header: 'Member', meta: { primary: true }, cell: (c) => <span><b>{c.row.original.name}</b><br /><span className="text-[13px] text-ink3">{c.row.original.email}</span></span> },
    { accessorKey: 'role', header: 'Role', cell: (c) => <span className="inline-flex gap-1.5">{c.row.original.role}{c.row.original.pending ? <StatusBadge tone="warn">Invited</StatusBadge> : null}</span> },
    { id: 'p', header: 'Permissions', accessorFn: (m) => m.permissions.length, meta: { numeric: true } },
    { id: 'a', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, cell: (c) => <ActionMenu label={`Actions for ${c.row.original.name}`} entries={[{ id: 'e', label: 'Edit permissions', onSelect: () => { setEdit(c.row.original); setPerms(c.row.original.permissions); } }, { id: 'x', label: 'Remove', tone: 'danger', onSelect: () => setRemoving(c.row.original) }]} /> },
  ];
  return (
    <div className="grid gap-3">
      {onInvite || onInviteMember ? <div className="flex justify-end"><Button variant="primary" leadingIcon="user-add-01" onClick={() => { if (onInviteMember) { setEmail(''); setInvPerms([]); setInviting(true); } else onInvite?.(); }}>Invite member</Button></div> : null}
      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)} tone="danger" title={`Remove ${removing?.name ?? ''}?`} description="They lose access right away. You can invite them again later." confirmLabel="Remove member" onConfirm={async () => { if (removing) await onRemove(removing); }} />
      {inviting ? (
        <Dialog open onOpenChange={(o) => !o && setInviting(false)} title="Invite a member" description="They get an email with a link to accept." size="lg" footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" disabled={!email || !!emailError} onClick={async () => { await onInviteMember?.(email, invPerms); setInviting(false); }}>Send invitation</LoadingButton></>}>
          <div className="grid gap-5">
            <TextField label="Email" type="email" value={email} error={emailError} onChange={(e) => setEmail(e.target.value)} />
            {groups.map((g) => (
              <fieldset key={g.id} className="grid gap-1.5"><legend className="mb-1 font-extrabold">{g.label}</legend>
                {g.permissions.map((p) => <Checkbox key={p.id} label={p.label} checked={invPerms.includes(p.id)} onCheckedChange={(v) => setInvPerms((l) => (v ? [...l, p.id] : l.filter((x) => x !== p.id)))} />)}
              </fieldset>))}
          </div>
        </Dialog>
      ) : null}
      <DataTable data={members} columns={columns} getRowId={(m) => m.id} caption="Team members" empty={{ title: 'Just you for now', description: 'Invite someone to share access.' }} />
      {edit ? (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)} title={`Permissions for ${edit.name}`} size="lg" footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" onClick={async () => { await onSavePermissions(edit, perms); setEdit(null); }}>Save permissions</LoadingButton></>}>
          <div className="grid gap-5">{groups.map((g) => (
            <fieldset key={g.id} className="grid gap-1.5"><legend className="mb-1 font-extrabold">{g.label}</legend>
              {g.permissions.map((p) => <Checkbox key={p.id} label={p.label} checked={perms.includes(p.id)} onCheckedChange={(v) => setPerms((l) => (v ? [...l, p.id] : l.filter((x) => x !== p.id)))} />)}
            </fieldset>))}</div>
        </Dialog>
      ) : null}
    </div>
  );
}
