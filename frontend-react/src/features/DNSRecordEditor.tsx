import { useState } from 'react';
import { ActionMenu, AlertDialog, Button, DataTable, Dialog, DialogClose, LoadingButton, Select, TextField, NumberField, StatusBadge, type ColumnDef } from '@/design-system';

export type DnsType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV';
export interface DnsRecord { id: string; type: DnsType; name: string; value: string; ttl: number; /** MX and SRV only (0 to 65535, lower is tried first) */ priority?: number; /** verified by the resolver */ propagated?: boolean }

const V4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\.?$/i;
export function validateRecord(r: Omit<DnsRecord, 'id'>): Partial<Record<'name' | 'value' | 'ttl' | 'priority', string>> {
  const e: Partial<Record<'name' | 'value' | 'ttl' | 'priority', string>> = {};
  if (!r.name.trim()) e.name = 'Use @ for the root domain or a subdomain like www.';
  if (!r.value.trim()) e.value = 'Enter a value.';
  else if (r.type === 'A' && !V4.test(r.value)) e.value = 'Enter an IPv4 address like 203.0.113.10.';
  else if (r.type === 'AAAA' && !r.value.includes(':')) e.value = 'Enter an IPv6 address.';
  else if ((r.type === 'CNAME' || r.type === 'MX') && !HOST.test(r.value)) e.value = 'Enter a hostname like mail.example.com.';
  if ((r.type === 'MX' || r.type === 'SRV') && (r.priority === undefined || !Number.isInteger(r.priority) || r.priority < 0 || r.priority > 65535)) e.priority = 'Priority is a whole number from 0 to 65535.';
  if (r.type === 'SRV' && r.value.trim() && !/^\d+ \d+ \S+$/.test(r.value.trim())) e.value = 'Use "weight port target", for example 5 25565 mc.example.com.';
  if (r.type === 'TXT' && r.value.length > 2048) e.value = 'TXT values are limited to 2048 characters.';
  if (r.ttl < 60 || r.ttl > 86400) e.ttl = 'TTL must be between 60 and 86400 seconds.';
  return e;
}

export interface DNSRecordEditorProps {
  domain: string;
  records: DnsRecord[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onSave: (record: Omit<DnsRecord, 'id'> & { id?: string }) => Promise<void>;
  onDelete: (record: DnsRecord) => Promise<void>;
}

function RecordDialog({ initial, open, onOpenChange, onSave }: { initial?: DnsRecord; open: boolean; onOpenChange: (o: boolean) => void; onSave: DNSRecordEditorProps['onSave'] }) {
  const [r, setR] = useState<Omit<DnsRecord, 'id'>>({ type: initial?.type ?? 'A', name: initial?.name ?? '', value: initial?.value ?? '', ttl: initial?.ttl ?? 3600, priority: initial?.priority });
  const [e, setE] = useState<ReturnType<typeof validateRecord>>({});
  const [fail, setFail] = useState<string | null>(null);
  const save = async () => {
    const found = validateRecord(r); setE(found);
    if (Object.keys(found).length) throw new Error('validation');
    setFail(null);
    try { await onSave({ ...r, id: initial?.id }); onOpenChange(false); } catch (x) { setFail(x instanceof Error ? x.message : 'Could not save the record.'); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? 'Edit record' : 'Add record'} footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" onClick={save} onError={() => {}}>Save record</LoadingButton></>}>
      <div className="grid gap-4">
        <Select label="Type" value={r.type} onValueChange={(t) => setR({ ...r, type: (t ?? 'A') as DnsType })} options={(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'] as DnsType[]).map((t) => ({ value: t, label: t }))} />
        <TextField label="Name" value={r.name} onChange={(x) => setR({ ...r, name: x.target.value })} error={e.name} />
        {r.type === 'MX' || r.type === 'SRV' ? <NumberField label="Priority" min={0} max={65535} step={1} value={r.priority ?? null} onValueChange={(v) => setR({ ...r, priority: v ?? undefined })} error={e.priority} /> : null}
        <TextField label="Value" description={r.type === 'SRV' ? 'weight port target' : undefined} value={r.value} onChange={(x) => setR({ ...r, value: x.target.value })} error={e.value} />
        <NumberField label="TTL" unit="s" min={60} max={86400} step={60} value={r.ttl} onValueChange={(v) => setR({ ...r, ttl: v ?? 3600 })} error={e.ttl} />
        {fail ? <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 font-semibold text-bad">{fail}</p> : null}
      </div>
    </Dialog>
  );
}

/** DNS record list with add/edit in a dialog. Validation mirrors the common record types; the provider remains the source of truth. */
export function DNSRecordEditor({ domain, records, loading, error, onRetry, onSave, onDelete }: DNSRecordEditorProps) {
  const [editing, setEditing] = useState<DnsRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DnsRecord | null>(null);
  const columns: ColumnDef<DnsRecord, unknown>[] = [
    { accessorKey: 'type', header: 'Type', cell: (c) => <b className="font-mono">{c.row.original.type}</b> },
    { accessorKey: 'name', header: 'Name', meta: { primary: true }, cell: (c) => <span className="font-mono">{c.row.original.name}</span> },
    { accessorKey: 'value', header: 'Value', cell: (c) => <span className="break-all font-mono text-[13px]">{c.row.original.value}</span> },
    { accessorKey: 'priority', header: 'Priority', meta: { numeric: true }, cell: (c) => c.row.original.priority ?? '—' },
    { accessorKey: 'ttl', header: 'TTL', meta: { numeric: true } },
    { id: 'state', header: 'Status', enableSorting: false, cell: (c) => (c.row.original.propagated === undefined ? '—' : <StatusBadge tone={c.row.original.propagated ? 'good' : 'warn'}>{c.row.original.propagated ? 'Live' : 'Propagating'}</StatusBadge>) },
    { id: 'a', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, cell: (c) => <ActionMenu label={`Actions for ${c.row.original.type} ${c.row.original.name}`} entries={[{ id: 'e', label: 'Edit', onSelect: () => setEditing(c.row.original) }, { id: 'd', label: 'Delete', tone: 'danger', onSelect: () => setDeleting(c.row.original) }]} /> },
  ];
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3"><p className="font-bold">{domain}</p><Button variant="primary" leadingIcon="add-01" onClick={() => setEditing('new')}>Add record</Button></div>
      <DataTable data={records} columns={columns} getRowId={(r) => r.id} caption={`DNS records for ${domain}`} loading={loading} error={error} onRetry={onRetry} empty={{ title: 'No DNS records', description: 'Add an A record to point this domain at your server.' }} />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} tone="danger" title={`Delete ${deleting?.type ?? ''} record?`} description={deleting ? `${deleting.name} → ${deleting.value} will stop resolving once DNS caches expire.` : ''} confirmLabel="Delete record" onConfirm={async () => { if (deleting) await onDelete(deleting); }} />
      {editing ? <RecordDialog key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} open onOpenChange={(o) => !o && setEditing(null)} onSave={onSave} /> : null}
    </div>
  );
}
