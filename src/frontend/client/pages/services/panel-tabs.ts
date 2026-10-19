/** Backups, Network, Startup and Settings tabs. All data goes through /api/v1/services/:id/*, never to the panel directly. */
import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatBytes } from '../../../core/utils/formatting.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, toast } from '../../../petal/index.js';
import { confirmDialog, formDialog } from './dialog.js';

type Tab = { open(): void };
const fail = (e: any) => toast(e?.message || 'Request failed', 'bad');
const copy = (v: string, label: string) => `<span class="cpf"><code>${esc(v)}</code><button class="ib xs" type="button" data-copy="${esc(v)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${hero('copy', 'xs')}</button></span>`;
// An unknown outcome (the panel did not answer in time) is shown as pending, never as success or as a failure to retry.
const sendJson = async (url: string, method: string, body?: unknown) => {
  const result = await api<{ pending?: boolean }>(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (result?.pending) toast('The panel did not answer in time. The change may still be applied; check again shortly before repeating it.', 'info');
  return result;
};
const empty = (title: string) => `<div class="es"><span class="tile neu lg">${hero('shield')}</span><h4>${esc(title)}</h4></div>`;
const iconBtn = (attr: string, icon: string, tip: string) => `<button class="btn s sq ghost" type="button" ${attr} data-tip="${esc(tip)}" data-pos="bottom" aria-label="${esc(tip)}">${hero(icon, 's')}</button>`;

function lazy(host: HTMLElement | null, load: (h: HTMLElement) => Promise<void>): Tab {
  let loaded = false;
  return { open() { if (host && !loaded) { loaded = true; void load(host).catch((e) => { loaded = false; fail(e); }); } } };
}

// ---------------- Backups ----------------
interface Backup { uuid: string; name: string; bytes: number; createdAt: string; completedAt: string | null; successful: boolean; locked: boolean }

export function initBackups(serviceId: string): Tab {
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}/backups`;
  const host = document.getElementById('dtlBackupsBody');
  async function render(h: HTMLElement) {
    h.innerHTML = '<div class="sk" role="status" aria-label="Loading backups"><i></i><i></i></div>';
    const res = await api.get<{ backups: Backup[]; limit: number | null }>(base);
    h.innerHTML = `<section class="card server-tool-create">
        <div class="ch"><div class="tx"><h3>Create backup</h3><p>Capture the current server files before a risky change.</p></div><span class="pill ${res.limit !== null && res.backups.length >= res.limit ? 'warn' : 'info'}">${res.limit === null ? `${res.backups.length} stored` : `${res.backups.length} of ${res.limit}`}</span></div>
        <div class="server-tool-form">
          <div class="fld"><label for="bkName">Backup name</label><div class="inp"><input id="bkName" placeholder="Automatic name when left empty" maxlength="191"></div></div>
          <div class="fld"><label for="bkIgnore">Ignored files</label><div class="inp"><input id="bkIgnore" placeholder="Optional paths, one per line" maxlength="4096"></div></div>
          <button class="btn pri" type="button" data-bk="create">${hero('plus', 'xs')}Create backup</button>
        </div>
      </section>
      ${res.backups.length ? `<div class="col server-tool-list">${res.backups.map((b) => {
        const pending = !b.completedAt;
        const tone = pending ? 'warn' : b.successful ? 'good' : 'bad';
        const status = pending ? 'In progress' : b.successful ? 'Completed' : 'Failed';
        return `<section class="card server-tool-card" data-uuid="${esc(b.uuid)}">
          <div class="ch"><span class="tile ${tone}">${hero('archive-01')}</span><div class="tx"><h3>${esc(b.name)}</h3><p>${esc(formatDate(b.createdAt))}</p></div><span class="pill ${tone} d">${status}</span>${b.locked ? '<span class="pill info">Locked</span>' : ''}</div>
          <div class="server-tool-facts"><div><small>Size</small><b>${esc(formatBytes(b.bytes))}</b></div><div><small>Backup ID</small><code>${esc(b.uuid.slice(0, 12))}</code></div><div><small>Protection</small><b>${b.locked ? 'Deletion locked' : 'Unlocked'}</b></div></div>
          <div class="server-tool-actions">
            ${b.successful && !pending ? `<button class="btn s" type="button" data-bk="download">${hero('arrow', 'xs')}Download</button>` : ''}
            <button class="btn s" type="button" data-bk="lock">${hero('shield', 'xs')}${b.locked ? 'Unlock' : 'Lock'}</button>
            ${b.successful && !pending ? `<button class="btn s" type="button" data-bk="restore">${hero('refresh', 'xs')}Restore</button>` : ''}
            <button class="btn s bad" type="button" data-bk="delete">${hero('x', 'xs')}Delete</button>
          </div>
        </section>`;
      }).join('')}</div>` : empty('No backups')}`;
  }
  const t = lazy(host, render);
  host?.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-bk]');
    if (!btn || !host) return;
    const uuid = btn.closest<HTMLElement>('[data-uuid]')?.dataset['uuid'];
    try {
      switch (btn.dataset['bk']) {
        case 'create':
          await sendJson(base, 'POST', { name: (document.getElementById('bkName') as HTMLInputElement).value.trim(), ignored: (document.getElementById('bkIgnore') as HTMLInputElement).value.trim() });
          toast('Backup started', 'good'); break;
        case 'download': window.location.assign((await api.get<{ url: string }>(`${base}/${uuid}/download-url`)).url); return;
        case 'lock': await sendJson(`${base}/${uuid}/lock`, 'POST'); break;
        case 'restore': {
          if (!(await confirmDialog({ title: 'Restore this backup? The server must be offline.', confirmLabel: 'Confirm', danger: true }))) return;
          const truncate = await confirmDialog({ title: 'Delete current files first?', message: 'Confirm to wipe the server files before restoring. Cancel keeps the existing files and restores over them.', confirmLabel: 'Wipe first', danger: true });
          await sendJson(`${base}/${uuid}/restore`, 'POST', { truncate, confirm: true });
          toast('Restore started', 'good'); return;
        }
        case 'delete':
          if (!(await confirmDialog({ title: 'Delete this backup? This cannot be undone.', confirmLabel: 'Confirm', danger: true }))) return;
          await sendJson(`${base}/${uuid}`, 'DELETE', { confirm: true }); break;
      }
      await render(host);
    } catch (e) { fail(e); }
  });
  return t;
}

// ---------------- Network ----------------
interface Alloc { id: number; ip: string; alias: string | null; port: number; notes: string; primary: boolean }

export function initNetwork(serviceId: string): Tab {
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}/network`;
  const host = document.getElementById('dtlNetworkBody');
  async function render(h: HTMLElement) {
    const res = await api.get<{ allocations: Alloc[] }>(base);
    h.innerHTML = `<div class="server-tool-heading"><div><h3>Network allocations</h3><p>Addresses and ports assigned by the infrastructure provider.</p></div><button class="btn s" type="button" data-net="assign">${hero('plus', 'xs')}Add port</button></div>
      ${res.allocations.length ? `<div class="col server-tool-list">${res.allocations.map((a) => `<section class="card server-tool-card" data-id="${a.id}">
        <div class="ch"><span class="tile ${a.primary ? 'good' : 'neu'}">${hero('server')}</span><div class="tx"><h3>${esc(a.alias || a.ip)}:${a.port}</h3><p>Allocation #${a.id}</p></div>${a.primary ? '<span class="pill good d">Primary</span>' : '<span class="pill">Additional</span>'}</div>
        <div class="server-tool-form network-tool-form">
          <div class="fld"><span class="lbl">Connection address</span>${copy(`${a.alias || a.ip}:${a.port}`, 'address')}</div>
          <div class="fld"><label for="netNotes_${a.id}">Notes</label><div class="inp"><input id="netNotes_${a.id}" data-notes value="${esc(a.notes)}" maxlength="191" placeholder="What uses this port?"></div></div>
        </div>
        ${a.primary ? '' : `<div class="server-tool-actions"><button class="btn s" type="button" data-net="primary">${hero('check', 'xs')}Make primary</button><button class="btn s bad" type="button" data-net="remove">${hero('x', 'xs')}Remove port</button></div>`}
      </section>`).join('')}</div>` : empty('No ports')}`;
  }
  const t = lazy(host, render);
  host?.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-net]');
    if (!btn || !host) return;
    const id = btn.closest<HTMLElement>('[data-id]')?.dataset['id'];
    try {
      switch (btn.dataset['net']) {
        case 'assign': await sendJson(base, 'POST'); break;
        case 'primary': await sendJson(`${base}/${id}/primary`, 'POST'); break;
        case 'remove': if (!(await confirmDialog({ title: 'Remove this port?', confirmLabel: 'Confirm', danger: true }))) return; await sendJson(`${base}/${id}`, 'DELETE', { confirm: true }); break;
      }
      await render(host);
    } catch (e) { fail(e); }
  });
  host?.addEventListener('change', async (ev) => {
    const input = ev.target as HTMLInputElement;
    if (!input.matches('[data-notes]')) return;
    const id = input.closest<HTMLElement>('[data-id]')?.dataset['id'];
    try { await sendJson(`${base}/${id}`, 'PATCH', { notes: input.value }); toast('Saved', 'good'); } catch (e) { fail(e); }
  });
  return t;
}

// ---------------- Startup ----------------
interface Variable { key: string; name: string; description: string; value: string; editable: boolean; rules: string }

export function initStartup(serviceId: string): Tab {
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}`;
  const host = document.getElementById('dtlStartupBody');
  async function render(h: HTMLElement) {
    const [st, se] = await Promise.all([
      api.get<{ command: string; images: Record<string, string>; variables: Variable[] }>(`${base}/startup`),
      api.get<{ image: string }>(`${base}/settings`),
    ]);
    const images = Object.entries(st.images);
    h.innerHTML = `<div class="col" style="gap:18px">
      <div class="fld"><label>Startup command</label><pre class="mono" style="margin:0;padding:12px 14px;border-radius:14px;background:var(--s2);white-space:pre-wrap;word-break:break-all;font-size:12.5px">${esc(st.command)}</pre></div>
      ${images.length > 1 ? `<div class="fld"><label for="stImage">Docker image</label><div class="inp sel"><select id="stImage">${images.map(([label, img]) => `<option value="${esc(img)}" ${img === se.image ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div></div>` : ''}
      ${st.variables.map((v) => `<div class="fld"><label for="v_${esc(v.key)}">${esc(v.name)} <small class="faint">${esc(v.key)}</small></label>
        <div class="inp"><input id="v_${esc(v.key)}" data-var="${esc(v.key)}" value="${esc(v.value)}" ${v.editable ? '' : 'disabled'} maxlength="4096"></div>
        ${v.description ? `<small class="faint">${esc(v.description)}</small>` : ''}</div>`).join('')}
    </div>`;
  }
  const t = lazy(host, render);
  host?.addEventListener('change', async (ev) => {
    const el = ev.target as HTMLInputElement | HTMLSelectElement;
    try {
      if (el.id === 'stImage') { await sendJson(`${base}/startup/image`, 'PUT', { image: el.value }); toast('Docker image changed. Restart the server to apply it.', 'good'); }
      else if (el.dataset['var']) { await sendJson(`${base}/startup/variable`, 'PUT', { key: el.dataset['var'], value: el.value }); toast('Saved', 'good'); }
    } catch (e) { fail(e); if (host) await render(host).catch(() => undefined); }
  });
  return t;
}

// ---------------- Settings ----------------
interface GameAdministrationStatus {
  gameIdentity: string; detectionSource: string; effectiveProtocol: string; supportedMethods: string[]; selectedMethod: string;
  state: string; administrationHost: string | null; administrationPort: number | null; credentialsConfigured: boolean;
  configurationSource: string; lastSuccessfulTestAt: string | null; restartRequired: boolean; message: string;
}

export function initSettings(serviceId: string): Tab {
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}/settings`;
  const adminBase = `/api/v1/services/${encodeURIComponent(serviceId)}/game-administration`;
  const host = document.getElementById('dtlSettingsBody');
  async function render(h: HTMLElement) {
    const [s, admin] = await Promise.all([
      api.get<{ name: string; description: string; uuid: string; node: string; identifier: string; sftp: { host: string; port: number; username: string | null } }>(base),
      api.get<{ status: GameAdministrationStatus }>(adminBase),
    ]);
    const a = admin.status;
    const hasRcon = a.supportedMethods.includes('RCON');
    const automaticUsesRcon = a.effectiveProtocol.endsWith('_RCON');
    const showRcon = a.selectedMethod === 'RCON' || (a.selectedMethod === 'AUTOMATIC' && automaticUsesRcon);
    const statusTone = a.state === 'CONNECTED' || a.state === 'AVAILABLE' ? 'good' : a.state === 'UNSUPPORTED' ? 'bad' : 'warn';
    h.innerHTML = `<div class="g g2" style="align-items:start">
      <section class="card"><div class="ch"><div class="tx"><h3>Details</h3></div></div>
        <div class="col" style="gap:12px">
          <div class="fld"><label for="setName">Server name</label><div class="inp"><input id="setName" maxlength="191" value="${esc(s.name)}"></div></div>
          <div class="fld"><label for="setDesc">Description</label><div class="inp"><input id="setDesc" maxlength="191" value="${esc(s.description)}"></div></div>
          <div><button class="btn s pri" type="button" data-set="rename">Save</button></div>
        </div></section>
      <section class="card"><div class="ch"><div class="tx"><h3>SFTP</h3></div></div>
        <dl class="kv"><dt>Host</dt><dd>${copy(s.sftp.host, 'SFTP host')}</dd><dt>Port</dt><dd>${copy(String(s.sftp.port), 'SFTP port')}</dd>${s.sftp.username ? `<dt>Username</dt><dd>${copy(s.sftp.username, 'SFTP username')}</dd>` : ''}</dl></section>
      <section class="card" style="grid-column:1/-1"><div class="ch"><span class="tile ${statusTone}">${hero('settings')}</span><div class="tx"><h3>Game Administration / RCON</h3><p>${esc(a.message)}</p></div><span class="pill ${statusTone} d">${esc(a.state.toLowerCase().replaceAll('_', ' '))}</span></div>
        <div class="g g2">
          <dl class="kv"><dt>Detected game</dt><dd>${esc(a.gameIdentity)}</dd><dt>Transport</dt><dd>${esc(a.effectiveProtocol.replaceAll('_', ' '))}</dd><dt>Detection</dt><dd>${esc(a.detectionSource.replaceAll('_', ' ').toLowerCase())}</dd><dt>Configuration source</dt><dd>${esc(a.configurationSource.replaceAll('_', ' ').toLowerCase())}</dd>${a.administrationHost ? `<dt>Trusted host</dt><dd>${esc(a.administrationHost)}</dd>` : ''}<dt>Last connected</dt><dd>${a.lastSuccessfulTestAt ? esc(formatDate(a.lastSuccessfulTestAt)) : 'Not tested'}</dd></dl>
          <div class="col" style="gap:12px">
            <div class="fld"><label for="gaMethod">Connection method</label><div class="inp sel"><select id="gaMethod" data-auto-rcon="${automaticUsesRcon}">${a.supportedMethods.map((m) => `<option value="${esc(m)}" ${m === a.selectedMethod ? 'selected' : ''}>${esc(m === 'AUTOMATIC' ? 'Automatic' : m === 'NATIVE_CONSOLE' ? 'Native Console' : 'RCON')}</option>`).join('')}</select></div></div>
            ${hasRcon ? `<div id="gaRconFields" class="col" style="gap:12px" ${showRcon ? '' : 'hidden'}><div class="fld"><label for="gaPort">Administration port</label><div class="inp"><input id="gaPort" type="number" min="1" max="65535" value="${a.administrationPort ?? ''}" placeholder="Allocated RCON port"></div><small class="hint">Must be an allocation assigned in Network. The host cannot be changed.</small></div>
            <div class="fld"><label for="gaPassword">RCON password</label><div class="inp"><input id="gaPassword" type="password" maxlength="191" autocomplete="new-password" placeholder="${a.credentialsConfigured ? 'Configured — leave blank to keep it' : 'Set a strong password'}"></div><small class="hint">The existing password is never returned to the browser.</small></div>
            <label class="row nw"><input id="gaSync" type="checkbox"> Write supported changes to the game configuration</label></div><div id="gaNativeHint" class="alert info" ${showRcon ? 'hidden' : ''}><div><b>RCON is not needed</b><span>Automatic mode uses the authorized native console when the game supports it.</span></div></div>` : '<div class="alert info"><div><b>RCON is not needed</b><span>Fortless uses the authorized Pterodactyl console for this server.</span></div></div>'}
            ${a.restartRequired ? '<div class="alert warn"><div><b>Restart required</b><span>Configuration was written, but Fortless will not restart the server without your explicit action.</span></div></div>' : ''}
          </div>
        </div>
        <div class="row" style="margin-top:16px"><button class="btn s pri" type="button" data-set="admin-save">Save configuration</button><button class="btn s" type="button" data-set="admin-test">Test connection</button><button class="btn s" type="button" data-set="admin-detect">Refresh detection</button><button class="btn s ghost" type="button" data-set="admin-reset">Reset to automatic</button></div>
      </section>
      <section class="card"><div class="ch"><div class="tx"><h3>Debug information</h3></div></div>
        <dl class="kv"><dt>Node</dt><dd>${esc(s.node || '—')}</dd><dt>Server ID</dt><dd>${copy(s.identifier, 'server ID')}</dd><dt>UUID</dt><dd>${copy(s.uuid, 'UUID')}</dd></dl></section>
      <section class="card"><div class="ch"><div class="tx"><h3>Reinstall</h3><p>Runs the install script again. Files may be overwritten.</p></div></div>
        <button class="btn s badt" type="button" data-set="reinstall">${hero('refresh', 'xs')}Reinstall server</button></section>
    </div>`;
  }
  const t = lazy(host, render);
  host?.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-set]');
    if (!btn) return;
    try {
      if (btn.dataset['set'] === 'rename') {
        await sendJson(`${base}/rename`, 'POST', { name: (document.getElementById('setName') as HTMLInputElement).value, description: (document.getElementById('setDesc') as HTMLInputElement).value });
        toast('Saved', 'good');
      } else if (btn.dataset['set'] === 'reinstall') {
        if (!(await confirmDialog({ title: 'Reinstall this server? The server will be stopped and the install script will run again.', confirmLabel: 'Confirm', danger: true }))) return;
        await sendJson(`${base}/reinstall`, 'POST', { confirm: true });
        toast('Reinstall started', 'good');
      } else if (btn.dataset['set'] === 'admin-save') {
        const result = await sendJson(adminBase, 'PUT', {
          method: (document.getElementById('gaMethod') as HTMLSelectElement).value,
          port: (document.getElementById('gaPort') as HTMLInputElement | null)?.value || null,
          password: (document.getElementById('gaPassword') as HTMLInputElement | null)?.value || '',
          syncToServer: (document.getElementById('gaSync') as HTMLInputElement | null)?.checked === true,
        });
        toast((result as any)?.recoveryFile ? `Saved. Recovery copy: ${(result as any).recoveryFile}. Restart when ready.` : 'Game administration saved', 'good');
        if (host) await render(host);
      } else if (btn.dataset['set'] === 'admin-test') {
        await sendJson(`${adminBase}/test`, 'POST'); toast('Connection test passed', 'good'); if (host) await render(host);
      } else if (btn.dataset['set'] === 'admin-detect') {
        await sendJson(`${adminBase}/detect`, 'POST'); toast('Detection refreshed', 'good'); if (host) await render(host);
      } else if (btn.dataset['set'] === 'admin-reset') {
        await sendJson(adminBase, 'DELETE'); toast('Automatic detection restored', 'good'); if (host) await render(host);
      }
    } catch (e) { fail(e); }
  });
  host?.addEventListener('change', (ev) => {
    const target = ev.target as HTMLSelectElement;
    if (target.id !== 'gaMethod') return;
    const rcon = target.value === 'RCON' || (target.value === 'AUTOMATIC' && target.dataset['autoRcon'] === 'true');
    const fields = document.getElementById('gaRconFields');
    const hint = document.getElementById('gaNativeHint');
    if (fields) fields.hidden = !rcon;
    if (hint) hint.hidden = rcon;
  });
  return t;
}

// ---------------- Users (sharing) ----------------
interface Member { id: string; name: string; email: string; preset: string; createdAt: string }
interface Invite { id: string; email: string; preset: string; expiresAt: string; createdAt: string }
const PRESETS: Array<[string, string]> = [['viewer', 'View only'], ['operator', 'Operator'], ['admin', 'Full access']];
const presetSelect = (id: string, value: string, attr = '') =>
  `<div class="inp sel s"><select ${id ? `id="${id}"` : ''} ${attr}>${PRESETS.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;

export function initUsers(serviceId: string): Tab {
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}`;
  const host = document.getElementById('dtlUsersBody');
  async function render(h: HTMLElement) {
    const res = await api.get<{ members: Member[]; invitations: Invite[] }>(`${base}/members`);
    h.innerHTML = `<div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <div class="inp s pill" style="flex:1;min-width:200px">${hero('mail-01', 's')}<input id="usrEmail" type="email" placeholder="Email address" autocomplete="off" aria-label="Email address"></div>
        ${presetSelect('usrPreset', 'operator')}
        <button class="btn s pri" type="button" data-usr="invite">${hero('plus', 'xs')}Invite</button>
      </div>
      ${res.invitations.length ? `<div class="faint" style="font-weight:700;font-size:12.5px;margin:6px 0">Pending</div><div class="col" style="margin-bottom:14px">${res.invitations.map((i) => `<div class="li h" style="padding:10px 14px" data-iid="${esc(i.id)}">
        <span class="tile warn sm">${hero('mail-01')}</span><span class="tx"><b>${esc(i.email)}</b><small>${esc(PRESETS.find(([v]) => v === i.preset)?.[1] ?? i.preset)} · expires ${esc(formatDate(i.expiresAt))}</small></span>
        ${iconBtn('data-usr="revoke"', 'x', 'Revoke')}</div>`).join('')}</div>` : ''}
      ${res.members.length ? `<div class="col">${res.members.map((m) => `<div class="li h" style="padding:10px 14px" data-mid="${esc(m.id)}">
        <span class="tile info sm">${hero('users')}</span><span class="tx"><b>${esc(m.name)}</b><small>${esc(m.email)}</small></span>
        ${presetSelect('', m.preset, 'data-usr-preset')}${iconBtn('data-usr="remove"', 'x', 'Remove access')}</div>`).join('')}</div>` : (res.invitations.length ? '' : empty('Not shared with anyone'))}`;
  }
  const t = lazy(host, render);
  host?.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-usr]');
    if (!btn || !host || btn.matches('select')) return;
    try {
      switch (btn.dataset['usr']) {
        case 'invite': {
          const email = (document.getElementById('usrEmail') as HTMLInputElement).value.trim();
          if (!email) return;
          await sendJson(`${base}/members/invite`, 'POST', { email, preset: (document.getElementById('usrPreset') as HTMLSelectElement).value });
          toast('Invitation sent', 'good'); break;
        }
        case 'revoke': await sendJson(`${base}/invitations/${btn.closest<HTMLElement>('[data-iid]')?.dataset['iid']}`, 'DELETE'); break;
        case 'remove':
          if (!(await confirmDialog({ title: "Remove this person's access?", confirmLabel: 'Remove', danger: true }))) return;
          await sendJson(`${base}/members/${btn.closest<HTMLElement>('[data-mid]')?.dataset['mid']}`, 'DELETE'); break;
      }
      await render(host);
    } catch (e) { fail(e); }
  });
  host?.addEventListener('change', async (ev) => {
    const sel = ev.target as HTMLSelectElement;
    if (!sel.matches('[data-usr-preset]')) return;
    try { await sendJson(`${base}/members/${sel.closest<HTMLElement>('[data-mid]')?.dataset['mid']}`, 'PATCH', { preset: sel.value }); toast('Access updated', 'good'); }
    catch (e) { fail(e); if (host) await render(host).catch(() => undefined); }
  });
  return t;
}

// ---------------- Databases ----------------
interface Db { id: string; name: string; username: string; host: string; connectionsFrom: string; password: string | null }

export function initDatabases(serviceId: string): Tab {
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}/databases`;
  const host = document.getElementById('dtlDatabasesBody');
  async function render(h: HTMLElement) {
    const res = await api.get<{ databases: Db[] }>(base);
    h.innerHTML = `<section class="card server-tool-create">
        <div class="ch"><div class="tx"><h3>Databases</h3><p>${res.databases.length} configured · credentials stay hidden until you need them.</p></div><button class="btn s pri" type="button" data-db="new" aria-expanded="false">${hero('plus', 'xs')}New database</button></div>
        <div class="server-tool-form" data-db-create hidden>
          <div class="fld"><label for="dbName">Database name</label><div class="inp"><input id="dbName" placeholder="example_data" maxlength="48"></div></div>
          <div class="fld"><label for="dbRemote">Allowed connections</label><div class="inp"><input id="dbRemote" placeholder="% allows any host" maxlength="191"></div><small class="hint">Use a specific address whenever possible.</small></div>
          <button class="btn pri" type="button" data-db="create">${hero('plus', 'xs')}Create database</button>
        </div>
      </section>
      ${res.databases.length ? `<div class="col server-tool-list">${res.databases.map((d) => `<section class="card server-tool-card" data-did="${esc(d.id)}">
        <div class="ch"><span class="tile violet">${hero('database')}</span><div class="tx"><h3>${esc(d.name)}</h3><p>${esc(d.username)} · connections from ${esc(d.connectionsFrom)}</p></div><button class="btn s sec" type="button" data-db="details" aria-expanded="false">${hero('database', 'xs')}Show connection details</button></div>
        <div class="server-tool-details" data-db-details hidden>
          <div class="fld"><span class="lbl">Host</span>${copy(d.host, 'host')}</div>
          <div class="fld"><span class="lbl">Username</span>${copy(d.username, 'username')}</div>
          ${d.password ? `<div class="fld"><span class="lbl">Password</span>${copy(d.password, 'password')}</div><div class="fld server-tool-wide"><span class="lbl">JDBC connection string</span>${copy(`jdbc:mysql://${d.host}/${d.name}?user=${d.username}&password=${d.password}`, 'JDBC address')}</div>` : '<div class="alert warn server-tool-wide"><div><b>Password unavailable</b><span>Rotate the password to request a new credential from the panel.</span></div></div>'}
          <div class="server-tool-actions server-tool-wide"><button class="btn s" type="button" data-db="rotate">${hero('refresh', 'xs')}Rotate password</button><button class="btn s bad" type="button" data-db="delete">${hero('x', 'xs')}Delete database</button></div>
        </div>
      </section>`).join('')}</div>` : empty('No databases')}`;
  }
  const t = lazy(host, render);
  host?.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-db]');
    if (!btn || !host) return;
    if (btn.dataset['db'] === 'new') {
      const form = host.querySelector<HTMLElement>('[data-db-create]');
      if (!form) return;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.innerHTML = `${hero(expanded ? 'plus' : 'x', 'xs')}${expanded ? 'New database' : 'Cancel'}`;
      form.hidden = expanded;
      if (!expanded) window.setTimeout(() => (document.getElementById('dbName') as HTMLInputElement | null)?.focus(), 0);
      return;
    }
    if (btn.dataset['db'] === 'details') {
      const details = btn.closest<HTMLElement>('[data-did]')?.querySelector<HTMLElement>('[data-db-details]');
      if (!details) return;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.innerHTML = `${hero('database', 'xs')}${expanded ? 'Show' : 'Hide'} connection details`;
      details.hidden = expanded;
      return;
    }
    const id = btn.closest<HTMLElement>('[data-did]')?.dataset['did'];
    try {
      switch (btn.dataset['db']) {
        case 'create': await sendJson(base, 'POST', { name: (document.getElementById('dbName') as HTMLInputElement).value.trim(), remote: (document.getElementById('dbRemote') as HTMLInputElement).value.trim() }); break;
        case 'rotate': if (!(await confirmDialog({ title: 'Rotate the password? Anything using the old one will stop working.', confirmLabel: 'Confirm', danger: true }))) return; await sendJson(`${base}/${id}/rotate`, 'POST'); toast('Password rotated', 'good'); break;
        case 'delete': if (!(await confirmDialog({ title: 'Delete this database and all its data?', confirmLabel: 'Confirm', danger: true }))) return; await sendJson(`${base}/${id}`, 'DELETE'); break;
      }
      await render(host);
    } catch (e) { fail(e); }
  });
  return t;
}

// ---------------- Schedules ----------------
interface Task { id: number; sequence: number; action: string; payload: string; offset: number; continueOnFailure: boolean }
interface Schedule { id: number; name: string; cron: { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string }; active: boolean; processing: boolean; onlyWhenOnline: boolean; lastRunAt: string | null; nextRunAt: string | null; tasks: Task[] }

export function initSchedules(serviceId: string): Tab {
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}/schedules`;
  const host = document.getElementById('dtlSchedulesBody');
  const cronInput = (k: string, label: string, v: string) => `<div class="fld" style="min-width:90px;flex:1"><label for="sc_${k}">${label}</label><div class="inp s"><input id="sc_${k}" data-cron="${k}" value="${esc(v)}" maxlength="64" class="mono"></div></div>`;
  const form = (sc?: Schedule) => `<div class="card" data-form="${sc?.id ?? 'new'}" style="margin-bottom:14px"><div class="col" style="gap:12px">
      <div class="fld"><label for="sc_name">Name</label><div class="inp s"><input id="sc_name" maxlength="191" value="${esc(sc?.name ?? '')}"></div></div>
      <div class="row" style="gap:10px;flex-wrap:wrap">${cronInput('minute', 'Minute', sc?.cron.minute ?? '*/5')}${cronInput('hour', 'Hour', sc?.cron.hour ?? '*')}${cronInput('dayOfMonth', 'Day of month', sc?.cron.dayOfMonth ?? '*')}${cronInput('month', 'Month', sc?.cron.month ?? '*')}${cronInput('dayOfWeek', 'Day of week', sc?.cron.dayOfWeek ?? '*')}</div>
      <label class="row nw" style="gap:8px"><input type="checkbox" id="sc_active" ${sc?.active === false ? '' : 'checked'}> Active</label>
      <label class="row nw" style="gap:8px"><input type="checkbox" id="sc_online" ${sc?.onlyWhenOnline ? 'checked' : ''}> Only when the server is online</label>
      <div class="row" style="gap:8px"><button class="btn s pri" type="button" data-sc="save">${sc ? 'Save' : 'Create schedule'}</button><button class="btn s sec" type="button" data-sc="cancel">Cancel</button></div>
    </div></div>`;
  async function render(h: HTMLElement, editing?: number | 'new') {
    const res = await api.get<{ schedules: Schedule[] }>(base);
    h.innerHTML = `<div class="row" style="justify-content:flex-end;margin-bottom:14px"><button class="btn s sec" type="button" data-sc="new">${hero('plus', 'xs')}New schedule</button></div>
      ${editing === 'new' ? form() : ''}
      ${res.schedules.length ? `<div class="col" style="gap:12px">${res.schedules.map((sc) => editing === sc.id ? form(sc) : `<section class="card" data-sid="${sc.id}">
        <div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div class="tx"><div class="row" style="gap:8px"><b>${esc(sc.name)}</b><span class="pill ${sc.active ? 'good' : 'neu'}">${sc.active ? 'Active' : 'Paused'}</span></div>
            <small class="mono">${esc(`${sc.cron.minute} ${sc.cron.hour} ${sc.cron.dayOfMonth} ${sc.cron.month} ${sc.cron.dayOfWeek}`)}</small>
            <small class="faint">${sc.nextRunAt ? `Next ${esc(formatDate(sc.nextRunAt))}` : ''}${sc.lastRunAt ? ` · Last ${esc(formatDate(sc.lastRunAt))}` : ''}</small></div>
          <div class="btngroup">${iconBtn('data-sc="run"', 'play', 'Run now')}${iconBtn('data-sc="edit"', 'settings', 'Edit')}${iconBtn('data-sc="delete"', 'x', 'Delete')}</div>
        </div>
        <div class="col" style="gap:6px;margin-top:12px">${sc.tasks.map((t) => `<div class="li h" style="padding:8px 12px" data-tid="${t.id}"><span class="tx"><b>${esc(t.action)}</b><small class="mono">${esc(t.payload || '(no payload)')} · +${t.offset}s${t.continueOnFailure ? ' · continue on failure' : ''}</small></span><div class="btngroup">${iconBtn('data-sc="edittask" data-task=\'' + esc(JSON.stringify(t)) + '\'', 'settings', 'Edit task')}${iconBtn('data-sc="deltask"', 'x', 'Remove task')}</div></div>`).join('')}
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <div class="inp sel s"><select data-task-action><option value="command">Send command</option><option value="power">Power action</option><option value="backup">Create backup</option></select></div>
            <div class="inp s pill" style="flex:1;min-width:140px"><input data-task-payload placeholder="Command, start/stop/restart/kill, or ignored files" maxlength="1000" aria-label="Task payload"></div>
            <div class="inp s pill" style="width:110px"><input data-task-offset type="number" min="0" max="900" value="0" aria-label="Delay in seconds"></div>
            <button class="btn s sec" type="button" data-sc="addtask">${hero('plus', 'xs')}Add task</button>
          </div></div>
      </section>`).join('')}</div>` : (editing ? '' : empty('No schedules'))}`;
  }
  const t = lazy(host, (h) => render(h));
  host?.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-sc]');
    if (!btn || !host) return;
    const card = btn.closest<HTMLElement>('[data-sid]');
    const sid = card?.dataset['sid'];
    try {
      switch (btn.dataset['sc']) {
        case 'new': await render(host, 'new'); return;
        case 'cancel': await render(host); return;
        case 'edit': await render(host, Number(sid)); return;
        case 'save': {
          const f = btn.closest<HTMLElement>('[data-form]')!;
          const body: Record<string, unknown> = { name: (document.getElementById('sc_name') as HTMLInputElement).value, active: (document.getElementById('sc_active') as HTMLInputElement).checked, onlyWhenOnline: (document.getElementById('sc_online') as HTMLInputElement).checked };
          f.querySelectorAll<HTMLInputElement>('[data-cron]').forEach((i) => { body[i.dataset['cron']!] = i.value.trim(); });
          await sendJson(f.dataset['form'] === 'new' ? base : `${base}/${f.dataset['form']}`, 'POST', body); toast('Saved', 'good'); break;
        }
        case 'run': await sendJson(`${base}/${sid}/execute`, 'POST'); toast('Schedule started', 'good'); break;
        case 'delete': if (!(await confirmDialog({ title: 'Delete this schedule and its tasks?', confirmLabel: 'Confirm', danger: true }))) return; await sendJson(`${base}/${sid}`, 'DELETE'); break;
        case 'edittask': {
          const t = JSON.parse(btn.dataset['task'] || '{}') as Task;
          const v = await formDialog({
            title: 'Edit task', confirmLabel: 'Save',
            fields: [
              { key: 'action', label: 'Action', type: 'select', value: t.action, options: [['command', 'Send command'], ['power', 'Power action'], ['backup', 'Create backup']] },
              { key: 'payload', label: 'Payload', value: t.payload },
              { key: 'offset', label: 'Delay (seconds)', type: 'number', value: String(t.offset), min: 0, max: 900 },
              { key: 'continueOnFailure', label: 'Continue if this task fails', type: 'checkbox', value: String(t.continueOnFailure) },
            ],
          });
          if (!v) return;
          await sendJson(`${base}/${sid}/tasks/${t.id}`, 'POST', { action: v['action'], payload: v['payload'], offset: Number(v['offset'] || 0), continueOnFailure: v['continueOnFailure'] === true });
          break;
        }
        case 'deltask': await sendJson(`${base}/${sid}/tasks/${btn.closest<HTMLElement>('[data-tid]')?.dataset['tid']}`, 'DELETE'); break;
        case 'addtask': {
          const c = card!;
          await sendJson(`${base}/${sid}/tasks`, 'POST', { action: c.querySelector<HTMLSelectElement>('[data-task-action]')!.value, payload: c.querySelector<HTMLInputElement>('[data-task-payload]')!.value, offset: Number(c.querySelector<HTMLInputElement>('[data-task-offset]')!.value || 0) });
          break;
        }
      }
      await render(host);
    } catch (e) { fail(e); }
  });
  return t;
}
