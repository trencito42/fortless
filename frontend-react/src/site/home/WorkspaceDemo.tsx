import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/design-system';
import { StatusDot } from '../ui';
import { useReducedMotion } from '../hooks';

type Kind = 'game' | 'bot' | 'app';
interface Svc { id: Kind; name: string; sub: string; icon: IconName; tone: string; boot: string[]; cmds: Record<string, string[]> }

const SERVICES: Svc[] = [
  { id: 'game', name: 'survival-server', sub: 'Game hosting', icon: 'server', tone: 'bg-accent-bg text-accent-ink', boot: ['Starting server instance', 'Loading configuration', '✓ Server started successfully', 'Ready for connections'],
    cmds: { help: ['Commands: help, status, list, say <text>, restart'], status: ['TPS 20.0 · 4 players online · uptime 3d 4h'], list: ['Players online: Alex, Mira, Dan, Ioana'] } },
  { id: 'bot', name: 'community-bot', sub: 'Bot hosting', icon: 'discord', tone: 'bg-violet-bg text-violet', boot: ['Installing dependencies', 'Starting node index.js', '✓ Logged in as community-bot', 'Listening for events'],
    cmds: { help: ['Commands: help, status, guilds, say <text>, restart'], status: ['Connected · latency 38 ms · 12 guilds'], guilds: ['Serving 12 guilds, 3,481 members'] } },
  { id: 'app', name: 'portfolio-api', sub: 'App hosting', icon: 'package', tone: 'bg-good-bg text-good', boot: ['npm ci', 'npm run build', '✓ Build finished in 14s', 'Listening on port 3000'],
    cmds: { help: ['Commands: help, status, routes, say <text>, restart'], status: ['Healthy · 41 req/min · p95 62 ms'], routes: ['GET /health · GET /projects · POST /contact'] } },
];

const stamp = () => { const d = new Date(); return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}]`; };
type Line = { t: string; text: string; ok?: boolean; me?: boolean };

/** A small interactive workspace. Metrics are simulated in the browser; the console answers a few commands. */
export function WorkspaceDemo({ compact = false }: { compact?: boolean }) {
  const reduced = useReducedMotion();
  const [sel, setSel] = useState<Kind>('game');
  const [running, setRunning] = useState<Record<Kind, boolean>>({ game: true, bot: true, app: true });
  const svc = SERVICES.find((s) => s.id === sel)!;
  const [lines, setLines] = useState<Line[]>([]);
  const [cmd, setCmd] = useState('');
  const [cpu, setCpu] = useState<number[]>(() => Array.from({ length: 40 }, (_, i) => 38 + Math.sin(i / 3) * 6 + (i % 5)));
  const box = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isOn = running[sel];

  const boot = (s: Svc) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setLines([]);
    s.boot.forEach((text, i) => timers.current.push(setTimeout(() => setLines((l) => [...l, { t: stamp(), text: text.replace('✓ ', ''), ok: text.startsWith('✓') }]), reduced ? 0 : 420 * (i + 1))));
  };
  useEffect(() => { boot(svc); return () => timers.current.forEach(clearTimeout); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setCpu((c) => [...c.slice(1), isOn ? Math.max(8, Math.min(92, (c[c.length - 1] ?? 40) + (Math.random() - 0.5) * 16)) : Math.max(0, (c[c.length - 1] ?? 0) * 0.7)]), 900);
    return () => clearInterval(id);
  }, [isOn, reduced]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [lines]);

  const power = (next: 'start' | 'stop' | 'restart') => {
    if (next === 'stop') { setRunning((r) => ({ ...r, [sel]: false })); setLines((l) => [...l, { t: stamp(), text: 'Stopping… server offline' }]); return; }
    setRunning((r) => ({ ...r, [sel]: true }));
    if (next === 'restart') setLines((l) => [...l, { t: stamp(), text: 'Restarting…' }]);
    boot(svc);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = cmd.trim(); if (!raw) return;
    setCmd('');
    setLines((l) => [...l, { t: stamp(), text: raw, me: true }]);
    if (!isOn) { setLines((l) => [...l, { t: stamp(), text: 'Server is offline. Start it first.' }]); return; }
    const [head, ...rest] = raw.split(/\s+/);
    if (head === 'restart') { power('restart'); return; }
    if (head === 'say') { setLines((l) => [...l, { t: stamp(), text: `Broadcast: ${rest.join(' ') || '…'}`, ok: true }]); return; }
    const out = svc.cmds[head ?? ''];
    setLines((l) => [...l, ...(out ?? [`Unknown command “${head}”. Type help.`]).map((text) => ({ t: stamp(), text }))]);
  };

  const now = Math.round(cpu[cpu.length - 1] ?? 0);
  const path = useMemo(() => cpu.map((v, i) => `${(i / (cpu.length - 1)) * 100},${100 - v}`).join(' '), [cpu]);
  const mem = (isOn ? 2.4 : 0.1).toFixed(1);

  return (
    <div className={cn('grid gap-3 rounded-[28px] bg-accent-bg p-3 sm:p-4', compact ? '' : 'lg:grid-cols-[250px_minmax(0,1fr)]')}>
      <div className={cn('rounded-[22px] bg-s1 p-3', !compact && 'lg:p-4')}>
        <p className="px-2 pb-2 text-[12.5px] font-bold text-ink">Your services</p>
        <ul className={cn('grid gap-1.5', compact ? 'grid-cols-3' : 'grid-cols-3 lg:grid-cols-1')} aria-label="Services">
          {SERVICES.map((s) => (
            <li key={s.id}>
              <button type="button" aria-pressed={sel === s.id} onClick={() => setSel(s.id)} className={cn('flex w-full min-w-0 items-center gap-2.5 rounded-2xl p-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent', sel === s.id ? 'bg-accent-bg' : 'hover:bg-s2')}>
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', s.tone)}><Icon name={s.icon} size={18} /></span>
                <span className="sr-only sm:hidden">{s.name}</span>
                <span className="hidden min-w-0 flex-1 sm:block"><span className="block truncate text-[14px] font-extrabold tracking-[-0.02em]">{s.name}</span><span className="block truncate text-[12px] text-ink">{s.sub}</span></span>
                <StatusDot tone={running[s.id] ? 'good' : 'idle'} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 rounded-[22px] bg-s1 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="site-h truncate text-[22px] font-extrabold tracking-[-0.04em] sm:text-[26px]">{svc.name}</p><p className="text-[13px] text-ink2">{svc.sub} · demo workspace</p></div>
          <div className="flex items-center gap-1.5" role="group" aria-label="Power controls">
            <span className={cn('mr-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold', isOn ? 'bg-good-bg text-good' : 'bg-s3 text-ink2')}><StatusDot tone={isOn ? 'good' : 'idle'} live={isOn} />{isOn ? 'Running' : 'Offline'}</span>
            <button type="button" onClick={() => power('start')} disabled={isOn} className="h-9 rounded-full bg-s2 px-3.5 text-[13px] font-bold outline-none hover:bg-s3 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">Start</button>
            <button type="button" onClick={() => power('restart')} className="h-9 rounded-full bg-s2 px-3.5 text-[13px] font-bold outline-none hover:bg-s3 focus-visible:ring-2 focus-visible:ring-accent">Restart</button>
            <button type="button" onClick={() => power('stop')} disabled={!isOn} className="h-9 rounded-full bg-s2 px-3.5 text-[13px] font-bold outline-none hover:bg-s3 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">Stop</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {[['CPU', `${isOn ? now : 0}%`, isOn ? now : 0], ['Memory', `${mem} GB`, isOn ? 52 : 3], ['Storage', '8.1 GB', 34]].map(([l, v, p]) => (
            <div key={String(l)} className="rounded-2xl bg-s2 p-3 sm:p-4"><p className="text-[12px] font-bold text-ink2">{l}</p><p className="site-h text-[22px] font-extrabold tracking-[-0.04em] tabular-nums sm:text-[30px]">{v}</p><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-s3"><div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-petal" style={{ width: `${p}%` }} /></div></div>
          ))}
        </div>
        <div className={cn('mt-2.5 grid gap-2.5', !compact && 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]')}>
          <div className="rounded-2xl bg-s2 p-3 sm:p-4"><div className="flex justify-between text-[12px] font-bold text-ink2"><span>CPU, last minute</span><span className="tabular-nums">{isOn ? now : 0}% now</span></div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-2 h-28 w-full" role="img" aria-label={`CPU usage over the last minute, currently ${isOn ? now : 0} percent`}><polyline points={`0,100 ${path} 100,100`} className="fill-accent/15" /><polyline points={path} fill="none" className="stroke-accent" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg></div>
          <div className="flex min-h-48 flex-col rounded-2xl bg-con p-3 font-mono text-[12.5px] text-con-ink sm:p-4">
            <div className="mb-2 flex justify-between text-[11.5px] text-con-dim"><span>Live console</span><span>{svc.name}</span></div>
            <div ref={box} className="max-h-36 min-h-24 flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Console output">
              {lines.map((l, i) => <p key={i} className={cn(l.me && 'text-white', l.ok && 'text-con-ok')}><span className="text-con-dim">{l.t}</span> {l.me ? '> ' : ''}{l.text}</p>)}
              <span className="site-caret inline-block h-3.5 w-1.5 translate-y-0.5 bg-con-ink" aria-hidden="true" />
            </div>
            <form onSubmit={submit} className="mt-2 flex items-center gap-2 rounded-xl bg-white/5 px-3"><span aria-hidden="true" className="text-con-dim">&gt;</span><input value={cmd} onChange={(e) => setCmd(e.target.value)} aria-label="Console command" placeholder="Type help" autoComplete="off" spellCheck={false} className="h-9 min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-con-dim" /></form>
          </div>
        </div>
      </div>
    </div>
  );
}
