import { useState } from 'react';
import { Button, EmptyState, Textarea } from '@/design-system';
import type { Note } from '../types';
import { dateTime } from '../lib/format';
import { useSession } from '../session';
import type { StaffPermission } from '../types';

/** Internal staff notes: never shown to customers. Adding one writes demo data only. */
export function NotesPanel({ notes, onAdd, permission = 'accounts:manage', label = 'Internal note' }: { notes: Note[]; onAdd: (body: string) => void; permission?: StaffPermission; label?: string }) {
  const { can } = useSession();
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string>();
  const allowed = can(permission);
  return (
    <div className="grid gap-4">
      <p className="text-[13px] font-semibold text-ink3">Visible to staff only. Customers never see these notes.</p>
      {notes.length === 0 ? <EmptyState icon="note-01" title="No internal notes" description="Notes help the next person who opens this record." /> : (
        <ul className="grid gap-2" aria-label="Internal notes">{notes.map((n) => <li key={n.id} className="rounded-lg bg-s2 p-3.5"><div className="flex flex-wrap justify-between gap-2 text-[13px] font-semibold text-ink3"><span className="text-ink2">{n.author}</span><time dateTime={n.at}>{dateTime(n.at)}</time></div><p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{n.body}</p></li>)}</ul>
      )}
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (body.trim().length < 3) { setErr('Write at least 3 characters.'); return; } setErr(undefined); onAdd(body.trim()); setBody(''); }}>
        <Textarea label={label} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} counter disabled={!allowed} error={err} description={allowed ? 'Do not paste passwords, tokens or card numbers.' : `Your role lacks ${permission}.`} />
        <div><Button type="submit" variant="primary" size="sm" disabled={!allowed}>Add note</Button></div>
      </form>
    </div>
  );
}
