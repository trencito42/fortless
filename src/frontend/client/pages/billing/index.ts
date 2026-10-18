/**
 * Customer Portal — Billing & Invoices Page Module
 * Route: /app/billing
 */

import { formDialog } from '../services/dialog.js';
import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { money } from '../../../core/utils/formatting.js';
import { formatDate } from '../../../core/utils/dates.js';
import { renderEmptyState, renderSkeleton, toast } from '../../../petal/index.js';

let invoiceCache: any[] = [];

function invoiceRow(invoice: any): string {
  const badgeClass = invoice.status === 'PAID' ? 'good' : invoice.status === 'DRAFT' ? '' : 'info';
  return `<tr class="h" data-s="${esc(invoice.status)}">
    <td data-l="Invoice"><b>${esc(invoice.invoice_number || 'Draft')}</b></td>
    <td data-l="Date" class="faint">${esc(formatDate(invoice.created_at))}</td>
    <td data-l="Tax">${money(invoice.tax_minor_units, invoice.currency)}</td>
    <td data-l="Total" class="r num"><b>${money(invoice.total_minor_units, invoice.currency)}</b></td>
    <td data-l="Status"><span class="pill ${badgeClass}">${esc(invoice.status)}</span></td>
    <td class="r"><a href="/api/v1/invoices/${encodeURIComponent(invoice.id)}/download" class="btn xs" download><svg class="ic xs" aria-hidden="true"><use href="#i-download-01"/></svg>Receipt</a></td>
  </tr>`;
}

export function filterBilling(): void {
  const host = document.getElementById('invoicesTableBody');
  if (!host) return;
  const query = (document.getElementById('invoiceSearch') as HTMLInputElement | null)?.value.trim().toLowerCase() || '';
  const status = document.querySelector<HTMLInputElement>('input[name="invoiceStatus"]:checked')?.value || 'ALL';
  const records = invoiceCache.filter((invoice) => {
    const matchesStatus = status === 'ALL' || (status === 'OPEN' ? ['DRAFT', 'OPEN', 'PENDING'].includes(invoice.status) : invoice.status === status);
    const haystack = `${invoice.invoice_number || 'draft'} ${invoice.status} ${invoice.currency}`.toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
  const count = document.getElementById('invoiceResultCount');
  if (count) count.textContent = `${records.length} of ${invoiceCache.length} records`;
  host.innerHTML = records.length ? records.map(invoiceRow).join('') : `<tr><td colspan="6">${renderEmptyState({ icon: 'document', title: invoiceCache.length ? 'No matching invoices' : 'No invoices', message: invoiceCache.length ? 'Try another number or status.' : 'Issued billing records will appear here.' })}</td></tr>`;
}

interface BillingProfile { companyName: string | null; taxId: string | null; addressLine1: string; addressLine2: string | null; city: string; postalCode: string; country: string }
let billingRole = '';

function paintBillingProfile(profile: BillingProfile | null, fallbackName: string, email: string): void {
  const set = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('billProfileName', profile?.companyName || fallbackName || '—');
  set('billProfileVat', profile?.taxId || 'Not set');
  set('billProfileAddress', profile ? [profile.addressLine1, profile.addressLine2, `${profile.postalCode} ${profile.city}`, profile.country].filter(Boolean).join(', ') : 'Not set');
  set('billProfileEmail', email || '—');
}

async function loadBillingProfile(): Promise<void> {
  try {
    const [me, bp] = await Promise.all([
      api<{ user: any; account: any; membership: { role: string } }>('/api/v1/auth/me'),
      api<{ profile: BillingProfile | null }>('/api/v1/account/billing-profile'),
    ]);
    billingRole = me.membership?.role || '';
    paintBillingProfile(bp.profile, me.user?.name || me.account?.name || '', me.user?.email || '');
    const btn = document.getElementById('editBillingBtn') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = !['OWNER', 'BILLING_MANAGER'].includes(billingRole);
      if (!btn.dataset['bound']) {
        btn.dataset['bound'] = '1';
        btn.addEventListener('click', () => void editBillingProfile(me.user?.name || '', me.user?.email || ''));
      }
    }
  } catch {
    // non-blocking
  }
}

async function editBillingProfile(fallbackName: string, email: string): Promise<void> {
  try {
    const current = (await api<{ profile: BillingProfile | null }>('/api/v1/account/billing-profile')).profile;
    const v = await formDialog({
      title: 'Billing details', message: 'Shown on every invoice. The tax ID is stored as you enter it and is not verified.', confirmLabel: 'Save',
      fields: [
        { key: 'companyName', label: 'Company name (optional)', value: current?.companyName ?? '' },
        { key: 'taxId', label: 'Tax / VAT ID (optional)', value: current?.taxId ?? '' },
        { key: 'addressLine1', label: 'Address', value: current?.addressLine1 ?? '' },
        { key: 'addressLine2', label: 'Address line 2 (optional)', value: current?.addressLine2 ?? '' },
        { key: 'city', label: 'City', value: current?.city ?? '' },
        { key: 'postalCode', label: 'Postal code', value: current?.postalCode ?? '' },
        { key: 'country', label: 'Country (two-letter code)', value: current?.country ?? '', placeholder: 'RO' },
      ],
    });
    if (!v) return;
    const res = await api<{ profile: BillingProfile }>('/api/v1/account/billing-profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v),
    });
    paintBillingProfile(res.profile, fallbackName, email);
    toast('Billing details saved', 'good');
  } catch (e: any) { toast(e?.message || 'Could not save billing details.', 'bad'); }
}

let pendingCancelSubId: string | null = null;

export function openCancelSubModal(subId: string, subName?: string, renewalDate?: string): void {
  pendingCancelSubId = subId;
  const modal = document.getElementById('cancelSubModal');
  const desc = document.getElementById('cancelSubDesc');
  if (desc) {
    desc.textContent = subName
      ? `${subName} keeps running until the current period ends${renewalDate ? ' on ' + renewalDate : ''}, then it is deleted.`
      : 'The service keeps running until the current period ends, then it is deleted.';
  }
  if (modal) modal.hidden = false;
}

export function closeCancelSubModal(): void {
  pendingCancelSubId = null;
  const modal = document.getElementById('cancelSubModal');
  if (modal) modal.hidden = true;
}

export async function executeScheduledCancel(): Promise<void> {
  if (!pendingCancelSubId) return;
  const subId = pendingCancelSubId;
  const btn = document.getElementById('confirmCancelSubBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;

  try {
    await api(`/api/v1/subscriptions/${encodeURIComponent(subId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immediate: false }),
    });
    toast('Cancellation scheduled at period end.', 'good');
    closeCancelSubModal();
    await renderBilling();
  } catch (err: any) {
    toast(err.message, 'bad');
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function renderBilling(): Promise<void> {
  const host = document.getElementById('invoicesTableBody');
  if (!host) return;

  host.innerHTML = `<tr><td colspan="6">${renderSkeleton('table', 'Loading billing records')}</td></tr>`;
  loadBillingProfile();

  try {
    const [{ invoices }, subResult] = await Promise.all([
      api<{ invoices: any[] }>('/api/v1/invoices'),
      api<{ subscriptions: any[] }>('/api/v1/subscriptions').catch(() => ({ subscriptions: [] })),
    ]);

    invoiceCache = invoices;
    const subscriptions = subResult.subscriptions || [];

    const paidInvoices = invoices.filter((inv) => inv.status === 'PAID');
    const openInvoices = invoices.filter((inv) => ['DRAFT', 'OPEN', 'PENDING'].includes(inv.status));

    const paidTotal = paidInvoices.reduce((sum, inv) => sum + Number(inv.total_minor_units || 0), 0);
    const openTotal = openInvoices.reduce((sum, inv) => sum + Number(inv.total_minor_units || 0), 0);
    const currency = invoices[0]?.currency || 'EUR';

    // Find next renewal
    const activeSubs = subscriptions.filter((s) => s.status === 'ACTIVE');
    activeSubs.sort((a, b) => new Date(a.nextRenewalDate).getTime() - new Date(b.nextRenewalDate).getTime());
    const nextSub = activeSubs[0];

    const nextRenewalLabel = nextSub ? formatDate(nextSub.nextRenewalDate) : '—';
    const nextRenewalDesc = nextSub ? esc(nextSub.serviceName) : 'No recurring renewals';

    const outstandingLabel = money(openTotal, currency);
    const outstandingDesc = openInvoices.length
      ? `${openInvoices.length} open ${openInvoices.length === 1 ? 'invoice' : 'invoices'}`
      : 'No open invoices';

    const paidLabel = money(paidTotal, currency);
    const paidDesc = `${paidInvoices.length} ${paidInvoices.length === 1 ? 'invoice' : 'invoices'}`;

    const summary = document.getElementById('invoiceSummary');
    if (summary) {
      summary.innerHTML = `
        <div class="card mt" data-c="Metric tile"><div><span class="l">Next renewal</span><b class="v">${nextRenewalLabel}</b><small>${nextRenewalDesc}</small></div><span class="tile info"><svg class="ic" aria-hidden="true"><use href="#i-calendar-01"/></svg></span></div>
        <div class="card mt" data-c="Metric tile"><div><span class="l">Outstanding</span><b class="v">${outstandingLabel}</b><small>${outstandingDesc}</small></div><span class="tile warn"><svg class="ic" aria-hidden="true"><use href="#i-alert-circle"/></svg></span></div>
        <div class="card mt" data-c="Metric tile"><div><span class="l">Paid in 2026</span><b class="v">${paidLabel}</b><small>${paidDesc}</small></div><span class="tile good"><svg class="ic" aria-hidden="true"><use href="#i-coins-01"/></svg></span></div>
      `;
    }

    filterBilling();

    // Load Subscriptions container
    const subHost = document.getElementById('subscriptionsContainer');
    if (subHost) {
      if (!subscriptions.length) {
        subHost.innerHTML = renderEmptyState({
          icon: 'wallet-01',
          title: 'No subscriptions',
          message: 'Subscriptions appear after your first order.',
        });
      } else {
        subHost.innerHTML = subscriptions
          .map((sub) => {
            const isCancelScheduled = sub.status === 'CANCEL_SCHEDULED';
            const isCanceled = sub.status === 'CANCELED' || sub.status === 'TERMINATED';
            const tone = sub.status === 'ACTIVE' ? 'good' : isCancelScheduled ? 'warn' : '';
            const statusLabel = isCancelScheduled ? 'CANCELLATION SCHEDULED' : sub.status;

            return `<div class="li">
              <span class="tile ${tone} sm"><svg class="ic" aria-hidden="true"><use href="#i-wallet-01"/></svg></span>
              <span class="tx">
                <b>${esc(sub.serviceName)}</b>
                <small>${isCancelScheduled ? 'Cancels ' + formatDate(sub.nextRenewalDate) : 'Renews ' + formatDate(sub.nextRenewalDate) + ' · ' + esc(sub.billingInterval.toLowerCase())}</small>
              </span>
              <span class="pill ${tone}">${esc(statusLabel)}</span>
              ${
                isCanceled
                  ? ''
                  : `<button type="button" class="btn xs" data-cancel-sub="${esc(sub.id)}" data-sub-name="${esc(sub.serviceName)}" data-renewal-date="${formatDate(sub.nextRenewalDate)}">Manage</button>`
              }
            </div>`;
          })
          .join('');
      }
    }
  } catch (error: any) {
    host.innerHTML = `<tr><td colspan="6"><div class="alert bad"><div><b>Failed to load billing records</b><span>${esc(error.message)}</span></div></div></td></tr>`;
  }
}
