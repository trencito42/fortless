import { useState } from 'react';
import { ActionMenu, Button, Card, CardHeader, CopyButton, Dialog, DialogClose, EmptyState, LoadingButton, StatusBadge, TextField } from '@/design-system';
import { useOp, type OpResult } from './ops';

export interface Allocation { id: number; ip: string; alias: string | null; port: number; notes: string; primary: boolean }
export interface NetworkPermissions { create: boolean; update: boolean; delete: boolean }

export interface NetworkAllocationsProps {
  allocations: Allocation[];
  permissions: NetworkPermissions;
  onAssign: () => Promise<OpResult>;
  onSaveNotes: (a: Allocation, notes: string) => Promise<OpResult>;
  onSetPrimary: (a: Allocation) => Promise<OpResult>;
  onRemove: (a: Allocation) => Promise<OpResult>;
}

/** IP and port allocations of the server. The primary one is the address players connect to and cannot be removed. */
export function NetworkAllocations({ allocations, permissions, onAssign, onSaveNotes, onSetPrimary, onRemove }: NetworkAllocationsProps) {
  const op = useOp();
  const [edit, setEdit] = useState<Allocation | null>(null); const [notes, setNotes] = useState('');
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Network" description="Addresses and ports assigned to this server." actions={permissions.create ? <LoadingButton variant="primary" leadingIcon="add-01" onClick={() => op.run('assign', onAssign, 'Allocation requested.').then(() => undefined)}>Add allocation</LoadingButton> : undefined} />
      {op.feedback}
      {allocations.length === 0 ? <EmptyState icon="globe-02" title="No allocations" description="This server has no address assigned yet." /> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{allocations.map((a) => {
          const address = `${a.alias || a.ip}:${a.port}`;
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-md bg-s2 p-3">
              <div className="min-w-0 flex-1"><p className="flex items-center gap-2 font-mono font-bold"><span className="truncate">{address}</span><CopyButton value={address} label={`Copy ${address}`} /></p><p className="text-[13px] text-ink3">{a.notes || 'No notes'}</p></div>
              {a.primary ? <StatusBadge tone="good" dot={false}>Primary</StatusBadge> : null}
              {permissions.update || permissions.delete ? <ActionMenu label={`Actions for ${address}`} entries={[
                ...(permissions.update ? [{ id: 'n', label: 'Edit notes', onSelect: () => { setNotes(a.notes); setEdit(a); } }, { id: 'p', label: 'Make primary', disabled: a.primary, disabledReason: 'Already primary', onSelect: () => void op.run('primary', () => onSetPrimary(a), `${address} is now the primary address.`) }] : []),
                ...(permissions.delete ? [{ kind: 'separator' as const, id: 's' }, { id: 'd', label: 'Remove', tone: 'danger' as const, disabled: a.primary, disabledReason: 'The primary allocation cannot be removed', onSelect: () => void op.run('remove', () => onRemove(a), `${address} removed.`) }] : []),
              ]} /> : null}
            </li>);
        })}</ul>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Edit notes" description={edit ? `${edit.alias || edit.ip}:${edit.port}` : undefined}
        footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" onClick={async () => { const a = edit; if (!a) return; if (await op.run('notes', () => onSaveNotes(a, notes), 'Notes saved.')) setEdit(null); }}>Save notes</LoadingButton></>}>
        <TextField label="Notes" value={notes} maxLength={191} onChange={(e) => setNotes(e.target.value)} />
      </Dialog>
    </Card>
  );
}
