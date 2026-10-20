import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog, Icon, type IconName } from '@/design-system';
import { Link, useRouter } from '@/app/router';
import { cn } from '@/lib/utils/cn';
import { SiteButton, StatusDot } from './ui';
import { topicById, type DemoKind } from './topics';

interface Ctx { open: (id: string) => void }
const TopicCtx = createContext<Ctx>({ open: () => undefined });
export const useTopic = () => useContext(TopicCtx);

/** Owns the one open modal. Anything on the site can call `useTopic().open('games')`. Closes itself on navigation. */
export function TopicProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const { path } = useRouter();
  useEffect(() => setId(null), [path]);
  const ctx = useMemo(() => ({ open: setId }), []);
  const t = id ? topicById(id) : undefined;
  return (
    <TopicCtx.Provider value={ctx}>
      {children}
      <Dialog open={!!t} onOpenChange={(o) => { if (!o) setId(null); }} title={t?.title ?? ''} size="lg" hideClose={false} className="topic-dialog md:!rounded-[32px]"
        footer={t ? <div className="flex flex-wrap gap-2">{t.cta ? <SiteButton to={t.cta.to} icon="arrow-up-right-01">{t.cta.label}</SiteButton> : null}<SiteButton variant="soft" onClick={() => setId(null)}>Close</SiteButton></div> : undefined}>
        {t ? (
          <div className="grid gap-5 pb-2">
            <div className="flex items-start gap-4">
              <span className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', t.tone)}><Icon name={t.icon} size={28} /></span>
              <p className="pt-1 text-[18px] leading-snug text-ink2">{t.blurb}</p>
            </div>
            <div className="rounded-[24px] bg-s2 p-3 sm:p-4"><Demo kind={t.demo} /></div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {t.points.map((p) => <li key={p} className="flex items-center gap-3 rounded-2xl bg-s2 px-4 py-3 text-[15px] font-bold"><Icon name="checkmark-circle-02" size={20} className="shrink-0 text-good" />{p}</li>)}
            </ul>
            {t.links?.length ? (
              <div className="grid gap-2">
                {t.links.map((l) => (
                  <Link key={l.to} to={l.to} className="group flex items-center justify-between gap-3 rounded-2xl bg-night px-5 py-4 text-[17px] font-extrabold text-night-ink outline-none transition-[transform,background-color] duration-300 ease-spring hover:-translate-y-0.5 hover:bg-night2 focus-visible:ring-2 focus-visible:ring-accent">
                    {l.label}<span className="grid size-9 place-items-center rounded-full bg-lime text-lime-ink transition-transform duration-300 ease-spring group-hover:rotate-45"><Icon name="arrow-up-right-01" size={18} /></span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </TopicCtx.Provider>
  );
}

/* ---------- Demos: small, simulated in the browser, nothing is connected ---------- */

const mono = 'font-mono text-[12.5px] leading-relaxed';
const stamp = () => new Date().toLocaleTimeString('en-GB');

function ConsoleDemo() {
  const [lines, setLines] = useState<[string, string][]>([['dim', 'Starting server instance'], ['dim', 'Loading configuration'], ['ok', 'Server started successfully'], ['', '> Ready for connections']]);
  const [cmd, setCmd] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: 9999 }); }, [lines]);
  const run = (e: React.FormEvent) => {
    e.preventDefault();
    const c = cmd.trim(); if (!c) return;
    const out: Record<string, [string, string]> = { help: ['', 'Try: status, list, say hello, restart'], status: ['ok', 'Online · 4 players · 39% CPU'], list: ['', 'Players: Ana, Mihai, Dan, Ioana'], restart: ['warn', 'Restarting… back online in a moment'] };
    const a = c.startsWith('say ') ? ['', `[Server] ${c.slice(4)}`] as [string, string] : out[c] ?? ['bad', `Unknown command: ${c}. Type help.`];
    setLines((l) => [...l, ['dim', `> ${c}`], a]); setCmd('');
  };
  const tone = (t: string) => ({ ok: 'text-con-ok', warn: 'text-con-warn', bad: 'text-con-bad', dim: 'text-con-dim' }[t] ?? 'text-con-ink');
  return (
    <div className="overflow-hidden rounded-2xl bg-con p-4">
      <div ref={box} role="log" aria-label="Console output" className={cn('max-h-36 min-h-24 overflow-y-auto', mono)}>
        {lines.map(([t, l], i) => <p key={i} className={tone(t)}>{t === 'dim' || t === 'ok' ? `[${stamp()}] ` : ''}{l}</p>)}
      </div>
      <form onSubmit={run} className="mt-2 flex items-center gap-2 rounded-xl bg-white/5 px-3"><span aria-hidden="true" className="text-con-dim">&gt;</span>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} aria-label="Console command" placeholder="Type help" className="h-10 w-full bg-transparent font-mono text-[13px] text-con-ink outline-none placeholder:text-con-dim" /></form>
    </div>
  );
}

function BotDemo() {
  const [on, setOn] = useState(true); const [n, setN] = useState(0);
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-s1 p-4">
      <span className="relative grid size-14 place-items-center rounded-full bg-violet-bg text-violet"><Icon name="discord" size={26} /><span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-s1"><StatusDot tone={on ? 'good' : 'idle'} live={on} /></span></span>
      <div className="min-w-0 flex-1"><p className="text-[17px] font-extrabold">community-bot</p><p className="text-[13px] text-ink2">{on ? `Online · ${38 + (n % 3)} ms · restarted ${n}×` : 'Offline'}</p></div>
      <SiteButton variant={on ? 'soft' : 'brand'} onClick={() => setOn((v) => !v)}>{on ? 'Stop' : 'Start'}</SiteButton>
      <SiteButton variant="soft" onClick={() => { setOn(true); setN((v) => v + 1); }}>Restart</SiteButton>
    </div>
  );
}

function AppDemo() {
  const [log, setLog] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const deploy = () => {
    if (busy) return; setBusy(true); setLog([]);
    ['$ npm install', 'added 142 packages', '$ npm start', '✓ Listening on port 3000'].forEach((l, i) => setTimeout(() => { setLog((x) => [...x, l]); if (i === 3) setBusy(false); }, 450 * (i + 1)));
  };
  return (
    <div className="grid gap-3"><div className={cn('min-h-24 rounded-2xl bg-con p-4', mono)} aria-live="polite">{log.length ? log.map((l, i) => <p key={i} className={l.startsWith('✓') ? 'text-con-ok' : 'text-con-ink'}>{l}</p>) : <p className="text-con-dim">Press deploy to see the log.</p>}</div>
      <div><SiteButton onClick={deploy}>{busy ? 'Deploying…' : 'Deploy'}</SiteButton></div></div>
  );
}

function DnsDemo() {
  const [rows, setRows] = useState([['A', '@', '203.0.113.10'], ['CNAME', 'www', 'yourname.example']]);
  return (
    <div className="grid gap-3 rounded-2xl bg-s1 p-4">
      <ul className={cn('grid gap-2', mono)}>{rows.map(([t, n, v], i) => <li key={i} className="site-pop flex items-center gap-3"><span className="w-14 font-bold">{t}</span><span className="w-12 text-ink2">{n}</span><span className="min-w-0 flex-1 truncate text-ink2">{v}</span></li>)}</ul>
      <div><SiteButton variant="soft" onClick={() => setRows((r) => (r.length < 5 ? [...r, ['TXT', '@', `verify=${Math.random().toString(36).slice(2, 8)}`]] : r))}>Add a record</SiteButton></div>
    </div>
  );
}

function FilesDemo() {
  const items: [IconName, string, string][] = [['folder-01', 'plugins', '12 items'], ['folder-01', 'world', '1.2 GB'], ['file-01', 'server.properties', '1.4 KB'], ['file-01', 'ops.json', '220 B']];
  const [sel, setSel] = useState(2);
  return (
    <ul className="grid gap-1.5 rounded-2xl bg-s1 p-2" role="listbox" aria-label="Files">
      {items.map(([ic, n, s], i) => (
        <li key={n}><button type="button" role="option" aria-selected={sel === i} onClick={() => setSel(i)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent', sel === i ? 'bg-accent-bg' : 'hover:bg-s2')}><Icon name={ic} size={18} className="text-ink2" /><span className="flex-1 font-bold">{n}</span><span className="text-[13px] text-ink2">{s}</span></button></li>
      ))}
    </ul>
  );
}

function BackupsDemo() {
  const [list, setList] = useState<[string, string][]>([['Today 04:00', '1.2 GB'], ['Yesterday 04:00', '1.2 GB']]); const [busy, setBusy] = useState(false);
  const go = () => { if (busy) return; setBusy(true); setTimeout(() => { setList((l) => ([['Just now', '1.2 GB'], ...l] as [string, string][]).slice(0, 4)); setBusy(false); }, 900); };
  return (
    <div className="grid gap-3 rounded-2xl bg-s1 p-4"><ul className="grid gap-2">{list.map(([d, s], i) => <li key={d + i} className="site-pop flex items-center gap-3"><Icon name="archive-01" size={18} className="text-violet" /><span className="flex-1 font-bold">{d}</span><span className="text-[13px] text-ink2">{s}</span></li>)}</ul>
      <div><SiteButton variant="soft" onClick={go}>{busy ? 'Backing up…' : 'Back up now'}</SiteButton></div></div>
  );
}

function TeamDemo() {
  const roles = ['Viewer', 'Admin', 'Owner'];
  const [r, setR] = useState([2, 1, 0]);
  const people = ['Ana · you', 'Mihai', 'Dan'];
  return (
    <ul className="grid gap-2 rounded-2xl bg-s1 p-3">{people.map((p, i) => (
      <li key={p} className="flex flex-wrap items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-accent-bg text-[13px] font-extrabold text-accent-ink">{p[0]}</span><span className="flex-1 font-bold">{p}</span>
        <button type="button" disabled={i === 0} onClick={() => setR((x) => x.map((v, j) => (j === i ? (v + 1) % 2 : v)))} className="rounded-full bg-s3 px-3.5 py-1.5 text-[13px] font-bold outline-none transition-colors hover:bg-s4 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70" aria-label={`${p} role: ${roles[r[i]!]}`}>{roles[r[i]!]}</button></li>
    ))}</ul>
  );
}

function BillingDemo() {
  const tabs = { Orders: [['Flame · Minecraft', '€9.00'], ['Spark · Bot', '€3.00']], Renewals: [['Flame · 12 Nov', '€9.00'], ['Spark · 02 Dec', '€3.00']], Invoices: [['INV-1042 · Paid', '€9.00'], ['INV-1031 · Paid', '€3.00']] } as const;
  const [t, setT] = useState<keyof typeof tabs>('Orders');
  return (
    <div className="grid gap-3 rounded-2xl bg-s1 p-3">
      <div role="tablist" className="flex gap-1 rounded-full bg-s2 p-1">{(Object.keys(tabs) as (keyof typeof tabs)[]).map((k) => <button key={k} role="tab" aria-selected={t === k} onClick={() => setT(k)} className={cn('flex-1 rounded-full px-3 py-2 text-[13.5px] font-bold outline-none transition-[background-color,color] duration-300 focus-visible:ring-2 focus-visible:ring-accent', t === k ? 'bg-ink text-on-ink' : 'text-ink2 hover:text-ink')}>{k}</button>)}</div>
      <ul key={t} className="grid gap-1.5">{tabs[t].map(([a, b]) => <li key={a} className="site-step flex items-center justify-between rounded-xl bg-s2 px-4 py-3"><span className="font-bold">{a}</span><span className="font-mono text-[13px]">{b}</span></li>)}</ul>
    </div>
  );
}

function SupportDemo() {
  const [sent, setSent] = useState(false);
  return (
    <div className="grid gap-2.5 rounded-2xl bg-s1 p-4">
      <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-s2 px-4 py-2.5 text-[14.5px]">My server won’t start after the update. Any idea?</p>
      <p className="max-w-[85%] justify-self-end rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[14.5px] text-on-accent">Thanks, we looked at the log. Switching the version fixes it.</p>
      {sent ? <p className="site-pop max-w-[85%] rounded-2xl rounded-bl-md bg-s2 px-4 py-2.5 text-[14.5px]">That worked, thank you!</p> : <div><SiteButton variant="soft" onClick={() => setSent(true)}>Reply “That worked”</SiteButton></div>}
    </div>
  );
}

function StepsDemo() {
  const steps = ['Choose', 'Make it yours', 'Launch', 'Manage']; const [a, setA] = useState(0);
  useEffect(() => { const t = setInterval(() => setA((v) => (v + 1) % 4), 1400); return () => clearInterval(t); }, []);
  return <ol className="grid gap-2 sm:grid-cols-4">{steps.map((s, i) => <li key={s} className={cn('flex items-center gap-3 rounded-2xl p-3 transition-[background-color,transform] duration-500 ease-spring', i === a ? 'scale-[1.03] bg-accent text-on-accent' : 'bg-s1')}><span className={cn('grid size-8 place-items-center rounded-full text-[13px] font-extrabold', i === a ? 'bg-white/20' : 'bg-s3')}>{i + 1}</span><span className="font-bold">{s}</span></li>)}</ol>;
}

function SecurityDemo() {
  const [v, setV] = useState([true, true, false]);
  const rows: [IconName, string][] = [['shield-01', 'Two-step sign-in'], ['key-01', 'API keys shown once'], ['user-group', 'Scoped team access']];
  return (
    <ul className="grid gap-2 rounded-2xl bg-s1 p-3">{rows.map(([ic, t], i) => (
      <li key={t}><button type="button" role="switch" aria-checked={v[i]} onClick={() => setV((x) => x.map((y, j) => (j === i ? !y : y)))} className="flex w-full items-center gap-3 rounded-xl bg-s2 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span className="grid size-9 place-items-center rounded-xl bg-good-bg text-good"><Icon name={ic} size={18} /></span><span className="flex-1 font-bold">{t}</span>
        <span aria-hidden="true" className={cn('relative h-6 w-10 rounded-full transition-colors duration-300', v[i] ? 'bg-good' : 'bg-s4')}><span className={cn('absolute top-0.5 size-5 rounded-full bg-white transition-[left] duration-300 ease-spring', v[i] ? 'left-[18px]' : 'left-0.5')} /></span></button></li>
    ))}</ul>
  );
}

function Demo({ kind }: { kind: DemoKind }) {
  const map: Record<DemoKind, () => ReactNode> = { console: ConsoleDemo, bot: BotDemo, app: AppDemo, dns: DnsDemo, files: FilesDemo, backups: BackupsDemo, team: TeamDemo, billing: BillingDemo, support: SupportDemo, steps: StepsDemo, security: SecurityDemo };
  const C = map[kind];
  return <div><C /><p className="mt-2 px-1 text-[12px] text-ink3">Try it. Everything here is simulated in your browser.</p></div>;
}
