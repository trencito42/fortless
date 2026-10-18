/** Game tab: settings form, Java recommendation, server icon and mod/plugin installer. Everything is driven by the server's game profile. */
import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatBytes } from '../../../core/utils/formatting.js';
import { hero, toast } from '../../../petal/index.js';
import { confirmDialog } from './dialog.js';

interface Field { key: string; label: string; type: 'bool' | 'int' | 'enum' | 'string'; group?: string; description?: string; default?: string; min?: number; max?: number; maxLength?: number; options?: Array<{ value: string; label: string }> }
interface Info {
  profile: null | { slug: string; name: string; configFile: string | null; configExists: boolean; schema: Field[]; sources: Array<{ index: number; label: string; kind: string; dir: string }>; icon: boolean };
  values?: Record<string, string>;
  eula?: 'required' | 'accepted' | 'unavailable';
  java?: { gameVersion: string | null; recommended: string | null; current: string | null; matches: boolean | null; available: string[] };
}
interface Hit { projectId: string; slug: string; title: string; description: string; author: string; downloads: number; iconUrl: string | null }

const fail = (e: any) => toast(e?.message || 'Request failed', 'bad');
const json = (url: string, method: string, body?: unknown) => api(url, {
  method,
  headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const javaLabel = (image: string | null) => (image ? (image.match(/java_(\d+)/)?.[1] ? `Java ${image.match(/java_(\d+)/)![1]}` : image) : 'unknown');

function control(f: Field, value: string): string {
  const id = `gm_${f.key}`;
  if (f.type === 'bool') return `<button type="button" class="sw" role="switch" id="${id}" data-key="${esc(f.key)}" aria-checked="${value === 'true'}" aria-label="${esc(f.label)}"></button>`;
  if (f.type === 'enum') return `<div class="inp sel"><select id="${id}" data-key="${esc(f.key)}">${f.options!.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  if (f.type === 'int') return `<div class="inp"><input id="${id}" data-key="${esc(f.key)}" type="number" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} value="${esc(value)}"></div>`;
  return `<div class="inp"><input id="${id}" data-key="${esc(f.key)}" maxlength="${f.maxLength ?? 200}" value="${esc(value)}"></div>`;
}

export function initGame(serviceId: string): { open(): void; checkEula(): Promise<void> } {
  const host = document.getElementById('dtlGameBody');
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}`;
  let loaded = false;
  let info: Info | null = null;
  let source = 0;
  let eulaPrompted = false;
  const initial = new Map<string, string>();

  const valueOf = (f: Field) => info?.values?.[f.key] ?? f.default ?? (f.type === 'bool' ? 'false' : '');

  async function render(h: HTMLElement) {
    info = await api.get<Info>(`${base}/game`);
    if (!info.profile) { h.innerHTML = `<div class="es"><span class="tile neu lg">${hero('server')}</span><h4>No game tools for this server</h4></div>`; return; }
    const p = info.profile;
    const groups = new Map<string, Field[]>();
    for (const f of p.schema) groups.set(f.group ?? 'Settings', [...(groups.get(f.group ?? 'Settings') ?? []), f]);
    initial.clear();
    const j = info.java;
    const settingsHtml = [...groups].map(([group, fields]) => {
      const controls = fields.map((field) => {
        const value = valueOf(field);
        initial.set(field.key, value);
        return `<div class="fld"><div class="row" style="justify-content:space-between;gap:10px"><label for="gm_${esc(field.key)}">${esc(field.label)}</label>${field.type === 'bool' ? control(field, value) : ''}</div>${field.type === 'bool' ? '' : control(field, value)}${field.description ? `<small class="faint">${esc(field.description)}</small>` : ''}</div>`;
      }).join('');
      return `<div><div class="faint" style="font-weight:700;font-size:12.5px;margin-bottom:8px">${esc(group)}</div><div class="g g2" style="gap:12px">${controls}</div></div>`;
    }).join('');
    h.innerHTML = `<div class="col" style="gap:18px">
      ${info.eula === 'required' ? `<div class="alert warn"><div><b>Minecraft needs your approval before it can start</b><span>Accept the Minecraft EULA and Fortless will restart this server automatically.</span></div><button class="btn s pri" type="button" data-gm="eula">Review and accept</button></div>` : ''}
      ${j && j.recommended && j.matches === false ? `<div class="alert warn"><div><b>${esc(javaLabel(j.recommended))} is recommended for ${esc(j.gameVersion ?? 'this version')}</b><span>This server runs ${esc(javaLabel(j.current))}.</span></div>${j.available.includes(j.recommended) ? `<button class="btn s pri" type="button" data-gm="java" data-image="${esc(j.recommended)}">Switch</button>` : ''}</div>` : ''}
      <div class="ch"><div class="tx"><h3>Configuration</h3><p>Game settings and installation tools for this service.</p></div></div>
      ${p.configFile ? `<section class="card"><div class="ch"><div class="tx"><h3>Server settings</h3>${p.configExists ? '' : '<p>Start the server once to create the settings file. Saving now creates it.</p>'}</div><button class="btn s pri" type="button" data-gm="save">Save</button></div>
        <div class="col" style="gap:18px">${settingsHtml}</div></section>` : ''}
      ${p.icon ? `<section class="card"><div class="ch"><div class="tx"><h3>Server icon</h3><p>Any image works. It is resized to 64 by 64.</p></div></div>
        <label class="btn s sec" style="cursor:pointer;width:max-content">${hero('arrow', 'xs')}Choose image<input type="file" id="gmIcon" accept="image/*" hidden></label></section>` : ''}
      ${p.sources.length ? `<section class="card"><div class="ch"><div class="tx"><h3>Install</h3><p>Search and manage server-side mods and plugins.</p></div></div>
        <div class="seg" role="tablist" id="gmSources">${p.sources.map((s) => `<button type="button" role="tab" aria-selected="${s.index === source}" data-src="${s.index}">${esc(s.label)}</button>`).join('')}</div>
        <div class="row" style="gap:10px;margin:14px 0"><div class="inp s pill" style="flex:1">${hero('search', 's')}<input id="gmQuery" placeholder="Search" aria-label="Search"></div></div>
        <div id="gmResults"></div>
        <div class="faint" style="font-weight:700;font-size:12.5px;margin:18px 0 8px">Installed</div><div id="gmInstalled"></div></section>` : ''}
    </div>`;
    if (p.sources.length) { void search(); void installed(); }
    if (info.eula === 'required' && !eulaPrompted) {
      eulaPrompted = true;
      window.setTimeout(() => void acceptEula(), 0);
    }
  }

  async function acceptEula() {
    if (!host || !(await confirmDialog({
      title: 'Accept the Minecraft EULA?',
      message: 'Minecraft cannot start until you accept Mojang’s End User License Agreement. If you approve, Fortless will update eula.txt and restart the server now.',
      confirmLabel: 'Accept and restart',
    }))) return;
    try {
      await json(`${base}/game/eula/accept`, 'POST');
      toast('EULA accepted. The server is restarting.', 'good');
      await render(host);
    } catch (e) { fail(e); }
  }

  async function search() {
    const el = document.getElementById('gmResults');
    if (!el) return;
    const q = (document.getElementById('gmQuery') as HTMLInputElement | null)?.value.trim() ?? '';
    el.innerHTML = '<div class="sk" role="status" aria-label="Searching"><i></i><i></i></div>';
    try {
      const res = await api.get<{ hits: Hit[]; gameVersion: string | null }>(`${base}/game/mods/search?source=${source}&q=${encodeURIComponent(q)}&page=0`);
      el.innerHTML = res.hits.length ? `<div class="col">${res.hits.map((h) => `<div class="li h" style="padding:10px 14px" data-project="${esc(h.projectId)}">
        ${h.iconUrl ? `<img src="${esc(h.iconUrl)}" alt="" width="40" height="40" style="border-radius:10px;flex:none" referrerpolicy="no-referrer">` : `<span class="tile neu sm">${hero('package')}</span>`}
        <span class="tx"><b>${esc(h.title)}</b><small style="white-space:normal">${esc(h.description)}</small></span>
        <button class="btn s sec" type="button" data-gm="install">${hero('plus', 'xs')}Install</button></div>`).join('')}</div>${res.gameVersion ? `<small class="faint">Showing releases for ${esc(res.gameVersion)}</small>` : ''}`
        : `<div class="es"><span class="tile neu lg">${hero('search')}</span><h4>No results</h4></div>`;
    } catch (e: any) { el.innerHTML = `<div class="alert bad"><div><b>${esc(e?.message || 'Search failed')}</b></div></div>`; }
  }

  async function installed() {
    const el = document.getElementById('gmInstalled');
    if (!el) return;
    try {
      const res = await api.get<{ dir: string; files: Array<{ name: string; size: number }> }>(`${base}/game/mods/installed?source=${source}`);
      el.innerHTML = res.files.length ? `<div class="col" style="gap:4px">${res.files.map((f) => `<div class="li h" style="padding:8px 12px" data-file="${esc(f.name)}" data-dir="${esc(res.dir)}"><span class="tile neu sm">${hero('document')}</span><span class="tx"><b>${esc(f.name)}</b><small>${esc(formatBytes(f.size))}</small></span><button class="btn s sq ghost" type="button" data-gm="remove" aria-label="Remove ${esc(f.name)}">${hero('x', 's')}</button></div>`).join('')}</div>` : `<div class="faint">Nothing installed yet.</div>`;
    } catch { el.textContent = ''; }
  }

  function toPng64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const ctx = c.getContext('2d')!;
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 64, 64);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png').split(',')[1]!);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image.')); };
      img.src = url;
    });
  }

  host?.addEventListener('click', async (ev) => {
    const t = ev.target as HTMLElement;
    const sw = t.closest<HTMLElement>('.sw[role="switch"]');
    if (sw) { sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); return; }
    const src = t.closest<HTMLElement>('[data-src]');
    if (src && host) { source = Number(src.dataset['src']); host.querySelectorAll('#gmSources button').forEach((b) => b.setAttribute('aria-selected', String(b === src))); void search(); void installed(); return; }
    const btn = t.closest<HTMLElement>('[data-gm]');
    if (!btn || !host) return;
    try {
      switch (btn.dataset['gm']) {
        case 'eula': await acceptEula(); return;
        case 'save': {
          const values: Record<string, string> = {};
          host.querySelectorAll<HTMLElement>('[data-key]').forEach((el) => {
            const key = el.dataset['key']!;
            const v = el.matches('.sw') ? el.getAttribute('aria-checked') ?? 'false' : (el as HTMLInputElement).value;
            if (v !== initial.get(key)) values[key] = v;
          });
          if (!Object.keys(values).length) { toast('Nothing changed', 'info'); return; }
          await json(`${base}/game/config`, 'PUT', { values });
          toast('Saved. Restart the server to apply.', 'good');
          await render(host); return;
        }
        case 'java':
          await json(`${base}/startup/image`, 'PUT', { image: btn.dataset['image'] });
          toast('Java version changed. Restart the server to apply it.', 'good'); await render(host); return;
        case 'install': {
          const id = btn.closest<HTMLElement>('[data-project]')?.dataset['project'];
          btn.setAttribute('disabled', '');
          try { const r = await api.post<{ file: string }>(`${base}/game/mods/install`, { source, projectId: id }); toast(`Installed ${r.file}. Restart the server to load it.`, 'good'); await installed(); }
          finally { btn.removeAttribute('disabled'); }
          return;
        }
        case 'remove': {
          const row = btn.closest<HTMLElement>('[data-file]')!;
          if (!(await confirmDialog({ title: `Remove ${row.dataset['file']}?`, confirmLabel: 'Remove', danger: true }))) return;
          await json(`${base}/files/delete`, 'POST', { dir: row.dataset['dir'], names: [row.dataset['file']] });
          await installed(); return;
        }
      }
    } catch (e) { fail(e); }
  });
  let timer: number | undefined;
  host?.addEventListener('input', (ev) => {
    if ((ev.target as HTMLElement).id !== 'gmQuery') return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void search(), 350);
  });
  host?.addEventListener('change', async (ev) => {
    const input = ev.target as HTMLInputElement;
    if (input.id !== 'gmIcon' || !input.files?.[0]) return;
    try { await json(`${base}/game/icon`, 'POST', { png: await toPng64(input.files[0]) }); toast('Icon updated. Restart the server to see it.', 'good'); } catch (e) { fail(e); }
    input.value = '';
  });

  return {
    open() { if (host && !loaded) { loaded = true; void render(host).catch((e) => { loaded = false; fail(e); }); } },
    async checkEula() {
      if (!host || eulaPrompted) return;
      try {
        const state = await api.get<Info>(`${base}/game`);
        if (state.eula !== 'required' || eulaPrompted) return;
        eulaPrompted = true;
        await acceptEula();
      } catch { /* The Game tab will surface provider errors if the customer opens it. */ }
    },
  };
}
