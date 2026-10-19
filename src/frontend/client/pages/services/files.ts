/**
 * Server file manager: Petal navigation tree on the left, code editor with tabs on the right.
 * Every call goes through /api/v1/services/:id/files (ownership check, account panel key, audit).
 * Uploads and downloads use short-lived signed Wings URLs. File names are only ever set via textContent.
 */
import { api } from '../../../core/api/client.js';
import { formatBytes } from '../../../core/utils/formatting.js';
import { hero, toast } from '../../../petal/index.js';
import { confirmDialog, promptDialog } from './dialog.js';

interface Entry { name: string; isFile: boolean; isSymlink: boolean; size: number; mime: string; modifiedAt: string }
interface EditorHost {
  open(path: string, content: string): void; show(path: string): void; value(path: string): string | undefined;
  markSaved(path: string): void; close(path: string): void; focus(): void; destroy(): void;
}
interface EditorApi { mountEditor(parent: HTMLElement, hooks: { onDirty(p: string, d: boolean): void; onSave(p: string): void }): EditorHost }

const TEXT_EXT = /\.(txt|log|json|ya?ml|properties|conf|cfg|ini|toml|xml|md|js|mjs|cjs|ts|py|sh|bash|java|lua|cs|csv|env|html?|css|mcmeta|secret|sk|skript|lang|nbt\.txt)$/i;
const ARCHIVE_EXT = /\.(zip|tar|tar\.gz|tgz)$/i;
const MAX_EDIT = 1024 * 1024;
const EDITOR_SRC = '/assets/editor-ui.js?v=1';

let editorScript: Promise<EditorApi> | null = null;
function loadEditor(): Promise<EditorApi> {
  editorScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = EDITOR_SRC;
    s.onload = () => resolve((window as unknown as { FortlessEditor: EditorApi }).FortlessEditor);
    s.onerror = () => { editorScript = null; reject(new Error('Could not load the editor.')); };
    document.head.appendChild(s);
  });
  return editorScript;
}

const el = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';
const join = (d: string, n: string) => (d === '/' ? '' : d) + '/' + n;

export function initServiceFiles(serviceId: string): { open(): void } {
  const host = document.getElementById('dtlFilesBody');
  if (!host) return { open() { /* no files tab */ } };
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}/files`;
  const fail = (e: any) => toast(e?.message || 'Request failed', 'bad');
  // An unknown outcome (the server did not answer in time) is reported as pending, never as a failure to retry blindly.
  const pendingNote = (r: unknown) => { if ((r as { pending?: boolean } | null)?.pending) toast('The server is still working on this. Do not repeat the action; the folder refreshes shortly.', 'info'); return r; };

  host.innerHTML = `<div class="fm" id="fm">
    <div class="fm-side" id="fmSide">
      <div class="row" style="justify-content:space-between;gap:8px">
        <div class="btngroup">
          <button class="btn s sq sec" type="button" data-fm="newfile" data-tip="New file" data-pos="bottom" aria-label="New file">${hero('plus', 's')}</button>
          <button class="btn s sq sec" type="button" data-fm="newdir" data-tip="New folder" data-pos="bottom" aria-label="New folder">${hero('folder-01', 's')}</button>
          <label class="btn s sq sec" style="cursor:pointer" data-tip="Upload" data-pos="bottom" aria-label="Upload">${hero('arrow', 's')}<input type="file" id="fmUpload" multiple hidden></label>
 <button class="btn s sq sec" type="button" data-fm="pull" data-tip="Download from URL" data-pos="bottom" aria-label="Download from URL">${hero('link-square-02', 's')}</button>
          <button class="btn s sq sec" type="button" data-fm="refresh" data-tip="Refresh" data-pos="bottom" aria-label="Refresh">${hero('refresh', 's')}</button>
        </div>
      </div>
      <div class="bbar" id="fmBulk" hidden><b id="fmBulkN">0 selected</b><span style="flex:1"></span><button class="btn s sec" type="button" data-fm="bulk-archive">Archive</button><button class="btn s sec" type="button" data-fm="bulk-delete">Delete</button></div>
      <div class="fm-tree"><div class="tree" id="fmTree" role="tree" aria-label="Server files" aria-multiselectable="true"></div></div>
    </div>
    <div class="rh" id="fmHandle" role="separator" aria-orientation="vertical" aria-label="Resize file tree"><i></i></div>
    <div class="fm-main">
      <div class="fm-tabs" id="fmTabs" role="tablist"></div>
      <div class="fm-bar" id="fmBar" hidden><div class="crumbs" id="fmPath"></div><button class="btn s pri" type="button" data-fm="save">Save</button></div>
      <div class="es fm-empty" id="fmEmpty"><span class="tile neu lg">${hero('document')}</span><h4>No file open</h4></div>
      <div class="fm-ed" id="fmEd" hidden></div>
    </div>
  </div>`;

  const tree = document.getElementById('fmTree')!;
  const tabsEl = document.getElementById('fmTabs')!;
  const bar = document.getElementById('fmBar')!;
  const pathEl = document.getElementById('fmPath')!;
  const bulkBar = document.getElementById('fmBulk')!;
  const side = document.getElementById('fmSide')!;
  const empty = document.getElementById('fmEmpty')!;
  const edEl = document.getElementById('fmEd')!;

  let loaded = false;
  let selectedDir = '/';
  let active: string | null = null;
  const tabs: string[] = [];
  const dirty = new Set<string>();
  const isNew = new Set<string>();
  let editor: EditorHost | null = null;
  let menu: HTMLElement | null = null;

  // ---------- tree ----------
  const kidsOf = (dir: string): HTMLElement | null =>
    dir === '/' ? tree : tree.querySelector<HTMLElement>(`.tn[data-path="${CSS.escape(dir)}"] > .kids`);

  function nodeFor(dir: string, e: Entry): HTMLElement {
    const path = join(dir, e.name);
    const more = `<button class="ib xs more" type="button" data-more aria-label="Actions for ${'item'}" tabindex="-1">${hero('settings', 'xs')}</button>`;
    let node: HTMLElement;
    if (e.isFile) {
      node = el('div', 'leaf', `${hero('document', 's')}<span class="nm"></span>${more}`);
      node.setAttribute('role', 'treeitem');
      node.tabIndex = -1;
    } else {
      node = el('div', 'tn');
      node.setAttribute('role', 'treeitem');
      node.setAttribute('aria-expanded', 'false');
      node.tabIndex = -1;
      node.appendChild(el('div', 'tr0', `${hero('arrow-right-01', 'xs chv')}${hero('folder-01', 's')}<span class="nm"></span>${more}`));
      node.appendChild(el('div', 'kids')).setAttribute('role', 'group');
    }
    node.dataset['path'] = path;
    node.dataset['name'] = e.name;
    node.dataset['file'] = e.isFile ? '1' : '';
    node.dataset['size'] = String(e.size);
    node.dataset['mime'] = e.mime;
    (node.querySelector('.nm') as HTMLElement).textContent = e.name;
    (node.querySelector('.nm') as HTMLElement).title = e.isFile ? `${e.name} · ${formatBytes(e.size)}` : e.name;
    (node.querySelector('[data-more]') as HTMLElement).setAttribute('aria-label', `Actions for ${e.name}`);
    return node;
  }

  async function loadDir(dir: string): Promise<void> {
    const kids = kidsOf(dir);
    if (!kids) return;
    const res = await api.get<{ dir: string; entries: Entry[] }>(`${base}?dir=${encodeURIComponent(dir)}`);
    kids.replaceChildren(...res.entries.map((e) => nodeFor(dir, e)));
    if (!res.entries.length && dir !== '/') kids.appendChild(el('div', 'leaf')).textContent = 'Empty';
    if (active) markActive();
  }

  const markActive = () => {
    tree.querySelectorAll('.leaf.on').forEach((n) => n.classList.remove('on'));
    if (active) tree.querySelector<HTMLElement>(`.leaf[data-path="${CSS.escape(active)}"]`)?.classList.add('on');
  };

  async function toggle(node: HTMLElement, force?: boolean): Promise<void> {
    const open = force ?? !node.classList.contains('open');
    node.classList.toggle('open', open);
    node.setAttribute('aria-expanded', String(open));
    if (open && !node.dataset['loaded']) {
      node.dataset['loaded'] = '1';
      try { await loadDir(node.dataset['path']!); } catch (e) { node.dataset['loaded'] = ''; fail(e); }
    }
  }

  async function refreshDir(dir: string): Promise<void> {
    const node = dir === '/' ? null : tree.querySelector<HTMLElement>(`.tn[data-path="${CSS.escape(dir)}"]`);
    if (node && !node.dataset['loaded']) return;
    try { await loadDir(dir); } catch (e) { fail(e); }
  }

  // ---------- inline name input (like an IDE) ----------
  function askName(dir: string, initial: string, icon: string): Promise<string | null> {
    return new Promise((resolve) => {
      const kids = kidsOf(dir);
      if (!kids) return resolve(null);
      if (dir !== '/') { const n = tree.querySelector<HTMLElement>(`.tn[data-path="${CSS.escape(dir)}"]`); if (n && !n.classList.contains('open')) void toggle(n, true); }
      const row = el('div', 'leaf', hero(icon, 's'));
      const input = document.createElement('input');
      input.className = 'mono';
      input.style.cssText = 'flex:1;min-width:0;background:var(--s1);border:1px solid var(--accent);border-radius:8px;height:26px;padding:0 8px;font-size:13px;outline:0';
      input.value = initial;
      row.appendChild(input);
      kids.insertBefore(row, kids.firstChild);
      let done = false;
      const finish = (v: string | null) => { if (done) return; done = true; row.remove(); resolve(v); };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') finish(input.value.trim() || null);
        else if (ev.key === 'Escape') finish(null);
      });
      input.addEventListener('blur', () => finish(null));
      input.focus();
      input.select();
    });
  }

  const nameTaken = (dir: string, name: string) =>
    Array.from(kidsOf(dir)?.children ?? []).some((c) => (c as HTMLElement).dataset['name'] === name);

  // ---------- editor + tabs ----------
  function renderTabs() {
    tabsEl.replaceChildren(...tabs.map((p) => {
      const t = el('button', `fm-tab${p === active ? ' on' : ''}`);
      t.setAttribute('type', 'button');
      t.setAttribute('role', 'tab');
      t.dataset['tab'] = p;
      const name = el('span');
      name.textContent = p.split('/').pop() || p;
      name.title = p;
      t.appendChild(name);
      if (dirty.has(p)) t.appendChild(el('span', 'dot'));
      const x = el('span', 'x', hero('x', 'xs'));
      x.dataset['close'] = p;
      t.appendChild(x);
      return t;
    }));
    const has = active !== null;
    bar.hidden = !has; edEl.hidden = !has; empty.hidden = has;
    pathEl.replaceChildren(...((active ?? '').split('/').filter(Boolean).flatMap((seg, i, all) => {
      const part = el(i === all.length - 1 ? 'span' : 'a', i === all.length - 1 ? 'cur' : '');
      part.textContent = seg;
      return i === 0 ? [part] : [el('span', '', hero('arrow-right-01', 'xs')), part];
    })));
  }

  async function ensureEditor(): Promise<EditorHost> {
    if (editor) return editor;
    const api2 = await loadEditor();
    edEl.hidden = false;
    editor = api2.mountEditor(edEl, {
      onDirty(p, d) { if (d) dirty.add(p); else dirty.delete(p); renderTabs(); },
      onSave(p) { void save(p); },
    });
    return editor;
  }

  async function openFile(path: string, content?: string): Promise<void> {
    try {
      if (!tabs.includes(path)) {
        if (content === undefined) content = (await api.get<{ content: string }>(`${base}/content?path=${encodeURIComponent(path)}`)).content;
        const ed = await ensureEditor();
        tabs.push(path);
        active = path;
        renderTabs();
        ed.open(path, content);
      } else {
        const ed = await ensureEditor();
        active = path;
        renderTabs();
        ed.show(path);
      }
      markActive();
      editor?.focus();
    } catch (e) { fail(e); }
  }

  async function save(path: string): Promise<void> {
    const content = editor?.value(path);
    if (content === undefined) return;
    try {
      const saved = await api<{ pending?: boolean }>(`${base}/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) });
      if (saved?.pending) { pendingNote(saved); return; } // keep the editor dirty: the write may or may not have arrived
      isNew.delete(path);
      editor?.markSaved(path);
      toast('Saved', 'good');
      if (isNew.size === 0) await refreshDir(parentOf(path));
    } catch (e) { fail(e); }
  }

  async function closeTab(path: string) {
    if (dirty.has(path) && !(await confirmDialog({ title: `Close ${path.split('/').pop()}?`, message: 'It has unsaved changes.', confirmLabel: 'Close without saving', danger: true }))) return;
    const i = tabs.indexOf(path);
    tabs.splice(i, 1);
    dirty.delete(path);
    isNew.delete(path);
    editor?.close(path);
    active = tabs[Math.min(i, tabs.length - 1)] ?? null;
    renderTabs();
    if (active) { editor?.show(active); markActive(); }
  }

  // ---------- actions ----------
  async function newFile(dir: string) {
    const name = await askName(dir, '', 'document');
    if (!name) return;
    if (/[\/\\]/.test(name) || nameTaken(dir, name)) return toast('Invalid or existing name', 'bad');
    const path = join(dir, name);
    isNew.add(path);
    await openFile(path, '');
    dirty.add(path); renderTabs();
  }
  async function newDir(dir: string) {
    const name = await askName(dir, '', 'folder-01');
    if (!name) return;
    if (/[\/\\]/.test(name) || nameTaken(dir, name)) return toast('Invalid or existing name', 'bad');
    try { pendingNote(await api.post(`${base}/folder`, { dir, name })); await refreshDir(dir); } catch (e) { fail(e); }
  }
  async function rename(node: HTMLElement) {
    const dir = parentOf(node.dataset['path']!);
    const from = node.dataset['name']!;
    const nm = node.querySelector<HTMLElement>('.nm')!;
    nm.style.visibility = 'hidden';
    const input = document.createElement('input');
    input.className = 'mono';
    input.value = from;
    input.style.cssText = 'position:absolute;background:var(--s1);border:1px solid var(--accent);border-radius:8px;height:26px;padding:0 8px;font-size:13px;outline:0;width:180px';
    nm.parentElement!.insertBefore(input, nm);
    const to = await new Promise<string | null>((resolve) => {
      let done = false;
      const fin = (v: string | null) => { if (done) return; done = true; input.remove(); nm.style.visibility = ''; resolve(v); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fin(input.value.trim() || null); else if (e.key === 'Escape') fin(null); });
      input.addEventListener('blur', () => fin(null));
      input.focus(); input.select();
    });
    if (!to || to === from) return;
    if (/[\/\\]/.test(to) || nameTaken(dir, to)) return toast('Invalid or existing name', 'bad');
    try { pendingNote(await api.post(`${base}/rename`, { dir, from, to })); await refreshDir(dir); } catch (e) { fail(e); }
  }
  async function remove(node: HTMLElement) {
    const name = node.dataset['name']!;
    if (!(await confirmDialog({ title: `Delete ${name}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    const dir = parentOf(node.dataset['path']!);
    try {
      pendingNote(await api.post(`${base}/delete`, { dir, names: [name] }));
      tabs.filter((p) => p === node.dataset['path'] || p.startsWith(node.dataset['path'] + '/')).forEach((p) => { dirty.delete(p); void closeTab(p); });
      await refreshDir(dir);
    } catch (e) { fail(e); }
  }
  async function download(path: string) {
    try { window.location.assign((await api.get<{ url: string }>(`${base}/download-url?path=${encodeURIComponent(path)}`)).url); } catch (e) { fail(e); }
  }
  async function upload(dir: string, files: FileList) {
    try {
      const { url } = await api.get<{ url: string }>(`${base}/upload-url?dir=${encodeURIComponent(dir)}`);
      const form = new FormData();
      for (const f of Array.from(files)) form.append('files', f, f.name);
      const res = await fetch(`${url}&directory=${encodeURIComponent(dir)}`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      toast(`${files.length} file(s) uploaded`, 'good');
      await refreshDir(dir);
    } catch (e) { fail(e); }
  }
  /** Archiving can outlast the request. When the outcome is unknown, say so and re-check the folder instead of showing an error. */
  async function afterArchive(dir: string, pending: boolean, done: string) {
    if (!pending) { toast(done, 'good'); await refreshDir(dir); return; }
    toast('Still working on the server. The folder refreshes shortly.', 'info');
    for (const wait of [8000, 20000, 45000]) { await new Promise((r) => window.setTimeout(r, wait)); await refreshDir(dir); }
  }
  async function move(node: HTMLElement) {
    const from = parentOf(node.dataset['path']!);
    const dest = await promptDialog({ title: `Move ${node.dataset['name']}`, label: 'Destination folder', value: from, placeholder: '/plugins', confirmLabel: 'Move' });
    if (!dest || dest === from) return;
    try { pendingNote(await api.post(`${base}/move`, { dir: from, name: node.dataset['name'], destDir: dest })); await refreshDir(from); await refreshDir(dest); } catch (e) { fail(e); }
  }
  async function chmod(node: HTMLElement) {
    const mode = await promptDialog({ title: `Permissions for ${node.dataset['name']}`, label: 'Mode (octal)', value: node.dataset['file'] === '1' ? '644' : '755', placeholder: '644', inputMode: 'numeric', maxLength: 4, confirmLabel: 'Apply' });
    if (!mode) return;
    try { pendingNote(await api.post(`${base}/chmod`, { dir: parentOf(node.dataset['path']!), names: [node.dataset['name']], mode })); toast('Permissions updated', 'good'); } catch (e) { fail(e); }
  }
  async function pull(dir: string) {
    const url = await promptDialog({ title: 'Download a file to the server', label: 'File address (https)', placeholder: 'https://example.com/file.jar', confirmLabel: 'Download' });
    if (!url) return;
    toast('Downloading…', 'info');
    try {
      const r = await api.post<{ pending: boolean }>(`${base}/pull`, { dir, url });
      await afterArchive(dir, r.pending, 'Downloaded');
    } catch (e) { fail(e); }
  }
  async function archive(node: HTMLElement) {
    const dir = parentOf(node.dataset['path']!);
    toast('Archiving…', 'info');
    try { const r = await api.post<{ archive: string | null; pending: boolean }>(`${base}/archive`, { dir, names: [node.dataset['name']] }); await afterArchive(dir, r.pending, r.archive ? `Created ${r.archive}` : ''); } catch (e) { fail(e); }
  }
  async function unarchive(node: HTMLElement) {
    const dir = parentOf(node.dataset['path']!);
    toast('Extracting…', 'info');
    try { const r = await api.post<{ pending: boolean }>(`${base}/unarchive`, { dir, file: node.dataset['name'] }); await afterArchive(dir, r.pending, 'Extracted'); } catch (e) { fail(e); }
  }
  async function copy(node: HTMLElement) {
    try { pendingNote(await api.post(`${base}/copy`, { path: node.dataset['path'] })); await refreshDir(parentOf(node.dataset['path']!)); } catch (e) { fail(e); }
  }

  // ---------- multi-select (Ctrl/Cmd+click) ----------
  const selected = new Map<string, HTMLElement>();
  const selEl = (n: HTMLElement) => (n.classList.contains('tn') ? n.querySelector<HTMLElement>('.tr0')! : n);
  function renderBulk() {
    bulkBar.hidden = selected.size === 0;
    document.getElementById('fmBulkN')!.textContent = `${selected.size} selected`;
  }
  function clearSelection() { selected.forEach((n) => selEl(n).classList.remove('sel')); selected.clear(); renderBulk(); }
  function toggleSelect(node: HTMLElement) {
    const path = node.dataset['path']!;
    const first = selected.keys().next().value as string | undefined;
    if (first !== undefined && parentOf(first) !== parentOf(path)) clearSelection();
    if (selected.has(path)) { selected.delete(path); selEl(node).classList.remove('sel'); }
    else { selected.set(path, node); selEl(node).classList.add('sel'); }
    renderBulk();
  }
  async function bulkArchive() {
    const names = [...selected.values()].map((n) => n.dataset['name']!);
    const dir = parentOf([...selected.keys()][0]!);
    toast('Archiving…', 'info');
    try { const r = await api.post<{ archive: string | null; pending: boolean }>(`${base}/archive`, { dir, names }); clearSelection(); await afterArchive(dir, r.pending, r.archive ? `Created ${r.archive}` : ''); } catch (e) { fail(e); }
  }
  async function bulkDelete() {
    const names = [...selected.values()].map((n) => n.dataset['name']!);
    const paths = [...selected.keys()];
    const dir = parentOf(paths[0]!);
    if (!(await confirmDialog({ title: `Delete ${names.length} item(s)?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      pendingNote(await api.post(`${base}/delete`, { dir, names }));
      tabs.filter((p) => paths.some((d) => p === d || p.startsWith(d + '/'))).forEach((p) => { dirty.delete(p); void closeTab(p); });
      clearSelection();
      await refreshDir(dir);
    } catch (e) { fail(e); }
  }

  // ---------- resizable panels (Petal .rh handle) ----------
  const handle = document.getElementById('fmHandle')!;
  const fm = document.getElementById('fm')!;
  try { const w = Number(localStorage.getItem('fmSideWidth')); if (w >= 200) side.style.width = `${w}px`; } catch { /* storage unavailable */ }
  handle.addEventListener('pointerdown', (ev) => {
    handle.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => {
      const box = fm.getBoundingClientRect();
      side.style.width = `${Math.max(200, Math.min(box.width * 0.6, e.clientX - box.left))}px`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      try { localStorage.setItem('fmSideWidth', String(Math.round(side.getBoundingClientRect().width))); } catch { /* storage unavailable */ }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });

  // ---------- context menu (Petal .menu) ----------
  function closeMenu() { menu?.remove(); menu = null; }
  function openMenu(node: HTMLElement, x: number, y: number) {
    closeMenu();
    const isFile = node.dataset['file'] === '1';
    const name = node.dataset['name']!;
    const path = node.dataset['path']!;
    const items: Array<[string, string, () => void, boolean?] | '-'> = [];
    if (isFile) {
      items.push(['document', 'Open', () => void openFile(path)]);
      items.push(['arrow', 'Download', () => void download(path)]);
      if (ARCHIVE_EXT.test(name)) items.push(['archive-01', 'Unarchive', () => void unarchive(node)]);
    } else {
      items.push(['plus', 'New file', () => void newFile(path)]);
      items.push(['folder-01', 'New folder', () => void newDir(path)]);
      items.push(['arrow', 'Download file here', () => void pull(path)]);
    }
    items.push('-', ['settings', 'Rename', () => void rename(node)], ['folder-01', 'Move', () => void move(node)], ['copy', 'Copy', () => void copy(node)], ['shield', 'Permissions', () => void chmod(node)]);
    items.push(['archive-01', 'Archive', () => void archive(node)]);
    items.push('-', ['x', 'Delete', () => void remove(node), true]);
    const m = el('div', 'menu');
    for (const it of items) {
      if (it === '-') { m.appendChild(el('div', 'sep')); continue; }
      const b = el('button', it[3] ? 'bad' : '', hero(it[0], 's'));
      b.setAttribute('type', 'button');
      b.appendChild(document.createTextNode(it[1]));
      b.addEventListener('click', () => { closeMenu(); it[2](); });
      m.appendChild(b);
    }
    menu = el('div', 'pop');
    menu.appendChild(m);
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  }
  document.addEventListener('click', (e) => { if (menu && !(e.target as HTMLElement).closest('.pop')) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // ---------- events ----------
  const targetDir = () => selectedDir;

  tree.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const node = t.closest<HTMLElement>('.tn, .leaf');
    if (!node || !node.dataset['path']) return;
    const rect = t.closest('[data-more]');
    if (rect) { const r = rect.getBoundingClientRect(); openMenu(node, r.left, r.bottom + 4); ev.stopPropagation(); return; }
    if ((ev as MouseEvent).ctrlKey || (ev as MouseEvent).metaKey) { toggleSelect(node); return; }
    if (selected.size) clearSelection();
    if (node.dataset['file'] === '1') {
      selectedDir = parentOf(node.dataset['path']);
      const size = Number(node.dataset['size']);
      const editable = size <= MAX_EDIT && (TEXT_EXT.test(node.dataset['name']!) || (node.dataset['mime'] || '').startsWith('text/'));
      if (editable) void openFile(node.dataset['path']);
      else toast('Not editable here. Use the menu to download it.', 'info');
    } else if (t.closest('.tr0')) {
      selectedDir = node.dataset['path'];
      void toggle(node);
    }
  });
  tree.addEventListener('contextmenu', (ev) => {
    const node = (ev.target as HTMLElement).closest<HTMLElement>('.tn, .leaf');
    if (!node?.dataset['path']) return;
    ev.preventDefault();
    openMenu(node, ev.clientX, ev.clientY);
  });

  tabsEl.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const close = t.closest<HTMLElement>('[data-close]');
    if (close) { void closeTab(close.dataset['close']!); return; }
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) { active = tab.dataset['tab']!; renderTabs(); editor?.show(active); markActive(); editor?.focus(); }
  });

  host.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-fm]');
    if (!b) return;
    switch (b.dataset['fm']) {
      case 'newfile': void newFile(targetDir()); break;
      case 'newdir': void newDir(targetDir()); break;
      case 'pull': void pull(targetDir()); break;
      case 'save': if (active) void save(active); break;
      case 'bulk-archive': void bulkArchive(); break;
      case 'bulk-delete': void bulkDelete(); break;
      case 'refresh': void loadDir('/').then(() => { selectedDir = '/'; }).catch(fail); break;
    }
  });
  host.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    if (input.id === 'fmUpload' && input.files?.length) void upload(targetDir(), input.files).finally(() => { input.value = ''; });
  });

  // Drop files on the tree to upload them: onto a folder, or into the selected folder.
  tree.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); tree.classList.add('drop-on'); } });
  tree.addEventListener('dragleave', () => tree.classList.remove('drop-on'));
  tree.addEventListener('drop', (e) => {
    e.preventDefault();
    tree.classList.remove('drop-on');
    if (!e.dataTransfer?.files.length) return;
    const folder = (e.target as HTMLElement).closest<HTMLElement>('.tn');
    void upload(folder?.dataset['path'] ?? targetDir(), e.dataTransfer.files);
  });

  renderTabs();
  return {
    open() {
      if (loaded) return;
      loaded = true;
      void loadDir('/').catch((e) => { loaded = false; tree.replaceChildren(el('div', 'alert bad', `<div><b>Could not load files</b></div>`)); fail(e); });
    },
  };
}
