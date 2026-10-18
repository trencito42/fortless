/**
 * Live resource tiles for the Overview tab, fed by the Wings "stats" event (about once a second).
 * The tiles are built once and only their text changes, so nothing re-renders or flashes between updates.
 */
import { formatBytes } from '../../../core/utils/formatting.js';
import { hero } from '../../../petal/index.js';
import { spark } from '../../../petal/components/sparklines.js';

export interface Stats {
  memory_bytes?: number; memory_limit_bytes?: number; cpu_absolute?: number; disk_bytes?: number; uptime?: number; state?: string;
  network?: { rx_bytes?: number; tx_bytes?: number };
}

const HISTORY = 40;
const duration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};
const rate = (bytesPerSecond: number) => `${formatBytes(Math.max(0, bytesPerSecond))}/s`;

const TILES: Array<{ id: string; label: string; icon: string; tone: string; chart?: string }> = [
  { id: 'cpu', label: 'CPU', icon: 'cpu', tone: 'info', chart: 'var(--info)' },
  { id: 'mem', label: 'Memory', icon: 'database', tone: 'violet', chart: 'var(--violet)' },
  { id: 'net', label: 'Network', icon: 'link-square-02', tone: 'good' },
  { id: 'disk', label: 'Disk', icon: 'archive-01', tone: 'warn' },
  { id: 'up', label: 'Uptime', icon: 'play', tone: 'neu' },
];

export function mountLiveTiles(host: HTMLElement): (st: Stats) => void {
  host.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">${TILES.map((t) =>
    `<div class="card mt" style="min-width:0"><div style="min-width:0"><span class="l">${t.label}</span><b class="v" data-v="${t.id}">—</b><small data-s="${t.id}"></small>${t.chart ? `<div data-c="${t.id}" style="height:36px"></div>` : ''}</div><span class="tile ${t.tone}">${hero(t.icon)}</span></div>`).join('')}</div>`;
  const text = (sel: string, v: string) => { const el = host.querySelector<HTMLElement>(sel); if (el && el.textContent !== v) el.textContent = v; };
  const cpu: number[] = [];
  const mem: number[] = [];
  let last: { t: number; rx: number; tx: number } | null = null;
  return (st) => {
    if (!document.body.contains(host)) return;
    const now = Date.now();
    const rx = Number(st.network?.rx_bytes ?? 0);
    const tx = Number(st.network?.tx_bytes ?? 0);
    const dt = last ? (now - last.t) / 1000 : 0;
    const down = last && dt > 0 ? (rx - last.rx) / dt : 0;
    const up = last && dt > 0 ? (tx - last.tx) / dt : 0;
    last = { t: now, rx, tx };
    cpu.push(Number(st.cpu_absolute ?? 0)); if (cpu.length > HISTORY) cpu.shift();
    mem.push(Number(st.memory_bytes ?? 0)); if (mem.length > HISTORY) mem.shift();
    const limit = Number(st.memory_limit_bytes ?? 0);
    text('[data-v="cpu"]', `${Number(st.cpu_absolute ?? 0).toFixed(1)}%`);
    text('[data-s="cpu"]', st.state ? String(st.state) : '');
    text('[data-v="mem"]', formatBytes(Number(st.memory_bytes ?? 0)));
    text('[data-s="mem"]', limit ? `of ${formatBytes(limit)}` : '');
    text('[data-v="net"]', `${rate(down)} down`);
    text('[data-s="net"]', `${rate(up)} up`);
    text('[data-v="disk"]', formatBytes(Number(st.disk_bytes ?? 0)));
    text('[data-v="up"]', st.uptime ? duration(Number(st.uptime)) : '—');
    const c1 = host.querySelector<HTMLElement>('[data-c="cpu"]'); if (c1) c1.innerHTML = spark(cpu, 'var(--info)');
    const c2 = host.querySelector<HTMLElement>('[data-c="mem"]'); if (c2) c2.innerHTML = spark(mem, 'var(--violet)');
  };
}
