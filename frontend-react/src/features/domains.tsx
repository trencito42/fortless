import { useState } from 'react';
import { Button, Card, CardHeader, LoadingButton, SearchField, StatusBadge } from '@/design-system';

export interface DomainResult { name: string; available: boolean; /** Pre-formatted by the registrar API, e.g. "€12.00 / year". */ price?: string; premium?: boolean }
/** WHMCS-style domain search. Availability and price come from the registrar; this never guesses either. */
export function DomainSearch({ onSearch, onSelect }: { onSearch: (q: string) => Promise<DomainResult[]>; onSelect: (d: DomainResult) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<DomainResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => { if (!q.trim()) return; setErr(null); try { setRes(await onSearch(q.trim())); } catch (e) { setErr(e instanceof Error ? e.message : 'Search failed. Try again.'); } };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Find a domain" />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <SearchField className="min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => { setQ(''); setRes(null); }} placeholder="yourname.com" />
        <LoadingButton type="submit" variant="primary" onClick={go}>Search</LoadingButton>
      </form>
      {err ? <p role="alert" className="rounded-md bg-bad-bg px-4 py-2.5 font-semibold text-bad">{err}</p> : null}
      {res && res.length === 0 ? <p className="text-ink3">No results.</p> : null}
      {res ? <ul className="grid gap-2" aria-live="polite">{res.map((d) => (
        <li key={d.name} className="flex flex-wrap items-center gap-3 rounded-md bg-s2 p-3"><b className="min-w-0 flex-1 break-all">{d.name}</b>
          <StatusBadge tone={d.available ? 'good' : 'neutral'}>{d.available ? 'Available' : 'Taken'}</StatusBadge>{d.premium ? <StatusBadge tone="violet" dot={false}>Premium</StatusBadge> : null}
          {d.available ? <><span className="font-bold">{d.price ?? ''}</span><Button size="sm" variant="primary" onClick={() => onSelect(d)}>Add</Button></> : null}</li>))}</ul> : null}
    </Card>
  );
}
