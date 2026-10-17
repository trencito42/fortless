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

let deployStep = 0;

function showDeployStep(nextStep: number): void {
  deployStep = Math.max(0, Math.min(2, nextStep));
  document.querySelectorAll<HTMLElement>('[data-deploy-pane]').forEach((pane) => {
    pane.classList.toggle('on', Number(pane.dataset.deployPane) === deployStep);
  });
  document.querySelectorAll<HTMLElement>('[data-deploy-step-indicator]').forEach((indicator) => {
    const index = Number(indicator.dataset.deployStepIndicator);
    indicator.className = `step${index < deployStep ? ' done' : index === deployStep ? ' cur' : ''}`;
    const marker = indicator.querySelector('i');
    if (marker) marker.textContent = index < deployStep ? '✓' : String(index + 1);
  });
  const back = document.getElementById('deployBackBtn') as HTMLButtonElement | null;
  const next = document.getElementById('deployNextBtn') as HTMLButtonElement | null;
  if (back) back.disabled = deployStep === 0;
  if (next) next.textContent = deployStep === 2 ? 'Review order' : 'Continue';
}

function bindDeployWizard(): void {
  const wizard = document.getElementById('deployWizard');
  if (!wizard || wizard.dataset.bound === 'true') {
    showDeployStep(deployStep);
    return;
  }
  wizard.dataset.bound = 'true';
  document.getElementById('deployBackBtn')?.addEventListener('click', () => showDeployStep(deployStep - 1));
  document.getElementById('deployNextBtn')?.addEventListener('click', () => {
    if (deployStep === 0 && !deployState.selectedPlanId) return toast('Select a plan first.', 'warn');
    if (deployStep === 1 && !deployState.selectedRegionId) return toast('Select an available region.', 'warn');
    if (deployStep < 2) return showDeployStep(deployStep + 1);
    const name = (document.getElementById('deployServerName') as HTMLInputElement | null)?.value.trim();
    if (!name || name.length < 3) return toast('Enter a service label with at least 3 characters.', 'warn');
    document.querySelector('.summary-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  showDeployStep(deployStep);
}

export async function renderDeploy(): Promise<void> {
  bindDeployWizard();
  if (deployState.plans.length && deployState.regions.length) {
    return renderCatalog();
  }

  const host = document.getElementById('planSelector');
  if (host) {
    host.innerHTML = `<div class="sk" role="status" aria-label="Loading catalog"><i></i><i></i><i></i><i></i></div>`;
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
      host.innerHTML = `<div class="alert bad">${hero('warning', 's')}<div><b>Failed to load catalog</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
}

export function renderCatalog(): void {
  const host = document.getElementById('planSelector');
  if (host) {
    const planHtml = deployState.plans
      .map((plan) => {
        const price = plan.prices[0];
        const selected = plan.planVersionId === deployState.selectedPlanId;
        const tone = plan.categorySlug === 'game-servers' ? 'acc' : 'violet';
        return `<button type="button" class="sel" data-plan-id="${esc(plan.planVersionId)}" aria-pressed="${selected}"><span class="pill ${tone}">${esc(plan.categoryName)}</span><b>${esc(plan.planName)}</b><span class="p">${price ? money(price.priceMinorUnits, price.currency) : 'Unavailable'} <small>/${esc((price?.interval || '').toLowerCase())}</small></span><small class="f">${esc(plan.productName)} · ${plan.resources.memoryMb / 1024} GB RAM · ${plan.resources.cpuPct}% CPU · ${plan.resources.diskMb / 1024} GB disk</small></button>`;
      })
      .join('');
    host.innerHTML = planHtml
      ? `<div class="grid g2">${planHtml}</div>`
      : `<div class="alert warn">${hero('warning', 's')}<div><b>No published plans available</b></div></div>`;
  }

  const regHost = document.getElementById('regionSelector');
  if (regHost && deployState.regions.length) {
    const regHtml = deployState.regions
      .map((reg) => {
        const flag = reg.country === 'DE' ? '🇩🇪' : reg.country === 'GB' ? '🇬🇧' : '🌐';
        const selected = reg.id === deployState.selectedRegionId;
        const statusText = reg.isSoldOut
          ? 'Sold out in this region'
          : `${Math.floor(reg.memoryAvailableMb / 1024)} GB RAM available`;
        const avail = reg.isSoldOut
          ? `<span class="pill bad" style="margin-left:auto">Sold out</span>`
          : `<span class="pill good" style="margin-left:auto">Available</span>`;
        return `<button type="button" class="sel" data-region-id="${esc(reg.id)}" aria-pressed="${selected}"${reg.isSoldOut ? ' disabled' : ''}><span class="row nw"><b>${flag} ${esc(reg.name)} (${esc(reg.code)})</b>${avail}</span><small class="f">${esc(statusText)}</small></button>`;
      })
      .join('');
    regHost.innerHTML = `<div class="grid g2">${regHtml}</div>`;
  }

  updateSummary();
}

export function updateSummary(): void {
  const plan = deployState.plans.find((item) => item.planVersionId === deployState.selectedPlanId);
  if (!plan) return;

  const price = plan.prices[0];
  const subtotal = price?.priceMinorUnits || 0;
  const discount = deployState.activeCoupon ? deployState.activeCoupon.discountMinorUnits : 0;
  const estimatedSubtotal = Math.max(0, subtotal - discount);

  const sumPlan = document.getElementById('sumPlan');
  const sumReg = document.getElementById('sumReg');
  const sumVat = document.getElementById('sumVat');
  const sumTotal = document.getElementById('sumTotal');

  if (sumPlan) sumPlan.textContent = plan.planName;
  const selReg = deployState.regions.find((r) => r.id === deployState.selectedRegionId);
  if (sumReg) sumReg.textContent = selReg ? `${selReg.name} (${selReg.code})` : 'Frankfurt (catalog)';

  const rowDisc = document.getElementById('rowDiscount');
  const discountLabel = document.getElementById('sumDiscountLabel');
  if (rowDisc) {
    if (deployState.activeCoupon && discount > 0) {
      rowDisc.hidden = false;
      if (discountLabel) discountLabel.hidden = false;
      const sumCode = document.getElementById('sumCouponCode');
      const sumDisc = document.getElementById('sumDiscount');
      if (sumCode) sumCode.textContent = `(${deployState.activeCoupon.code})`;
      if (sumDisc) sumDisc.textContent = `-${money(discount, price?.currency || 'EUR')}`;
    } else {
      rowDisc.hidden = true;
      if (discountLabel) discountLabel.hidden = true;
    }
  }

  if (sumVat) sumVat.textContent = 'Calculated by secure quote';
  if (sumTotal) sumTotal.textContent = money(estimatedSubtotal, price?.currency || 'EUR');
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
