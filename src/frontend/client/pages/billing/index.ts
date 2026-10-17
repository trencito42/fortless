/**
 * Customer Portal — Billing & Invoices Page Module
 * Route: /app/billing
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { money } from '../../../core/utils/formatting.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, renderEmptyState, renderSkeleton, toast } from '../../../petal/index.js';

let invoiceCache: any[] = [];

function invoiceRow(invoice: any): string {
  const badgeClass = invoice.status === 'PAID' ? 'good' : invoice.status === 'DRAFT' ? '' : 'info';
  return `<tr class="mobile-record">
    <td data-label="Invoice"><b>${esc(invoice.invoice_number || 'Draft')}</b></td>
    <td data-label="Issued" class="muted">${esc(formatDate(invoice.created_at))}</td>
    <td data-label="Tax">${money(invoice.tax_minor_units, invoice.currency)}</td>
    <td data-label="Total" class="r num"><b>${money(invoice.total_minor_units, invoice.currency)}</b></td>
    <td data-label="Status"><span class="pill ${badgeClass}">${esc(invoice.status)}</span></td>
    <td data-label="Record" class="r"><a href="/api/v1/invoices/${encodeURIComponent(invoice.id)}/download" class="btn s sec" download>${hero('document', 'xs')}Receipt</a></td>
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

async function loadBillingProfile(): Promise<void> {
  try {
    const data = await api<{ user: any; account: any }>('/api/v1/auth/me');
    const name = document.getElementById('billProfileName');
    const workspace = document.getElementById('billProfileWorkspace');
    const email = document.getElementById('billProfileEmail');
    if (name) name.textContent = data.user?.name || data.account?.name || '—';
    if (workspace) workspace.textContent = data.account?.name || '—';
    if (email) email.textContent = data.user?.email || '—';
  } catch {
    // non-blocking
  }
}

export async function renderBilling(): Promise<void> {
  const host = document.getElementById('invoicesTableBody');
  if (!host) return;

  host.innerHTML = `<tr><td colspan="6">${renderSkeleton('table', 'Loading billing records')}</td></tr>`;
  loadBillingProfile();

  try {
    const { invoices } = await api<{ invoices: any[] }>('/api/v1/invoices');
    invoiceCache = invoices;
    const paid = invoices
      .filter((inv) => inv.status === 'PAID')
      .reduce((sum, inv) => sum + Number(inv.total_minor_units || 0), 0);
    const pending = invoices
      .filter((inv) => ['DRAFT', 'OPEN', 'PENDING'].includes(inv.status))
      .reduce((sum, inv) => sum + Number(inv.total_minor_units || 0), 0);
    const currency = invoices[0]?.currency || 'EUR';

    const summary = document.getElementById('invoiceSummary');
    if (summary) {
      summary.innerHTML = `
        <div class="mt"><small>Paid</small><b>${money(paid, currency)}</b></div>
        <div class="mt"><small>Pending</small><b>${money(pending, currency)}</b></div>
        <div class="mt"><small>Invoices</small><b>${invoices.length}</b></div>
      `;
    }

    filterBilling();

    // Load Subscriptions
    const subHost = document.getElementById('subscriptionsContainer');
    if (subHost) {
      subHost.innerHTML = renderSkeleton('list', 'Loading subscriptions');
      try {
        const { subscriptions } = await api<{ subscriptions: any[] }>('/api/v1/subscriptions');
        if (!subscriptions.length) {
          subHost.innerHTML = renderEmptyState({ icon: 'document', title: 'No active subscriptions', message: 'Active recurring services will appear here.' });
        } else {
          subHost.innerHTML = subscriptions
            .map((sub) => {
              const isCancelScheduled = sub.status === 'CANCEL_SCHEDULED';
              const isCanceled = sub.status === 'CANCELED' || sub.status === 'TERMINATED';
              const tone = sub.status === 'ACTIVE' ? 'good' : 'warn';
              return `<div class="li"><span class="tile ${tone} sm">${hero('server', 's')}</span><span class="tx"><b>${esc(sub.serviceName)}</b><small>${money(sub.renewalPriceMinorUnits, sub.currency)} / ${esc(sub.billingInterval.toLowerCase())} · Renews ${formatDate(sub.nextRenewalDate)}</small></span><span class="row" style="gap:8px;flex-shrink:0"><span class="pill ${tone}">${esc(sub.status)}</span>${
                isCanceled
                  ? '<span class="pill">Cancelled</span>'
                  : isCancelScheduled
                  ? '<span class="pill warn">Cancel scheduled</span>'
                  : `<button type="button" class="btn s sec" style="color:var(--bad)" data-cancel-sub="${esc(sub.id)}">Cancel</button>`
              }</span></div>`;
            })
            .join('');
        }
      } catch (err: any) {
        subHost.innerHTML = `<div class="alert bad"><div><b>Failed to load subscriptions</b><span>${esc(err.message)}</span></div></div>`;
      }
    }
  } catch (error: any) {
    host.innerHTML = `<tr><td colspan="6"><div class="alert bad"><div><b>Failed to load billing records</b><span>${esc(error.message)}</span></div></div></td></tr>`;
  }
}

export async function cancelSubscription(subId: string, button: HTMLButtonElement): Promise<void> {
  if (!confirm('Cancel this subscription at the end of the current billing period?')) return;
  button.disabled = true;
  try {
    await api(`/api/v1/subscriptions/${encodeURIComponent(subId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immediate: false }),
    });
    toast('Subscription cancelled at period end.', 'good');
    await renderBilling();
  } catch (err: any) {
    toast(err.message, 'bad');
    button.disabled = false;
  }
}
