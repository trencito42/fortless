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
  status: 'NOT_CLAIMED' | 'TAKEN' | 'UNSUPPORTED_TLD' | 'INVALID_SYNTAX';
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
  ownership_verified_at?: string | null;
  ownership_token?: string | null;
  delegation_verified?: number;
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
        message: 'Add a domain you already own above, prove ownership with a TXT record, then point its name servers to Fortless.',
      });
      return;
    }

    host.innerHTML = `
      <div class="col" style="gap:8px">
        ${zones
          .map((z) => {
            const ns = JSON.parse(z.nameservers || '[]') as string[];
            const nsText = ns.length ? ns.join(' · ') : 'ns1.fortless.net · ns2.fortless.net';
            const exp = z.expires_at ? ` · Expires ${formatDate(z.expires_at)}` : '';
            const proven = Boolean(z.ownership_verified_at);
            const challenge = !proven && z.ownership_token
              ? { name: `_fortless-challenge.${z.domain_name}`, value: `fortless-verify=${z.ownership_token}` }
              : null;
            const pillTone = !proven ? 'warn' : z.status === 'ACTIVE' ? 'good' : 'neu';
            const pillText = !proven ? 'Ownership not verified' : z.status === 'ACTIVE' ? 'Delegated' : 'Awaiting delegation';
            return `
            <div class="col" style="gap:8px" data-zone-search="${esc(`${z.domain_name} ${z.status} ${ns.join(' ')}`.toLowerCase())}">
            <div class="li h" style="padding:12px 14px;gap:12px;align-items:center">
              <span class="tile ${proven ? 'good' : 'warn'} sm"><svg class="ic s" width="16" height="16"><use href="#i-globe-02"/></svg></span>
              <span class="tx" style="min-width:140px">
                <b>${esc(z.domain_name)}</b>
                <small class="muted mono" style="font-size:12px">${esc(nsText)}${esc(exp)}</small>
              </span>
              <span class="pill ${pillTone}">${esc(pillText)}</span>
              ${!proven
                ? `<button type="button" class="btn xs tint verify-ownership-btn" data-zone-id="${esc(z.id)}" style="flex-shrink:0">Verify ownership</button>`
                : z.status !== 'ACTIVE'
                  ? `<button type="button" class="btn xs tint verify-delegation-btn" data-zone-id="${esc(z.id)}" style="flex-shrink:0">Check delegation</button>`
                  : ''}
              <button type="button" class="btn xs tint manage-dns-btn" data-zone-id="${esc(z.id)}" data-domain="${esc(z.domain_name)}" style="flex-shrink:0" ${proven ? '' : 'disabled title="Verify ownership first"'}>
                <svg class="ic xs" width="14" height="14"><use href="#i-arrow-right-01"/></svg>Manage DNS
              </button>
            </div>
            ${challenge ? `<div class="alert info"><div><b>Prove you control ${esc(z.domain_name)}</b><span>Add this TXT record at your current DNS provider, then choose Verify ownership. Records cannot be edited and the zone is not delegated until this passes. DNS changes can take a few minutes.</span><span class="mono">${esc(challenge.name)} &nbsp; TXT &nbsp; ${esc(challenge.value)}</span></div></div>` : ''}
            </div>
          `;
          })
          .join('')}
      </div>
    `;

    filterZones();

    const verify = (selector: string, path: string, okMessage: string, pendingMessage: string) => {
      host.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
        btn.addEventListener('click', async () => {
          const zid = btn.dataset.zoneId;
          if (!zid) return;
          btn.disabled = true;
          try {
            const res = await api<{ verified: boolean }>(`/api/v1/domains/zones/${encodeURIComponent(zid)}/${path}`, { method: 'POST' });
            toast(res.verified ? okMessage : pendingMessage, res.verified ? 'good' : 'warn');
            if (res.verified) await loadZones();
          } catch (err: unknown) {
            toast((err as Error).message, 'bad');
          } finally {
            btn.disabled = false;
          }
        });
      });
    };
    verify('.verify-ownership-btn', 'verify-ownership', 'Ownership verified. You can now manage DNS records.', 'The verification TXT record was not found yet. Check the record and try again in a few minutes.');
    verify('.verify-delegation-btn', 'verify-delegation', 'Delegation confirmed.', 'The domain does not point only to the Fortless name servers yet.');

    host.querySelectorAll<HTMLButtonElement>('.manage-dns-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const zid = btn.dataset.zoneId;
        const dom = btn.dataset.domain;
        if (zid && dom) openDnsEditor(zid, dom);
      });
    });
  } catch (err: unknown) {
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load zones</b><span>${esc((err as Error).message)}</span></div></div>`;
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

    host.innerHTML = `<div class="col" style="gap:6px;margin-top:8px">${res.results.map((item) => {
        const isAvail = item.available && item.status === 'NOT_CLAIMED';
        const tone = isAvail ? 'info' : 'bad';
        return `<div class="li"><span class="tile ${tone} sm"><svg class="ic" width="16" height="16"><use href="#i-globe-02"/></svg></span><span class="tx"><b>${esc(item.domain)}</b><small>Not in Fortless DNS yet · availability at a registrar is not checked, nothing is purchased</small></span><span class="row" style="gap:8px;flex-shrink:0"><span class="pill ${tone}">${esc(item.status === 'NOT_CLAIMED' ? 'Not in Fortless DNS' : item.status)}</span>${isAvail ? `<button type="button" class="btn s tint register-domain-btn" data-domain="${esc(item.domain)}">Create DNS zone</button>` : ''}</span></div>`;
      }).join('')}</div>`;

    host.querySelectorAll<HTMLButtonElement>('.register-domain-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const domain = btn.dataset.domain;
        if (!domain) return;
        btn.disabled = true;
        btn.textContent = 'Registering…';
        try {
          if (btn.dataset.claimDomain) {
            const res = await api<{ verified: boolean }>('/api/v1/domains/claims/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domainName: domain }),
            });
            if (!res.verified) {
              toast('The claim TXT record was not found yet. Check it and try again in a few minutes.', 'warn');
              btn.disabled = false;
              btn.textContent = 'Verify claim';
              return;
            }
            toast(`"${domain}" is now in your workspace.`, 'good');
            await loadZones();
            await searchDomains(domain);
            return;
          }
          await api('/api/v1/domains/zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domainName: domain, autoRenew: true, whoisPrivacy: true, periodYears: 1 }),
          });
          toast(`Authoritative DNS zone for "${domain}" was created. No registrar purchase was made.`, 'good');
          await loadZones();
          await searchDomains(domain);
        } catch (err: unknown) {
          const code = (err as { code?: string }).code;
          if (code === 'DOMAIN_CLAIMED_UNVERIFIED') {
            // Another workspace added this name without proving control: offer the DNS-proof claim.
            try {
              const claim = await api<{ recordName: string; recordValue: string }>('/api/v1/domains/claims', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domainName: domain }),
              });
              toast(`Add TXT ${claim.recordName} = ${claim.recordValue}, then select Verify claim.`, 'warn');
              btn.disabled = false;
              btn.textContent = 'Verify claim';
              btn.dataset.claimDomain = domain;
              return;
            } catch (claimErr: unknown) {
              toast((claimErr as Error).message, 'bad');
            }
          } else {
            toast((err as Error).message, 'bad');
          }
          btn.disabled = false;
          btn.textContent = btn.dataset.claimDomain ? 'Verify claim' : 'Create DNS zone';
        }
      });
    });
  } catch (err: unknown) {
    host.innerHTML = `<div class="alert bad"><div><b>Search failed</b><span>${esc((err as Error).message)}</span></div></div>`;
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
      <table class="tbl rsp" data-c="Data table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th>Target</th>
            <th>TTL</th>
            <th>Priority</th>
            <th class="r">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${records
            .map(
              (r) => `
            <tr class="h mobile-record">
              <td data-l="Type"><span class="pill acc">${esc(r.record_type)}</span></td>
              <td data-l="Name" class="mono"><b>${esc(r.name)}</b></td>
              <td data-l="Target" class="mono muted" style="word-break:break-all">${esc(r.content)}</td>
              <td data-l="TTL" class="num">${r.ttl}s</td>
              <td data-l="Priority" class="num">${r.priority !== null ? r.priority : '—'}</td>
              <td data-l="Actions" class="r">
                <button type="button" class="ib s delete-dns-btn" data-record-id="${esc(r.id)}" style="color:var(--bad)" aria-label="Delete record">
                  <svg class="ic s" width="16" height="16"><use href="#i-delete-02"/></svg>
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
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load DNS records</b><span>${esc((err as Error).message)}</span></div></div>`;
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
