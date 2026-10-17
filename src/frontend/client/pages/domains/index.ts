/**
 * Customer Portal — Domains & DNS Management Page Module
 * Route: /app/domains
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { money } from '../../../core/utils/formatting.js';
import { formatDate } from '../../../core/utils/dates.js';
import { toast, renderEmptyState, renderSkeleton } from '../../../petal/index.js';

interface DomainSearchResult {
  domain: string;
  tld: string;
  available: boolean;
  status: 'AVAILABLE' | 'TAKEN' | 'UNSUPPORTED_TLD' | 'INVALID_SYNTAX';
  annualPriceMinorUnits: number | null;
  currency: string | null;
  reason?: string;
}

interface DomainZone {
  id: string;
  account_id: string;
  domain_name: string;
  status: string;
  auto_renew: number;
  nameservers: string;
  whois_privacy: number;
  created_at: string;
  expires_at: string;
}

interface DnsRecord {
  id: string;
  zone_id: string;
  account_id: string;
  record_type: string;
  name: string;
  content: string;
  ttl: number;
  priority: number | null;
  weight: number | null;
  port: number | null;
  created_at: string;
  updated_at: string;
}

let activeZoneId: string | null = null;

export async function renderDomains(): Promise<void> {
  await Promise.all([loadZones(), loadTldPricing()]);
  bindDomainEvents();
}

async function loadTldPricing(): Promise<void> {
  const host = document.getElementById('tldPricingChips');
  if (!host) return;

  try {
    const { tlds } = await api<{ tlds: Record<string, { tld: string; currency: string; annualPriceMinorUnits: number; popular?: boolean }> }>('/api/v1/domains/tlds');
    host.innerHTML = Object.values(tlds)
      .map(
        (t) => `
        <span class="badge ${t.popular ? 'accent' : ''} s" data-tld="${esc(t.tld)}">
          <b>${esc(t.tld)}</b> ${money(t.annualPriceMinorUnits, t.currency)}/yr
        </span>
      `
      )
      .join(' ');
  } catch {
    // Graceful silent fallback
  }
}

export async function loadZones(): Promise<void> {
  const host = document.getElementById('domainZonesContainer');
  if (!host) return;

  host.innerHTML = renderSkeleton('table', 'Loading domain zones');

  try {
    const { zones } = await api<{ zones: DomainZone[] }>('/api/v1/domains/zones');
    if (!zones.length) {
      host.innerHTML = renderEmptyState({
        icon: 'document',
        title: 'No domain zones active',
        message: 'Search and register a domain above or delegate DNS to Fortless authoritative nameservers.',
      });
      return;
    }

    host.innerHTML = `
      <div class="z-scroll"><table class="tbl">
        <thead>
          <tr>
            <th>Domain Name</th>
            <th>Status</th>
            <th>Nameservers</th>
            <th>Auto-Renew</th>
            <th>Expires</th>
            <th class="r">DNS Records</th>
          </tr>
        </thead>
        <tbody>
          ${zones
            .map((z) => {
              const ns = JSON.parse(z.nameservers || '[]') as string[];
              return `
              <tr class="mobile-record" data-zone-search="${esc(`${z.domain_name} ${z.status} ${ns.join(' ')}`.toLowerCase())}">
                <td data-label="Domain">
                  <div class="row" style="gap:8px">
                    <svg class="ic s" style="color:var(--accent)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    <b>${esc(z.domain_name)}</b>
                  </div>
                </td>
                <td data-label="Status"><span class="badge good s">${esc(z.status)}</span></td>
                <td data-label="Nameservers" class="muted mono" style="font-size:12px">${esc(ns.join(', '))}</td>
                <td data-label="Auto-Renew">${z.auto_renew ? '<span class="badge s accent">Active</span>' : '<span class="badge s">Disabled</span>'}</td>
                <td data-label="Expires" class="muted">${esc(formatDate(z.expires_at))}</td>
                <td data-label="DNS Records" class="r">
                  <button type="button" class="btn sec s manage-dns-btn" data-zone-id="${esc(z.id)}" data-domain="${esc(z.domain_name)}">
                    Manage DNS
                  </button>
                </td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table></div>
    `;

    filterZones();

    host.querySelectorAll<HTMLButtonElement>('.manage-dns-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const zid = btn.dataset.zoneId;
        const dom = btn.dataset.domain;
        if (zid && dom) openDnsEditor(zid, dom);
      });
    });
  } catch (err: unknown) {
    host.innerHTML = `<div class="state-message" style="color:var(--bad)">Failed to load domains: ${esc((err as Error).message)}</div>`;
  }
}

function filterZones(): void {
  const query = (document.getElementById('zoneSearch') as HTMLInputElement | null)?.value.trim().toLowerCase() || '';
  const rows = [...document.querySelectorAll<HTMLElement>('#domainZonesContainer [data-zone-search]')];
  let visible = 0;
  rows.forEach((row) => {
    const match = !query || (row.dataset.zoneSearch || '').includes(query);
    row.hidden = !match;
    if (match) visible++;
  });
  const count = document.getElementById('zoneResultCount');
  if (count) count.textContent = rows.length ? `${visible} of ${rows.length} zones` : '';
}

export async function searchDomains(query: string): Promise<void> {
  const host = document.getElementById('domainSearchResults');
  if (!host) return;

  const clean = query.trim();
  if (!clean) {
    host.innerHTML = '';
    return;
  }

  host.innerHTML = renderSkeleton('list', 'Searching domain availability and catalog pricing');

  try {
    const res = await api<{ results: DomainSearchResult[] }>(`/api/v1/domains/search?query=${encodeURIComponent(clean)}`);
    if (!res.results || !res.results.length) {
      host.innerHTML = '<div class="state-message">No matching TLDs found.</div>';
      return;
    }

    host.innerHTML = `
      <div class="z-ss domain-results">
        ${res.results
          .map((item) => {
            const isAvail = item.available && item.status === 'AVAILABLE';
            const badgeClass = isAvail ? 'good' : 'bad';
            return `
            <div class="z-ssr">
              <span class="ico-b ${isAvail ? 'good' : ''}"><svg class="ic"><use href="#i-globe"/></svg></span>
              <div class="tx"><b>${esc(item.domain)} <span class="badge ${badgeClass} s">${esc(item.status)}</span></b><small>Catalog result · registrar checkout is not connected</small></div>
              <div class="actions row">
                ${
                  item.annualPriceMinorUnits !== null
                    ? `<span class="num" style="font-weight:700">${money(item.annualPriceMinorUnits, item.currency || 'EUR')} <small class="muted">/yr</small></span>`
                    : ''
                }
                ${
                  isAvail
                    ? `<button type="button" class="btn sec s register-domain-btn" data-domain="${esc(item.domain)}">Create DNS zone</button>`
                    : `<span class="badge s">Unavailable</span>`
                }
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `;

    host.querySelectorAll<HTMLButtonElement>('.register-domain-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const domain = btn.dataset.domain;
        if (!domain) return;
        btn.disabled = true;
        btn.textContent = 'Registering…';
        try {
          await api('/api/v1/domains/zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domainName: domain, autoRenew: true, whoisPrivacy: true, periodYears: 1 }),
          });
          toast(`Authoritative DNS zone for "${domain}" was created. No registrar purchase was made.`, 'good');
          await loadZones();
          await searchDomains(domain);
        } catch (err: unknown) {
          toast((err as Error).message, 'bad');
          btn.disabled = false;
          btn.textContent = 'Create DNS zone';
        }
      });
    });
  } catch (err: unknown) {
    host.innerHTML = `<div class="state-message" style="color:var(--bad)">Search failed: ${esc((err as Error).message)}</div>`;
  }
}

export async function openDnsEditor(zoneId: string, domainName: string): Promise<void> {
  activeZoneId = zoneId;
  const editorCard = document.getElementById('dnsEditorCard');
  const title = document.getElementById('dnsEditorDomainTitle');
  if (editorCard) editorCard.style.display = 'block';
  if (title) title.textContent = domainName;

  await loadDnsRecords(zoneId);
  editorCard?.scrollIntoView({ behavior: 'smooth' });
}

export async function loadDnsRecords(zoneId: string): Promise<void> {
  const host = document.getElementById('dnsRecordsContainer');
  if (!host) return;

  host.innerHTML = renderSkeleton('table', 'Loading DNS records');

  try {
    const { records } = await api<{ records: DnsRecord[] }>(`/api/v1/domains/zones/${encodeURIComponent(zoneId)}/records`);

    if (!records.length) {
      host.innerHTML = renderEmptyState({
        icon: 'document',
        title: 'No DNS records configured',
        message: 'Add an A, AAAA, CNAME, MX, or TXT record using the form below.',
      });
      return;
    }

    host.innerHTML = `
      <table class="tbl">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th>Content / Target</th>
            <th>TTL</th>
            <th>Priority</th>
            <th class="r">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${records
            .map(
              (r) => `
            <tr class="mobile-record">
              <td data-label="Type"><span class="badge accent s">${esc(r.record_type)}</span></td>
              <td data-label="Name" class="mono"><b>${esc(r.name)}</b></td>
              <td data-label="Content" class="mono muted" style="word-break:break-all">${esc(r.content)}</td>
              <td data-label="TTL" class="num">${r.ttl}s</td>
              <td data-label="Priority" class="num">${r.priority !== null ? r.priority : '—'}</td>
              <td data-label="Actions" class="r">
                <button type="button" class="btn sec xs delete-dns-btn" data-record-id="${esc(r.id)}" style="color:var(--bad)">
                  Delete
                </button>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;

    host.querySelectorAll<HTMLButtonElement>('.delete-dns-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rid = btn.dataset.recordId;
        if (!rid || !activeZoneId) return;
        if (!confirm('Are you sure you want to delete this DNS record?')) return;
        btn.disabled = true;
        try {
          await api(`/api/v1/domains/zones/${encodeURIComponent(activeZoneId)}/records/${encodeURIComponent(rid)}`, {
            method: 'DELETE',
          });
          toast('DNS record deleted successfully.', 'good');
          await loadDnsRecords(activeZoneId);
        } catch (err: unknown) {
          toast((err as Error).message, 'bad');
          btn.disabled = false;
        }
      });
    });
  } catch (err: unknown) {
    host.innerHTML = `<div class="state-message" style="color:var(--bad)">Failed to load DNS records: ${esc((err as Error).message)}</div>`;
  }
}

function bindDomainEvents(): void {
  const section = document.getElementById('section-domains');
  if (!section || section.dataset.bound === 'true') return;
  section.dataset.bound = 'true';
  const searchInput = document.getElementById('domainSearchInput') as HTMLInputElement | null;
  const searchBtn = document.getElementById('domainSearchBtn');

  searchBtn?.addEventListener('click', () => {
    if (searchInput) searchDomains(searchInput.value);
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchDomains(searchInput.value);
    }
  });

  document.getElementById('refreshZonesBtn')?.addEventListener('click', loadZones);
  document.getElementById('zoneSearch')?.addEventListener('input', filterZones);

  // New DNS Record Form submission
  const addRecordForm = document.getElementById('addDnsRecordForm') as HTMLFormElement | null;
  addRecordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeZoneId) {
      toast('Select a domain zone first.', 'bad');
      return;
    }

    const typeSelect = document.getElementById('dnsRecordType') as HTMLSelectElement | null;
    const nameInput = document.getElementById('dnsRecordName') as HTMLInputElement | null;
    const contentInput = document.getElementById('dnsRecordContent') as HTMLInputElement | null;
    const ttlInput = document.getElementById('dnsRecordTtl') as HTMLInputElement | null;
    const prioInput = document.getElementById('dnsRecordPriority') as HTMLInputElement | null;
    const submitBtn = document.getElementById('addDnsRecordBtn') as HTMLButtonElement | null;

    if (!typeSelect || !nameInput || !contentInput) return;

    const payload = {
      recordType: typeSelect.value,
      name: nameInput.value.trim(),
      content: contentInput.value.trim(),
      ttl: ttlInput?.value ? parseInt(ttlInput.value, 10) : 3600,
      priority: prioInput?.value ? parseInt(prioInput.value, 10) : undefined,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
    }

    try {
      await api(`/api/v1/domains/zones/${encodeURIComponent(activeZoneId)}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast('DNS record created.', 'good');
      nameInput.value = '';
      contentInput.value = '';
      if (prioInput) prioInput.value = '';
      await loadDnsRecords(activeZoneId);
    } catch (err: unknown) {
      toast((err as Error).message, 'bad');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Record';
      }
    }
  });

  // Close DNS Editor
  document.getElementById('closeDnsEditorBtn')?.addEventListener('click', () => {
    const editor = document.getElementById('dnsEditorCard');
    if (editor) editor.style.display = 'none';
    activeZoneId = null;
  });
}
