/**
 * Customer Portal — Deploy / Order Configuration Page Module
 * Route: /app/deploy
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { money } from '../../../core/utils/formatting.js';
import { hero, toast } from '../../../petal/index.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';

export interface DeployState {
  plans: any[];
  regions: any[];
  selectedPlanId: string | null;
  selectedRegionId: string | null;
  activeCoupon: { code: string; discountMinorUnits: number } | null;
}

export const deployState: DeployState = {
  plans: [],
  regions: [],
  selectedPlanId: null,
  selectedRegionId: 'reg_fra_1',
  activeCoupon: null,
};

export async function renderDeploy(): Promise<void> {
  if (deployState.plans.length && deployState.regions.length) {
    return renderCatalog();
  }

  const host = document.getElementById('planSelector');
  if (host) {
    host.innerHTML = `<div class="state-message">${hero('refresh')}<span>Loading catalog…</span></div>`;
  }

  try {
    const [plansRes, regionsRes] = await Promise.all([
      api<{ plans: any[] }>('/api/v1/catalog/plans'),
      api<{ regions: any[] }>('/api/v1/catalog/regions'),
    ]);

    deployState.plans = plansRes.plans || [];
    deployState.regions = regionsRes.regions || [];

    if (!deployState.selectedPlanId && deployState.plans[0]) {
      deployState.selectedPlanId = deployState.plans[0].planVersionId;
    }
    if (!deployState.selectedRegionId && deployState.regions[0]) {
      deployState.selectedRegionId = deployState.regions[0].id;
    }

    renderCatalog();
  } catch (error: any) {
    if (host) {
      host.innerHTML = `<div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div>`;
    }
  }
}

export function renderCatalog(): void {
  const host = document.getElementById('planSelector');
  if (host) {
    host.className = 'z-pls';
    host.innerHTML =
      deployState.plans
        .map((plan) => {
          const price = plan.prices[0];
          const selected = plan.planVersionId === deployState.selectedPlanId;
          return `
            <button type="button" class="z-plc" data-plan-id="${esc(plan.planVersionId)}" aria-pressed="${selected}">
              <span class="badge ${plan.categorySlug === 'game-servers' ? 'accent' : 'violet'} s">${esc(plan.categoryName)}</span>
              <b>${esc(plan.planName)}</b>
              <span class="p">${price ? money(price.priceMinorUnits, price.currency) : 'Unavailable'} <small>/${esc((price?.interval || '').toLowerCase())}</small></span>
              <small class="f">${esc(plan.productName)} · ${plan.resources.memoryMb / 1024} GB RAM · ${plan.resources.cpuPct}% CPU · ${plan.resources.diskMb / 1024} GB disk</small>
            </button>
          `;
        })
        .join('') ||
      `<div class="state-message warn">${hero('warning')}<span>No published plans are available.</span></div>`;
  }

  const regHost = document.getElementById('regionSelector');
  if (regHost && deployState.regions.length) {
    regHost.innerHTML = deployState.regions
      .map((reg) => {
        const flag = reg.country === 'DE' ? '🇩🇪' : reg.country === 'GB' ? '🇬🇧' : '🌐';
        const selected = reg.id === deployState.selectedRegionId;
        const statusText = reg.isSoldOut
          ? 'Sold out in this region'
          : `${Math.floor(reg.memoryAvailableMb / 1024)} GB RAM available`;
        const badge = reg.isSoldOut
          ? '<span class="badge red s" style="margin-left:auto">Sold Out</span>'
          : '<span class="badge green s" style="margin-left:auto">Available</span>';
        return `
          <button type="button" class="z-plc reg-card region-choice" data-region-id="${esc(reg.id)}" aria-pressed="${selected}" ${reg.isSoldOut ? 'disabled style="opacity:0.6"' : ''}>
            <div style="display:flex;align-items:center;width:100%">
              <b>${flag} ${esc(reg.name)} (${esc(reg.code)})</b>${badge}
            </div>
            <small class="f">${esc(statusText)}</small>
          </button>
        `;
      })
      .join('');
  }

  updateSummary();
}

export function updateSummary(): void {
  const plan = deployState.plans.find((item) => item.planVersionId === deployState.selectedPlanId);
  if (!plan) return;

  const price = plan.prices[0];
  const subtotal = price?.priceMinorUnits || 0;
  const discount = deployState.activeCoupon ? deployState.activeCoupon.discountMinorUnits : 0;
  const taxableSubtotal = Math.max(0, subtotal - discount);
  const tax = Math.round(taxableSubtotal * 0.19);
  const total = taxableSubtotal + tax;

  const sumPlan = document.getElementById('sumPlan');
  const sumReg = document.getElementById('sumReg');
  const sumVat = document.getElementById('sumVat');
  const sumTotal = document.getElementById('sumTotal');

  if (sumPlan) sumPlan.textContent = plan.planName;
  const selReg = deployState.regions.find((r) => r.id === deployState.selectedRegionId);
  if (sumReg) sumReg.textContent = selReg ? `${selReg.name} (${selReg.code})` : 'Frankfurt (catalog)';

  const rowDisc = document.getElementById('rowDiscount');
  if (rowDisc) {
    if (deployState.activeCoupon && discount > 0) {
      rowDisc.style.display = 'flex';
      const sumCode = document.getElementById('sumCouponCode');
      const sumDisc = document.getElementById('sumDiscount');
      if (sumCode) sumCode.textContent = deployState.activeCoupon.code;
      if (sumDisc) sumDisc.textContent = `-${money(discount, price?.currency || 'EUR')}`;
    } else {
      rowDisc.style.display = 'none';
    }
  }

  if (sumVat) sumVat.textContent = money(tax, price?.currency || 'EUR');
  if (sumTotal) sumTotal.textContent = money(total, price?.currency || 'EUR');
}

export async function beginCheckout(): Promise<void> {
  const button = document.getElementById('doDeployBtn') as HTMLButtonElement | null;
  const capabilities = capabilitiesStore.get();

  if (!capabilities?.payments?.enabled || !capabilities?.provisioning?.enabled) {
    return toast('Ordering is unavailable until payment and infrastructure providers are verified.', 'warn');
  }

  if (!deployState.selectedPlanId) return toast('Select a plan first.', 'warn');

  const nameInput = document.getElementById('deployServerName') as HTMLInputElement | null;
  const name = nameInput?.value.trim() || 'fortless-instance';

  if (button) {
    button.disabled = true;
    const span = button.querySelector('span');
    if (span) span.textContent = 'Preparing checkout…';
  }

  try {
    const quote = await api<{ id: string }>('/api/v1/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ planVersionId: deployState.selectedPlanId, quantity: 1, regionId: deployState.selectedRegionId }],
        billingCountry: 'DE',
        isB2B: false,
        couponCode: deployState.activeCoupon?.code || undefined,
      }),
    });

    const checkout = await api<{ checkoutUrl: string }>('/api/v1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        quoteId: quote.id,
        regionId: deployState.selectedRegionId,
        customOptions: { serverName: name },
      }),
    });

    window.location.href = checkout.checkoutUrl;
  } catch (error: any) {
    toast(error.message, 'bad');
  } finally {
    if (button) {
      button.disabled = false;
      const span = button.querySelector('span');
      if (span) span.textContent = 'Continue to secure checkout';
    }
  }
}
