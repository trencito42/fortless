import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { renderPager } from '../../../petal/index.js';
import { badge } from '../../shell/admin-shell.js';

let currentQuery = '';
let currentPage = 1;
let total = 0;
const pageSize = 20;
let listenersBound = false;

function filters(): { type: string; status: string } {
  return {
    type: (document.getElementById('jobsTypeFilter') as HTMLSelectElement | null)?.value || '',
    status: (document.getElementById('jobsStatusFilter') as HTMLSelectElement | null)?.value || '',
  };
}

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  document.getElementById('adminJobsPager')?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (button && !button.disabled) renderJobs(currentQuery, Number(button.dataset.pg) || 1);
  });
  for (const id of ['jobsTypeFilter', 'jobsStatusFilter']) {
    document.getElementById(id)?.addEventListener('change', () => renderJobs(currentQuery, 1));
  }
}

export async function renderJobs(query = '', page = 1): Promise<void> {
  const host = document.getElementById('jobsList');
  if (!host) return;
  currentQuery = query;
  currentPage = Math.max(1, page);
  const { type, status } = filters();
  const params = new URLSearchParams({ q: query, limit: String(pageSize), offset: String((currentPage - 1) * pageSize) });
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  host.innerHTML = '<tr><td colspan="7"><div class="sk"><i></i><i></i></div></td></tr>';
  try {
    const data = await api<{ jobs: any[]; total: number }>(`/api/v1/admin/jobs?${params}`);
    total = Number(data.total || 0);
    host.innerHTML = data.jobs.length ? data.jobs.map((job) => `<tr>
      <td data-l="Type">${badge(job.job_type)}</td>
      <td data-l="Job"><b class="mono">${esc(job.id)}</b><small>${esc(job.subject)}</small></td>
      <td data-l="Resource">${job.job_type === 'PROVISIONING' && job.resource_id ? `<a class="btn xs" href="/admin/services/${encodeURIComponent(job.resource_id)}" data-route="admin-service-detail">${esc(job.resource_id)}</a>` : `<span class="mono">${esc(job.resource_id || '—')}</span>`}</td>
      <td data-l="Status">${badge(job.status)}</td>
      <td data-l="Attempts">${Number(job.attempt_count || 0)}</td>
      <td data-l="Last error"><span class="muted">${esc(job.last_error || '—')}</span></td>
      <td data-l="Updated">${formatDate(job.updated_at)}${(['FAILED', 'NEEDS_MANUAL_REVIEW', 'DEAD_LETTER', 'ANOMALY'].includes(job.status)) ? `<button class="btn xs" style="margin-top:6px" data-job-retry="${esc(job.job_type)}" data-job-id="${esc(job.id)}" data-permission="services:manage">Retry safely</button>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="7"><div class="es"><h4>No matching workflow records</h4><p>Nothing persisted for the selected filters.</p></div></td></tr>';
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const start = (currentPage - 1) * pageSize;
    const info = document.getElementById('adminJobsPageInfo');
    const pager = document.getElementById('adminJobsPager');
    const row = document.getElementById('adminJobsPaginationRow');
    if (info) info.textContent = total ? `Showing ${start + 1}–${start + data.jobs.length} of ${total}` : '0 jobs';
    if (pager) pager.innerHTML = renderPager(currentPage, pages);
    if (row) row.style.display = total > pageSize ? 'flex' : 'none';
    bindListeners();
  } catch (error: any) {
    host.innerHTML = `<tr><td colspan="7"><div class="alert bad"><div><b>Jobs unavailable</b><span>${esc(error.message)}</span></div></div></td></tr>`;
  }
}
