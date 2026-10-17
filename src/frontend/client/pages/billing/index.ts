/**
 * Customer Portal — Billing & Invoices Page Module
 * Route: /app/billing
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { money } from '../../../core/utils/formatting.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, renderEmptyState, toast } from '../../../petal/index.js';

export async function renderBilling(): Promise<void> {
  const host = document.getElementById('invoicesTableBody');
  if (!host) return;

  host.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Loading billing records…</td></tr>';

  try {
    const { invoices } = await api<{ invoices: any[] }>('/api/v1/invoices');
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
        <div><small>Paid</small><b>${money(paid, currency)}</b></div>
        <div><small>Pending</small><b>${money(pending, currency)}</b></div>
        <div><small>Invoices</small><b>${invoices.length}</b></div>
      `;
    }

    if (!invoices.length) {
      host.innerHTML = `<tr><td colspan="6">${renderEmptyState({
        icon: 'document',
        title: 'No invoices',
        message: 'Issued billing records will appear here.',
      })}</td></tr>`;
    } else {
      host.innerHTML = invoices
        .map((invoice) => {
          const badgeClass = invoice.status === 'PAID' ? 'good' : invoice.status === 'DRAFT' ? '' : 'info';
          return `
            <tr class="mobile-record">
              <td data-label="Invoice"><b>${esc(invoice.invoice_number || 'Draft')}</b></td>
              <td data-label="Issued" class="muted">${esc(formatDate(invoice.created_at))}</td>
              <td data-label="Tax">${money(invoice.tax_minor_units, invoice.currency)}</td>
              <td data-label="Total" class="r num"><b>${money(invoice.total_minor_units, invoice.currency)}</b></td>
              <td data-label="Status"><span class="badge ${badgeClass} s">${esc(invoice.status)}</span></td>
              <td data-label="Record" class="r">
                <a href="/api/v1/invoices/${encodeURIComponent(invoice.id)}/download" class="btn s sec" download style="font-size:11px;padding:4px 8px;height:28px">
                  ${hero('document', 'xs')}Receipt
                </a>
              </td>
            </tr>
          `;
        })
        .join('');
    }

    // Load Subscriptions
    const subHost = document.getElementById('subscriptionsContainer');
    if (subHost) {
      try {
        const { subscriptions } = await api<{ subscriptions: any[] }>('/api/v1/subscriptions');
        if (!subscriptions.length) {
          subHost.innerHTML = '<div class="state-message">No active subscriptions.</div>';
        } else {
          subHost.innerHTML = `
            <div class="col" style="gap:8px">
              ${subscriptions
                .map((sub) => {
                  const isCancelScheduled = sub.status === 'CANCEL_SCHEDULED';
                  const isCanceled = sub.status === 'CANCELED' || sub.status === 'TERMINATED';
                  return `
                    <article class="li card s2" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px">
                      <div>
                        <b>${esc(sub.serviceName)}</b>
                        <span class="badge s ${sub.status === 'ACTIVE' ? 'good' : 'warn'}">${esc(sub.status)}</span>
                        <div class="muted" style="font-size:12px;margin-top:4px">
                          ${money(sub.renewalPriceMinorUnits, sub.currency)} / ${esc(sub.billingInterval.toLowerCase())} · Renews ${formatDate(sub.nextRenewalDate)}
                        </div>
                      </div>
                      <div class="actions">
                        ${
                          isCanceled
                            ? '<span class="badge s">Cancelled</span>'
                            : isCancelScheduled
                            ? '<span class="badge warn s">Cancellation Scheduled</span>'
                            : `<button type="button" class="btn badt s" data-cancel-sub="${esc(sub.id)}">Cancel subscription</button>`
                        }
                      </div>
                    </article>
                  `;
                })
                .join('')}
            </div>
          `;
        }
      } catch (err: any) {
        subHost.innerHTML = `<div class="state-message bad">${esc(err.message)}</div>`;
      }
    }
  } catch (error: any) {
    host.innerHTML = `<tr><td colspan="6"><div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div></td></tr>`;
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
