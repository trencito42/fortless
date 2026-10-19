/**
 * Customer Portal — FastDL Management Page Module
 * Strict Petal Design System implementation.
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { formatBytes } from '../../../core/utils/formatting.js';
import { hero, toast } from '../../../petal/index.js';
import { renderPaginationFooter } from '../../../petal/components/pagination.js';

interface FastDlStatus {
  supported: boolean;
  reason?: string;
  profile?: {
    slug: string;
    name: string;
    engine: 'goldsrc' | 'source' | 'cod';
    gameDir: string;
    assetDirs: string[];
    extensions: string[];
    compression: 'bz2' | 'raw' | 'both';
    configFile: string;
    cvarTemplate: string;
    description?: string;
  };
  config?: {
    enabled: boolean;
    autoSync: boolean;
    compressionMode: 'bz2' | 'raw' | 'both';
    quotaBytes: number;
    customPublicUrl?: string | null;
    lastSyncAt?: string | null;
    cvarConfiguredAt?: string | null;
    cvarBackupPath?: string | null;
  };
  stats?: {
    totalFiles: number;
    totalOriginalBytes: number;
    totalStoredBytes: number;
    quotaBytes: number;
    percentUsed: number;
    cvarConfigured: boolean;
  };
  activeJob?: {
    id: string;
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    totalFiles: number;
    processedFiles: number;
    syncedFiles: number;
    failedFiles: number;
    currentFile?: string | null;
    errorMessage?: string | null;
  } | null;
  publicDownloadUrl?: string;
}

interface ManifestItem {
  id: string;
  filePath: string;
  fileSize: number;
  compressedSize: number;
  fileHash: string;
  isCompressed: boolean;
  status: 'SYNCED' | 'PENDING' | 'FAILED' | 'DELETED';
  lastError?: string | null;
  syncedAt: string;
}

export function initFastDl(serviceId: string) {
  const base = `/api/v1/services/${encodeURIComponent(serviceId)}/fastdl`;
  let status: FastDlStatus | null = null;
  let manifestPage = 1;
  const pageSize = 15;
  let searchQuery = '';
  let pollTimer: number | null = null;

  function stopPolling() {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function checkSupported(): Promise<boolean> {
    try {
      const res = await api<FastDlStatus>(base);
      status = res;
      return Boolean(res.supported);
    } catch {
      // A failed status request is not "unsupported": keep the tab so opening it shows the real error and a retry,
      // instead of the tab silently disappearing.
      return true;
    }
  }

  function copyField(value: string | null | undefined, label: string): string {
    if (!value) return '<code class="mono muted">Pending</code>';
    return `<span class="cpf" style="max-width:100%"><code>${esc(value)}</code><button class="ib xs" type="button" data-copy="${esc(value)}" data-copy-label="${esc(label)}" aria-label="Copy ${esc(label)}">${hero('copy-01', 'xs')}</button></span>`;
  }

  async function renderManifestTable() {
    const listHost = document.getElementById('fdManifestBody');
    const footerHost = document.getElementById('fdPaginationFooter');
    if (!listHost) return;

    listHost.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px"><div class="sk"><i></i><i></i></div></td></tr>';

    try {
      const q = searchQuery.trim() ? `&search=${encodeURIComponent(searchQuery.trim())}` : '';
      const res = await api<{
        items: ManifestItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`${base}/manifest?page=${manifestPage}&limit=${pageSize}${q}`);

      if (res.items.length === 0) {
        listHost.innerHTML = `<tr><td colspan="6" style="padding:32px 16px;text-align:center">
          <div class="col" style="align-items:center;gap:8px">
            <span class="tile neu sm">${hero('search-01', 's')}</span>
            <b>No FastDL assets found</b>
            <span class="faint" style="font-size:12.5px">${searchQuery ? 'Try a different search query.' : 'Click "Initial Sync" above to scan and mirror game assets.'}</span>
          </div>
        </td></tr>`;
        if (footerHost) footerHost.innerHTML = '';
        return;
      }

      listHost.innerHTML = res.items.map((item) => {
        const ext = item.filePath.split('.').pop()?.toUpperCase() || 'FILE';
        const savingsBytes = item.fileSize > item.compressedSize ? item.fileSize - item.compressedSize : 0;
        const savingsRatio = item.fileSize > 0 ? Math.round((savingsBytes / item.fileSize) * 100) : 0;

        return `<tr class="h">
          <td data-l="Asset Path">
            <div class="row nw" style="gap:8px;align-items:center">
              <span class="pill" style="font-size:10.5px;padding:2px 6px">${esc(ext)}</span>
              <b class="mono" style="font-size:13px;word-break:break-all">${esc(item.filePath)}</b>
            </div>
          </td>
          <td data-l="Original" class="mono muted">${esc(formatBytes(item.fileSize))}</td>
          <td data-l="Compressed" class="mono">${esc(formatBytes(item.compressedSize))} ${item.isCompressed ? '<span class="faint">(.bz2)</span>' : ''}</td>
          <td data-l="Savings">
            ${savingsRatio > 0 ? `<span class="pill good" style="font-size:11px">−${savingsRatio}%</span>` : '<span class="faint">—</span>'}
          </td>
          <td data-l="Hash">
            <span class="cpf mono" style="font-size:11.5px">
              <code>${esc(item.fileHash.slice(0, 10))}…${esc(item.fileHash.slice(-6))}</code>
              <button class="ib xs" type="button" data-copy="${esc(item.fileHash)}" aria-label="Copy SHA-256">${hero('copy-01', 'xs')}</button>
            </span>
          </td>
          <td data-l="Status">
            ${item.status === 'SYNCED' ? '<span class="pill good d">Synced</span>' : item.status === 'FAILED' ? `<span class="pill bad" title="${esc(item.lastError || '')}">Failed</span>` : '<span class="pill">Pending</span>'}
          </td>
        </tr>`;
      }).join('');

      if (footerHost) {
        footerHost.innerHTML = renderPaginationFooter(res.page, res.totalPages, res.total, pageSize, {
          infoId: 'fdPageInfo',
          pagerId: 'fdPagerButtons',
        });
        footerHost.querySelectorAll<HTMLButtonElement>('[data-pg]').forEach((b) => {
          b.addEventListener('click', () => {
            const next = Number(b.dataset['pg']);
            if (next && next !== manifestPage) {
              manifestPage = next;
              void renderManifestTable();
            }
          });
        });
      }
    } catch (err: any) {
      listHost.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:20px;color:var(--bad)">Failed to load manifest: ${esc(err.message)}</td></tr>`;
    }
  }

  async function open(): Promise<void> {
    // The controller is created before the service page is drawn, so the pane is looked up when it is opened.
    const host = document.getElementById('dtlFastdlBody');
    if (!host) return;
    stopPolling();

    host.innerHTML = `<div class="sk" role="status" aria-label="Loading FastDL"><i></i><i></i><i></i></div>`;

    try {
      status = await api<FastDlStatus>(base);
      if (!status.supported || !status.profile) {
        host.innerHTML = `<div class="es"><span class="tile neu lg">${hero('server', 'lg')}</span><h4>FastDL is not available</h4><p>${esc(status.reason || 'This game does not support HTTP FastDL.')}</p></div>`;
        return;
      }

      const p = status.profile;
      const stats = status.stats || {
        totalFiles: 0,
        totalOriginalBytes: 0,
        totalStoredBytes: 0,
        quotaBytes: 5368709120,
        percentUsed: 0,
        cvarConfigured: false,
      };
      const activeJob = status.activeJob;
      const isSyncing = activeJob && (activeJob.status === 'QUEUED' || activeJob.status === 'RUNNING');
      const autoSync = status.config?.autoSync !== false;

      const totalSavings = stats.totalOriginalBytes > stats.totalStoredBytes ? stats.totalOriginalBytes - stats.totalStoredBytes : 0;
      const savingsPct = stats.totalOriginalBytes > 0 ? Math.round((totalSavings / stats.totalOriginalBytes) * 100) : 0;

      host.innerHTML = `
        <div class="col" style="gap:20px">
          <!-- TOP HEADER -->
          <div class="ch" style="margin-bottom:0">
            <div class="tx">
              <div class="row" style="gap:8px;margin-bottom:6px">
                <span class="pill info">${esc(p.name)}</span>
                <span class="pill violet">${p.compression === 'bz2' ? 'bzip2 (.bz2)' : 'Raw HTTP'}</span>
                ${stats.cvarConfigured ? '<span class="pill good d">sv_downloadurl ready</span>' : '<span class="pill warn d">Pending configuration</span>'}
              </div>
              <h3>Automated FastDL (HTTP Sync)</h3>
              <p>Mirrors maps, models, materials, and sounds to dedicated high-speed CDN storage so players connect and download instantly.</p>
            </div>
            <div class="row act" style="gap:8px;align-items:center">
              <button type="button" class="btn pri" id="fdSyncBtn" ${isSyncing ? 'disabled' : ''}>
                <svg class="ic s" aria-hidden="true"><use href="#i-refresh"/></svg>
                ${stats.totalFiles === 0 ? 'Initial Sync' : 'Incremental Resync'}
              </button>
              <button type="button" class="btn" id="fdConfigureCvarBtn">
                <svg class="ic s" aria-hidden="true"><use href="#i-settings-01"/></svg>
                ${stats.cvarConfigured ? 'Reconfigure server.cfg' : 'Configure server.cfg'}
              </button>
            </div>
          </div>

          <!-- ACTIVE SYNC PROGRESS (VISIBLE WHEN SYNCING) -->
          <div id="fdSyncProgressCard" ${isSyncing ? '' : 'hidden'}>
            <div class="card" style="border-left:3px solid var(--accent)">
              <div class="row nw" style="justify-content:space-between;align-items:center;margin-bottom:8px">
                <div class="row nw" style="gap:8px;align-items:center">
                  <span class="tile info sm"><svg class="ic s" aria-hidden="true"><use href="#i-refresh"/></svg></span>
                  <div>
                    <b id="fdSyncStatusTitle">Sync in progress…</b>
                    <div class="faint" id="fdSyncCurrentFile" style="font-size:12px;font-family:var(--mono)">${esc(activeJob?.currentFile || 'Scanning game directories…')}</div>
                  </div>
                </div>
                <div class="row nw" style="gap:8px">
                  <span class="pill info" id="fdSyncCounts">${activeJob ? `${activeJob.processedFiles} / ${activeJob.totalFiles} files` : 'Processing…'}</span>
                  <button type="button" class="btn xs bad" id="fdCancelSyncBtn">Cancel</button>
                </div>
              </div>
              <div class="mtr info" style="margin:10px 0 4px">
                <b id="fdSyncProgressBar" style="width:${activeJob && activeJob.totalFiles > 0 ? Math.min(100, Math.round((activeJob.processedFiles / activeJob.totalFiles) * 100)) : 10}%"></b>
              </div>
            </div>
          </div>

          <!-- METRICS GRID -->
          <div class="g g4 k2">
            <!-- TILE 1: DOWNLOAD URL -->
            <div class="card" data-c="FastDL URL">
              <div class="row nw" style="justify-content:space-between;margin-bottom:6px">
                <span class="tile acc sm"><svg class="ic" aria-hidden="true"><use href="#i-globe-02"/></svg></span>
                <span class="faint" style="font-weight:700;font-size:11.5px">DOWNLOAD URL</span>
              </div>
              <div style="margin-top:6px">
                ${copyField(status.publicDownloadUrl, 'Download URL')}
              </div>
              <small class="faint" style="font-weight:600;margin-top:6px;display:block">Engine cvar: <code>${p.engine === 'cod' ? 'sv_wwwBaseURL' : 'sv_downloadurl'}</code></small>
            </div>

            <!-- TILE 2: STORAGE QUOTA -->
            <div class="card" data-c="Meter card">
              <div class="row nw" style="justify-content:space-between;margin-bottom:6px">
                <span class="tile good sm"><svg class="ic" aria-hidden="true"><use href="#i-archive-01"/></svg></span>
                <span class="faint" style="font-weight:700;font-size:11.5px">STORAGE QUOTA</span>
              </div>
              <b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(formatBytes(stats.totalStoredBytes))}</b>
              <div class="mtr good" style="margin:8px 0 6px">
                <b style="width:${stats.percentUsed}%"></b>
              </div>
              <small class="faint" style="font-weight:600">${esc(formatBytes(stats.totalStoredBytes))} of ${esc(formatBytes(stats.quotaBytes))} (${stats.percentUsed}%)</small>
            </div>

            <!-- TILE 3: COMPRESSION SAVINGS -->
            <div class="card">
              <div class="row nw" style="justify-content:space-between;margin-bottom:6px">
                <span class="tile violet sm"><svg class="ic" aria-hidden="true"><use href="#i-database"/></svg></span>
                <span class="faint" style="font-weight:700;font-size:11.5px">COMPRESSION</span>
              </div>
              <b style="font:800 24px var(--font);letter-spacing:-.04em">${esc(formatBytes(totalSavings))}</b>
              <div class="row nw" style="gap:6px;margin-top:6px;align-items:center">
                <span class="pill good" style="font-size:11.5px">−${savingsPct}% bandwidth</span>
                <span class="faint" style="font-size:12px">${stats.totalFiles} assets</span>
              </div>
              <small class="faint" style="font-weight:600;margin-top:4px;display:block">Original: ${esc(formatBytes(stats.totalOriginalBytes))}</small>
            </div>

            <!-- TILE 4: AUTO-SYNC STATUS -->
            <div class="card">
              <div class="row nw" style="justify-content:space-between;margin-bottom:6px">
                <span class="tile info sm"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg></span>
                <span class="faint" style="font-weight:700;font-size:11.5px">AUTO-SYNC</span>
              </div>
              <div class="row nw" style="justify-content:space-between;align-items:center;margin-top:4px">
                <b>Auto-sync</b>
                <button type="button" class="sw" role="switch" id="fdAutoSyncSw" aria-checked="${autoSync}" aria-label="Auto-sync on changes"></button>
              </div>
              <div class="faint" style="font-size:12px;margin-top:8px">Last synced: <b>${status.config?.lastSyncAt ? esc(formatDate(status.config.lastSyncAt)) : 'Never'}</b></div>
            </div>
          </div>

          <!-- ASSET MANIFEST TABLE -->
          <section class="card" style="padding:0;overflow:hidden">
            <div class="ch" style="padding:16px 18px 12px;margin-bottom:0;border-bottom:1px solid var(--border)">
              <div class="tx">
                <h3>Asset Manifest</h3>
                <p>Tracked files on the FastDL mirror with original vs compressed sizes and SHA-256 verification hashes.</p>
              </div>
              <div class="row act" style="gap:10px">
                <label class="sch" style="width:260px">
                  <svg class="ic s" aria-hidden="true"><use href="#i-search-01"/></svg>
                  <input id="fdSearchInput" type="text" placeholder="Search assets (e.g. de_dust2, wav)" aria-label="Search FastDL assets" value="${esc(searchQuery)}">
                </label>
              </div>
            </div>

            <div style="overflow-x:auto">
              <table class="tbl rsp" data-c="Data table">
                <thead>
                  <tr>
                    <th>Asset Path</th>
                    <th>Original</th>
                    <th>FastDL Stored</th>
                    <th>Savings</th>
                    <th>SHA-256 Verification</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="fdManifestBody">
                  <tr><td colspan="6" class="muted" style="text-align:center;padding:24px"><div class="sk"><i></i><i></i></div></td></tr>
                </tbody>
              </table>
            </div>

            <div id="fdPaginationFooter"></div>
          </section>
        </div>
      `;

      // Wire interactive events
      bindEvents();
      void renderManifestTable();

      // If job is running, start live poll
      if (isSyncing) {
        startPolling();
      }

    } catch (err: any) {
      host.innerHTML = `<div class="alert bad">${hero('alert-circle', 's')}<div><b>Failed to load FastDL status</b><span>${esc(err.message)}</span></div></div>`;
      toast(err.message, 'bad');
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = window.setInterval(async () => {
      try {
        const s = await api<FastDlStatus>(base);
        status = s;
        const job = s.activeJob;
        const isStillSyncing = job && (job.status === 'QUEUED' || job.status === 'RUNNING');

        const card = document.getElementById('fdSyncProgressCard');
        if (card) card.hidden = !isStillSyncing;

        if (isStillSyncing && job) {
          const title = document.getElementById('fdSyncStatusTitle');
          const fileEl = document.getElementById('fdSyncCurrentFile');
          const counts = document.getElementById('fdSyncCounts');
          const bar = document.getElementById('fdSyncProgressBar');

          if (title) title.textContent = job.status === 'QUEUED' ? 'Sync queued…' : 'Syncing assets…';
          if (fileEl) fileEl.textContent = job.currentFile || 'Scanning game directories…';
          if (counts) counts.textContent = `${job.processedFiles} / ${job.totalFiles} files`;
          if (bar) {
            const pct = job.totalFiles > 0 ? Math.min(100, Math.round((job.processedFiles / job.totalFiles) * 100)) : 10;
            bar.style.width = `${pct}%`;
          }
        } else {
          stopPolling();
          toast('FastDL sync completed.', 'good');
          void open(); // Full refresh
        }
      } catch {
        stopPolling();
      }
    }, 2000);
  }

  function bindEvents() {
    // Sync Button
    const syncBtn = document.getElementById('fdSyncBtn') as HTMLButtonElement | null;
    syncBtn?.addEventListener('click', async () => {
      syncBtn.disabled = true;
      try {
        await api<{ id: string; status: string }>(`${base}/sync`, { method: 'POST' });
        toast('FastDL sync started.', 'info');
        const card = document.getElementById('fdSyncProgressCard');
        if (card) card.hidden = false;
        startPolling();
      } catch (err: any) {
        toast(err.message || 'Failed to start sync', 'bad');
        syncBtn.disabled = false;
      }
    });

    // Cancel Sync Button
    const cancelBtn = document.getElementById('fdCancelSyncBtn');
    cancelBtn?.addEventListener('click', async () => {
      try {
        await api(`${base}/sync/cancel`, { method: 'POST' });
        toast('Sync cancellation requested.', 'warn');
        stopPolling();
        window.setTimeout(() => void open(), 1000);
      } catch (err: any) {
        toast(err.message || 'Failed to cancel sync', 'bad');
      }
    });

    // Configure cvar button
    const cfgBtn = document.getElementById('fdConfigureCvarBtn');
    cfgBtn?.addEventListener('click', async () => {
      cfgBtn.setAttribute('disabled', 'true');
      try {
        const res = await api<{ backupPath: string | null; downloadUrl: string }>(`${base}/configure-cvar`, { method: 'POST' });
        toast(res.backupPath ? `Configured in server.cfg (backup: ${res.backupPath})` : 'Configured in server.cfg', 'good');
        void open();
      } catch (err: any) {
        toast(err.message || 'Failed to configure server.cfg', 'bad');
        cfgBtn.removeAttribute('disabled');
      }
    });

    // Auto-sync switch
    const sw = document.getElementById('fdAutoSyncSw');
    sw?.addEventListener('click', async () => {
      const current = sw.getAttribute('aria-checked') === 'true';
      const next = !current;
      sw.setAttribute('aria-checked', String(next));
      try {
        await api(`${base}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoSync: next }),
        });
        toast(next ? 'Auto-sync enabled.' : 'Auto-sync disabled.', 'good');
      } catch (err: any) {
        sw.setAttribute('aria-checked', String(current));
        toast(err.message || 'Failed to update auto-sync', 'bad');
      }
    });

    // Search input
    let searchDebounce: number;
    const searchInp = document.getElementById('fdSearchInput') as HTMLInputElement | null;
    searchInp?.addEventListener('input', () => {
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        searchQuery = searchInp.value;
        manifestPage = 1;
        void renderManifestTable();
      }, 350);
    });
  }

  return {
    open,
    checkSupported,
    destroy() {
      stopPolling();
    },
  };
}
