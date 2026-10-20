/**
 * Customer Portal — Universal Deployment Experience
 * Route: /app/deploy
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { money } from '../../../core/utils/formatting.js';
import { hero, toast } from '../../../petal/index.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';
import type {
  WorkloadDefinition,
  DeploymentSpecification,
  DeploymentValidationResult,
} from '../../../../modules/deployment/types.js';

export interface DeployState {
  workloads: WorkloadDefinition[];
  plans: any[];
  regions: any[];
  selectedCategory: string;
  searchFilter: string;
  selectedWorkloadId: string | null;
  setupMode: 'QUICK' | 'CUSTOM';
  selectedSoftwareId: string | null;
  selectedSoftwareVersion: string | null;
  selectedPresetId: string | null;
  selectedAddons: Set<string>;
  configValues: Record<string, any>;
  selectedPlanId: string | null;
  selectedRegionId: string | null;
  activeCoupon: { code: string; discountMinorUnits: number } | null;
}

export const deployState: DeployState = {
  workloads: [],
  plans: [],
  regions: [],
  selectedCategory: 'all',
  searchFilter: '',
  selectedWorkloadId: null,
  setupMode: 'QUICK',
  selectedSoftwareId: null,
  selectedSoftwareVersion: null,
  selectedPresetId: null,
  selectedAddons: new Set<string>(),
  configValues: {},
  selectedPlanId: null,
  selectedRegionId: null,
  activeCoupon: null,
};

let deployStep = 0;
const TOTAL_STEPS = 5;

export function getSelectedWorkload(): WorkloadDefinition | undefined {
  return deployState.workloads.find((w) => w.id === deployState.selectedWorkloadId);
}

function checkoutReadiness(): { ready: boolean; reason: string } {
  if (deployStep !== 4) {
    return { ready: false, reason: 'Complete all steps to continue to secure checkout.' };
  }
  const workload = getSelectedWorkload();
  if (!workload || !workload.supported) {
    return { ready: false, reason: 'Select a supported workload first.' };
  }
  if (!deployState.selectedPlanId) {
    return { ready: false, reason: 'Select a resource plan.' };
  }
  const region = deployState.regions.find((item) => item.id === deployState.selectedRegionId && !item.isSoldOut);
  if (!region) {
    return { ready: false, reason: 'Select an available datacenter region.' };
  }
  const name = (document.getElementById('deployServerName') as HTMLInputElement | null)?.value.trim() ?? '';
  if (name.length < 3) {
    return { ready: false, reason: 'Enter a service label with at least 3 characters.' };
  }
  if (workload.id === 'minecraft' && deployState.setupMode === 'CUSTOM' && deployState.configValues['eulaAccepted'] !== true) {
    return { ready: false, reason: 'You must accept the Mojang Minecraft EULA to proceed.' };
  }
  const capabilities = capabilitiesStore.get();
  if (!capabilities?.payments?.enabled || !capabilities?.provisioning?.enabled) {
    return { ready: false, reason: 'Ordering unavailable until payment and infrastructure providers are verified.' };
  }
  return { ready: true, reason: 'You will continue to the secure payment provider.' };
}

export function updateDeployActions(): void {
  const next = document.getElementById('deployNextBtn') as HTMLButtonElement | null;
  const checkout = document.getElementById('doDeployBtn') as HTMLButtonElement | null;
  const hint = document.getElementById('deployCheckoutHint');
  const state = checkoutReadiness();

  if (next) next.hidden = deployStep === 4;
  if (checkout) {
    checkout.hidden = deployStep !== 4;
    checkout.disabled = !state.ready;
    checkout.dataset['checkoutReady'] = String(state.ready);
    const label = checkout.querySelector('span');
    if (label) label.textContent = state.ready ? 'Continue to secure checkout' : 'Checkout unavailable';
  }
  if (hint) hint.textContent = state.reason;
}

export function showDeployStep(nextStep: number): void {
  deployStep = Math.max(0, Math.min(TOTAL_STEPS - 1, nextStep));

  document.querySelectorAll<HTMLElement>('[data-deploy-pane]').forEach((pane) => {
    pane.classList.toggle('on', Number(pane.dataset['deployPane']) === deployStep);
  });

  document.querySelectorAll<HTMLElement>('[data-deploy-step-indicator]').forEach((indicator) => {
    const index = Number(indicator.dataset['deployStepIndicator']);
    indicator.className = `step${index < deployStep ? ' done' : index === deployStep ? ' cur' : ''}`;
    const marker = indicator.querySelector('i');
    if (marker) {
      if (index < deployStep) {
        marker.innerHTML = hero('check', 'xs');
      } else {
        marker.textContent = String(index + 1);
      }
    }
  });

  const back = document.getElementById('deployBackBtn') as HTMLButtonElement | null;
  const next = document.getElementById('deployNextBtn') as HTMLButtonElement | null;
  if (back) back.disabled = deployStep === 0;
  if (next) next.textContent = deployStep === 3 ? 'Review details' : 'Continue';

  // Render contextual step content
  if (deployStep === 1) renderSetupModes();
  else if (deployStep === 2) renderWorkloadConfiguration();
  else if (deployStep === 3) renderPlansAndRegions();
  else if (deployStep === 4) renderReviewStep();

  updateSummary();
  updateDeployActions();
}

function bindDeployWizard(): void {
  const wizard = document.getElementById('deployWizard');
  if (!wizard || wizard.dataset['bound'] === 'true') {
    return;
  }
  wizard.dataset['bound'] = 'true';

  document.getElementById('deployBackBtn')?.addEventListener('click', () => showDeployStep(deployStep - 1));
  document.getElementById('deployNextBtn')?.addEventListener('click', () => {
    if (deployStep === 0) {
      const workload = getSelectedWorkload();
      if (!workload) return toast('Select a workload to continue.', 'warn');
      if (!workload.supported) return toast(workload.unsupportedReason || 'This workload is unsupported.', 'bad');
      showDeployStep(1);
    } else if (deployStep === 1) {
      showDeployStep(2);
    } else if (deployStep === 2) {
      const workload = getSelectedWorkload();
      if (workload?.id === 'minecraft' && deployState.setupMode === 'CUSTOM' && deployState.configValues['eulaAccepted'] !== true) {
        return toast('You must accept the Minecraft EULA to proceed.', 'warn');
      }
      showDeployStep(3);
    } else if (deployStep === 3) {
      if (!deployState.selectedPlanId) return toast('Select a resource plan.', 'warn');
      if (!deployState.selectedRegionId) return toast('Select an available datacenter region.', 'warn');
      showDeployStep(4);
    }
  });

  document.getElementById('deployServerName')?.addEventListener('input', updateDeployActions);
  window.addEventListener('fortless:capabilities', updateDeployActions);

  // Search filter
  document.getElementById('workloadSearchInput')?.addEventListener('input', (e) => {
    deployState.searchFilter = (e.target as HTMLInputElement).value.trim().toLowerCase();
    renderWorkloadSelector();
  });

  // Coupon handling
  document.getElementById('applyCouponBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('couponInput') as HTMLInputElement | null;
    const code = input?.value.trim().toUpperCase();
    if (!code) return toast('Enter a promotion code.', 'warn');
    const plan = deployState.plans.find((p) => p.planVersionId === deployState.selectedPlanId);
    const subtotal = plan?.prices?.[0]?.priceMinorUnits || 1000;
    try {
      const res = await api<{ valid: boolean; discountMinorUnits: number }>('/api/v1/catalog/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalMinorUnits: subtotal }),
      });
      if (res.valid) {
        deployState.activeCoupon = { code, discountMinorUnits: res.discountMinorUnits };
        toast(`Coupon "${code}" applied!`, 'good');
        updateSummary();
      }
    } catch (err: any) {
      toast(err.message || 'Invalid coupon code', 'bad');
    }
  });
}

export async function renderDeploy(): Promise<void> {
  bindDeployWizard();

  const workloadHost = document.getElementById('workloadSelector');
  if (workloadHost && !deployState.workloads.length) {
    workloadHost.innerHTML = `<div class="sk" role="status" aria-label="Loading catalog"><i></i><i></i><i></i><i></i></div>`;
  }

  try {
    const [workloadsRes, plansRes, regionsRes] = await Promise.all([
      api<{ workloads: WorkloadDefinition[] }>('/api/v1/deploy/workloads'),
      api<{ plans: any[] }>('/api/v1/catalog/plans'),
      api<{ regions: any[] }>('/api/v1/catalog/regions'),
    ]);

    deployState.workloads = workloadsRes.workloads || [];
    deployState.plans = plansRes.plans || [];
    deployState.regions = regionsRes.regions || [];

    // Pre-select first supported workload if none selected
    if (!deployState.selectedWorkloadId) {
      const firstSupported = deployState.workloads.find((w) => w.supported);
      if (firstSupported) selectWorkload(firstSupported.id);
    }

    renderCategoryFilters();
    renderWorkloadSelector();
    showDeployStep(deployStep);
  } catch (error: any) {
    if (workloadHost) {
      workloadHost.innerHTML = `<div class="alert bad">${hero('warning', 's')}<div><b>Failed to load catalog</b><span>${esc(error.message)}</span></div></div>`;
    }
  }
}

function selectWorkload(id: string): void {
  deployState.selectedWorkloadId = id;
  const w = getSelectedWorkload();
  if (w) {
    deployState.selectedSoftwareId = w.softwareOptions[0]?.id || null;
    deployState.selectedSoftwareVersion = w.softwareOptions[0]?.defaultVersion || null;
    deployState.selectedPresetId = w.presets[0]?.id || null;
    deployState.selectedAddons.clear();

    // Default configs
    if (w.id === 'minecraft') {
      deployState.configValues = {
        difficulty: 'normal',
        gamemode: 'survival',
        pvp: true,
        maxPlayers: 20,
        motd: 'A Fortless Minecraft Server',
        eulaAccepted: true,
      };
    } else if (w.id === 'cs16') {
      deployState.configValues = {
        maxPlayers: 24,
        startingMap: 'de_dust2',
        environment: 'rehlds',
      };
    } else if (w.id === 'discord-bot') {
      deployState.configValues = {
        packageManager: 'npm',
        runtimeVersion: '20',
      };
    }

    // Auto-select first compatible plan if current is invalid
    const compatiblePlans = getCompatiblePlans();
    if (!compatiblePlans.some((p) => p.planVersionId === deployState.selectedPlanId)) {
      deployState.selectedPlanId = compatiblePlans[0]?.planVersionId || null;
    }
  }
  updateSummary();
}

function renderCategoryFilters(): void {
  const host = document.getElementById('workloadCategoryFilters');
  if (!host) return;

  const categories: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'All Workloads' },
    { id: 'game-servers', label: 'Game Servers' },
    { id: 'discord-bots', label: 'Discord Bots' },
    { id: 'apps', label: 'Applications & APIs' },
    { id: 'databases', label: 'Databases & Caches' },
  ];

  host.innerHTML = categories
    .map((c) => {
      const active = deployState.selectedCategory === c.id;
      return `<button type="button" class="btn xs ${active ? 'pri' : ''}" data-cat-filter="${esc(c.id)}">${esc(c.label)}</button>`;
    })
    .join('');

  host.querySelectorAll<HTMLButtonElement>('[data-cat-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      deployState.selectedCategory = btn.dataset['catFilter'] || 'all';
      renderCategoryFilters();
      renderWorkloadSelector();
    });
  });
}

function renderWorkloadSelector(): void {
  const host = document.getElementById('workloadSelector');
  if (!host) return;

  let filtered = deployState.workloads;
  if (deployState.selectedCategory !== 'all') {
    filtered = filtered.filter((w) => w.category === deployState.selectedCategory);
  }
  if (deployState.searchFilter) {
    const q = deployState.searchFilter;
    filtered = filtered.filter((w) => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q) || w.tagline.toLowerCase().includes(q));
  }

  if (!filtered.length) {
    host.innerHTML = `<div class="alert warn"><svg class="ic" aria-hidden="true"><use href="#i-alert-circle"/></svg><div><b>No matching workloads found</b><span>Try a different filter or search query.</span></div></div>`;
    return;
  }

  host.innerHTML = `
    <div class="g g2">
      ${filtered
        .map((w) => {
          const selected = w.id === deployState.selectedWorkloadId;
          const tone = !w.supported ? 'bad' : w.category === 'game-servers' ? 'acc' : w.category === 'discord-bots' ? 'violet' : 'good';
          const badge = !w.supported
            ? `<span class="pill bad">Unsupported</span>`
            : `<span class="pill ${tone}">${esc(w.category.replace('-', ' '))}</span>`;

          return `
            <button type="button" class="sel" data-workload-id="${esc(w.id)}" aria-pressed="${selected}" ${!w.supported ? 'style="opacity:0.65"' : ''}>
              <span class="row nw" style="justify-content:space-between;align-items:center">
                <span class="tile neu sm"><svg class="ic" aria-hidden="true"><use href="#i-${w.icon}"/></svg></span>
                ${badge}
              </span>
              <b style="font-size:15px;margin-top:4px">${esc(w.name)}</b>
              <small class="f" style="margin-top:2px">${esc(w.tagline)}</small>
              ${!w.supported && w.unsupportedReason ? `<p style="font-size:11px;color:var(--bad);margin-top:6px;line-height:1.4">${esc(w.unsupportedReason)}</p>` : ''}
            </button>
          `;
        })
        .join('')}
    </div>
  `;

  host.querySelectorAll<HTMLButtonElement>('[data-workload-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['workloadId']!;
      const w = deployState.workloads.find((x) => x.id === id);
      if (!w?.supported) {
        toast(w?.unsupportedReason || 'This workload is not supported for deployment.', 'bad');
        return;
      }
      selectWorkload(id);
      renderWorkloadSelector();
    });
  });
}

function renderSetupModes(): void {
  const host = document.getElementById('setupModeSelector');
  if (!host) return;

  const isQuick = deployState.setupMode === 'QUICK';
  const isCustom = deployState.setupMode === 'CUSTOM';

  host.innerHTML = `
    <button type="button" class="sel" data-mode="QUICK" aria-pressed="${isQuick}">
      <span class="row nw" style="justify-content:space-between;align-items:center">
        <span class="tile good sm"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg></span>
        <span class="pill good">Recommended</span>
      </span>
      <b style="font-size:16px;margin-top:4px">Quick Setup</b>
      <span class="p">Clean &amp; Minimal</span>
      <small class="f">Deploys a clean, verified instance with standard recommended defaults. Zero optional packages, plugins, or addons selected.</small>
    </button>

    <button type="button" class="sel" data-mode="CUSTOM" aria-pressed="${isCustom}">
      <span class="row nw" style="justify-content:space-between;align-items:center">
        <span class="tile acc sm"><svg class="ic" aria-hidden="true"><use href="#i-settings"/></svg></span>
        <span class="pill acc">Full Control</span>
      </span>
      <b style="font-size:16px;margin-top:4px">Custom Setup</b>
      <span class="p">Guided Configuration</span>
      <small class="f">Customize software versions, select game modes, tune server properties, and configure optional verified packages and dependencies.</small>
    </button>
  `;

  host.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      deployState.setupMode = btn.dataset['mode'] as 'QUICK' | 'CUSTOM';
      if (deployState.setupMode === 'QUICK') {
        deployState.selectedAddons.clear();
      }
      renderSetupModes();
      updateSummary();
    });
  });
}

function renderWorkloadConfiguration(): void {
  const host = document.getElementById('workloadConfigHost');
  const title = document.getElementById('step3Title');
  const subtitle = document.getElementById('step3Subtitle');
  if (!host) return;

  const w = getSelectedWorkload();
  if (!w) {
    host.innerHTML = `<div class="alert warn"><svg class="ic" aria-hidden="true"><use href="#i-alert-circle"/></svg><div><b>Select a workload first.</b></div></div>`;
    return;
  }

  if (title) title.textContent = `Configure ${w.name}`;
  if (subtitle) {
    subtitle.textContent = deployState.setupMode === 'QUICK'
      ? 'Quick setup: Confirm software distribution and runtime version.'
      : 'Custom setup: Tune software version, presets, addons, and server settings.';
  }

  // 1. Software Distribution Selector
  const softwareHtml = w.softwareOptions.length > 0 ? `
    <div class="col" style="gap:8px">
      <label style="font-weight:700;font-size:13px">Software Distribution</label>
      <div class="g g2">
        ${w.softwareOptions
          .map((sw) => {
            const selected = sw.id === deployState.selectedSoftwareId;
            return `
              <button type="button" class="sel" data-sw-id="${esc(sw.id)}" aria-pressed="${selected}">
                <span class="row nw" style="justify-content:space-between">
                  <b>${esc(sw.name)}</b>
                  ${sw.recommended ? '<span class="pill good">Recommended</span>' : ''}
                </span>
                <small class="f">${esc(sw.description)}</small>
              </button>
            `;
          })
          .join('')}
      </div>
    </div>
  ` : '';

  // 2. Version Picker
  const selectedSoftware = w.softwareOptions.find((s) => s.id === deployState.selectedSoftwareId) || w.softwareOptions[0];
  const versionHtml = selectedSoftware && selectedSoftware.versions.length > 0 ? `
    <div class="fld">
      <label for="cfgSoftwareVersion">Version</label>
      <div class="inp">
        <select id="cfgSoftwareVersion">
          ${selectedSoftware.versions
            .map((v) => `<option value="${esc(v)}" ${v === deployState.selectedSoftwareVersion ? 'selected' : ''}>${esc(v)}${v === selectedSoftware.defaultVersion ? ' (Recommended Default)' : ''}</option>`)
            .join('')}
        </select>
      </div>
    </div>
  ` : '';

  // 3. Custom Mode Additions (Workload Specific)
  let customHtml = '';

  if (deployState.setupMode === 'CUSTOM') {
    // Presets / Game Modes
    if (w.presets.length > 0) {
      customHtml += `
        <div class="col" style="gap:8px">
          <label style="font-weight:700;font-size:13px">${w.id === 'cs16' ? 'Curated Game Mode' : 'Configuration Preset'}</label>
          <div class="g g2">
            ${w.presets
              .map((p) => {
                const selected = p.id === deployState.selectedPresetId;
                return `
                  <button type="button" class="sel" data-preset-id="${esc(p.id)}" aria-pressed="${selected}">
                    <b>${esc(p.name)}</b>
                    <small class="f">${esc(p.description)}</small>
                    ${p.requiredDependencies.length ? `<span class="pill neu xs" style="margin-top:4px">Requires: ${esc(p.requiredDependencies.join(', '))}</span>` : ''}
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    // Workload Specific Custom Fields
    if (w.id === 'minecraft') {
      const eulaChecked = deployState.configValues['eulaAccepted'] === true;
      customHtml += `
        <div class="card flat" style="background:var(--s1);padding:14px;border-radius:10px">
          <h4 style="margin-bottom:8px">Server Settings</h4>
          <div class="g g2">
            <div class="fld">
              <label for="mcDifficulty">Difficulty</label>
              <div class="inp">
                <select id="mcDifficulty">
                  <option value="peaceful" ${deployState.configValues['difficulty'] === 'peaceful' ? 'selected' : ''}>Peaceful</option>
                  <option value="easy" ${deployState.configValues['difficulty'] === 'easy' ? 'selected' : ''}>Easy</option>
                  <option value="normal" ${deployState.configValues['difficulty'] === 'normal' ? 'selected' : ''}>Normal</option>
                  <option value="hard" ${deployState.configValues['difficulty'] === 'hard' ? 'selected' : ''}>Hard</option>
                </select>
              </div>
            </div>
            <div class="fld">
              <label for="mcGamemode">Default Game Mode</label>
              <div class="inp">
                <select id="mcGamemode">
                  <option value="survival" ${deployState.configValues['gamemode'] === 'survival' ? 'selected' : ''}>Survival</option>
                  <option value="creative" ${deployState.configValues['gamemode'] === 'creative' ? 'selected' : ''}>Creative</option>
                  <option value="adventure" ${deployState.configValues['gamemode'] === 'adventure' ? 'selected' : ''}>Adventure</option>
                </select>
              </div>
            </div>
          </div>
          <div class="fld" style="margin-top:10px">
            <label for="mcMotd">Server Description (MOTD)</label>
            <div class="inp"><input type="text" id="mcMotd" value="${esc(deployState.configValues['motd'] || 'A Fortless Minecraft Server')}"></div>
          </div>
          <div class="fld" style="margin-top:12px">
            <label class="row nw" style="align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="mcEula" ${eulaChecked ? 'checked' : ''} style="width:18px;height:18px">
              <b>I accept the Mojang Minecraft End User License Agreement (EULA)</b>
            </label>
            <span class="hint">Acceptance writes eula=true to eula.txt upon provisioning.</span>
          </div>
        </div>
      `;
    } else if (w.id === 'cs16') {
      customHtml += `
        <div class="card flat" style="background:var(--s1);padding:14px;border-radius:10px">
          <h4 style="margin-bottom:8px">CS 1.6 Environment &amp; Startup</h4>
          <div class="g g2">
            <div class="fld">
              <label for="cs16Slots">Server Slots</label>
              <div class="inp">
                <select id="cs16Slots">
                  <option value="16" ${deployState.configValues['maxPlayers'] === 16 ? 'selected' : ''}>16 Players</option>
                  <option value="24" ${deployState.configValues['maxPlayers'] === 24 || !deployState.configValues['maxPlayers'] ? 'selected' : ''}>24 Players (Recommended)</option>
                  <option value="32" ${deployState.configValues['maxPlayers'] === 32 ? 'selected' : ''}>32 Players</option>
                </select>
              </div>
            </div>
            <div class="fld">
              <label for="cs16Map">Starting Map</label>
              <div class="inp">
                <select id="cs16Map">
                  <option value="de_dust2" ${deployState.configValues['startingMap'] === 'de_dust2' ? 'selected' : ''}>de_dust2</option>
                  <option value="de_inferno" ${deployState.configValues['startingMap'] === 'de_inferno' ? 'selected' : ''}>de_inferno</option>
                  <option value="de_nuke" ${deployState.configValues['startingMap'] === 'de_nuke' ? 'selected' : ''}>de_nuke</option>
                  <option value="cs_assault" ${deployState.configValues['startingMap'] === 'cs_assault' ? 'selected' : ''}>cs_assault</option>
                </select>
              </div>
            </div>
          </div>
          <div class="alert info" style="margin-top:10px">
            <svg class="ic s" aria-hidden="true"><use href="#i-information-circle"/></svg>
            <div><b>GoldSrc Startup Isolation</b><span>Uses pure GoldSrc binary arguments (-game cstrike -pingboost 2). No Source engine parameters are leaked.</span></div>
          </div>
        </div>
      `;
    } else if (w.id === 'discord-bot') {
      customHtml += `
        <div class="card flat" style="background:var(--s1);padding:14px;border-radius:10px">
          <h4 style="margin-bottom:8px">Discord Bot Credentials &amp; Runtime</h4>
          <div class="fld">
            <label for="botTokenInput">Bot Secret Token (Encrypted at rest, masked in UI)</label>
            <div class="inp">
              <input type="password" id="botTokenInput" placeholder="OTk3..." value="${esc(deployState.configValues['botToken'] || '')}" autocomplete="new-password">
            </div>
            <span class="hint">Obtain token in Discord Developer Portal → Bot → Reset Token. Token is stored securely and never exposed in logs.</span>
          </div>
          <div class="alert info" style="margin-top:10px">
            <svg class="ic s" aria-hidden="true"><use href="#i-information-circle"/></svg>
            <div><b>Discord Developer Portal Intents</b><span>If your bot reads message content or monitors guild member joins, ensure Message Content Intent and Server Members Intent are enabled in the portal.</span></div>
          </div>
        </div>
      `;
    }

    // Optional Addons
    if (w.addonOptions.length > 0) {
      customHtml += `
        <div class="col" style="gap:8px">
          <label style="font-weight:700;font-size:13px">Optional Verified Addons &amp; Packages</label>
          <div class="col" style="gap:6px">
            ${w.addonOptions
              .map((a) => {
                const checked = deployState.selectedAddons.has(a.id);
                const isBukkitOnForge = (selectedSoftware?.ecosystem === 'fabric' || selectedSoftware?.ecosystem === 'forge') && ['essentialsx', 'vault', 'viaversion'].includes(a.id);
                return `
                  <label class="card flat" style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;opacity:${isBukkitOnForge ? '0.5' : '1'}">
                    <input type="checkbox" data-addon-id="${esc(a.id)}" ${checked ? 'checked' : ''} ${isBukkitOnForge ? 'disabled' : ''} style="width:18px;height:18px">
                    <div class="col" style="flex:1">
                      <div class="row nw" style="justify-content:space-between">
                        <b>${esc(a.name)}</b>
                        <span class="pill neu xs">${esc(a.kind)}</span>
                      </div>
                      <small class="f">${esc(a.description)}</small>
                      ${isBukkitOnForge ? '<small style="color:var(--bad)">Incompatible with Forge/Fabric mod loaders.</small>' : ''}
                    </div>
                  </label>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }
  }

  host.innerHTML = `
    ${softwareHtml}
    ${versionHtml}
    ${customHtml}
  `;

  // Bind events
  host.querySelectorAll<HTMLButtonElement>('[data-sw-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      deployState.selectedSoftwareId = btn.dataset['swId']!;
      const sw = w.softwareOptions.find((x) => x.id === deployState.selectedSoftwareId);
      deployState.selectedSoftwareVersion = sw?.defaultVersion || null;
      renderWorkloadConfiguration();
      updateSummary();
    });
  });

  document.getElementById('cfgSoftwareVersion')?.addEventListener('change', (e) => {
    deployState.selectedSoftwareVersion = (e.target as HTMLSelectElement).value;
    updateSummary();
  });

  host.querySelectorAll<HTMLButtonElement>('[data-preset-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset['presetId']!;
      deployState.selectedPresetId = pid;
      const preset = w.presets.find((x) => x.id === pid);
      if (preset) {
        // Auto-select required dependencies and recommended addons for this preset
        preset.requiredDependencies.forEach((d) => deployState.selectedAddons.add(d));
        preset.recommendedAddons.forEach((d) => deployState.selectedAddons.add(d));
      }
      renderWorkloadConfiguration();
      updateSummary();
    });
  });

  host.querySelectorAll<HTMLInputElement>('[data-addon-id]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const aid = chk.dataset['addonId']!;
      if (chk.checked) deployState.selectedAddons.add(aid);
      else deployState.selectedAddons.delete(aid);
      updateSummary();
    });
  });

  // Minecraft specific bindings
  document.getElementById('mcDifficulty')?.addEventListener('change', (e) => {
    deployState.configValues['difficulty'] = (e.target as HTMLSelectElement).value;
  });
  document.getElementById('mcGamemode')?.addEventListener('change', (e) => {
    deployState.configValues['gamemode'] = (e.target as HTMLSelectElement).value;
  });
  document.getElementById('mcMotd')?.addEventListener('input', (e) => {
    deployState.configValues['motd'] = (e.target as HTMLInputElement).value;
  });
  document.getElementById('mcEula')?.addEventListener('change', (e) => {
    deployState.configValues['eulaAccepted'] = (e.target as HTMLInputElement).checked;
    updateDeployActions();
  });

  // CS 1.6 bindings
  document.getElementById('cs16Slots')?.addEventListener('change', (e) => {
    deployState.configValues['maxPlayers'] = Number((e.target as HTMLSelectElement).value);
  });
  document.getElementById('cs16Map')?.addEventListener('change', (e) => {
    deployState.configValues['startingMap'] = (e.target as HTMLSelectElement).value;
  });

  // Discord bot bindings
  document.getElementById('botTokenInput')?.addEventListener('input', (e) => {
    deployState.configValues['botToken'] = (e.target as HTMLInputElement).value.trim();
  });
}

function getCompatiblePlans(): any[] {
  const w = getSelectedWorkload();
  if (!w) return deployState.plans;
  const minMem = w.minMemoryMb || 512;
  return deployState.plans.filter((p) => {
    const mem = p.resources?.memoryMb || 0;
    return mem >= minMem;
  });
}

function renderPlansAndRegions(): void {
  const planHost = document.getElementById('planSelector');
  if (planHost) {
    const compatible = getCompatiblePlans();
    if (!compatible.length) {
      planHost.innerHTML = `<div class="alert warn"><svg class="ic" aria-hidden="true"><use href="#i-alert-circle"/></svg><div><b>No compatible plans found</b><span>This workload requires higher resource allocations.</span></div></div>`;
    } else {
      planHost.innerHTML = `
        <div class="g g2">
          ${compatible
            .map((plan) => {
              const price = plan.prices[0];
              const selected = plan.planVersionId === deployState.selectedPlanId;
              const tone = plan.categorySlug === 'game-servers' ? 'acc' : 'violet';
              return `
                <button type="button" class="sel" data-plan-id="${esc(plan.planVersionId)}" aria-pressed="${selected}">
                  <span class="pill ${tone}">${esc(plan.categoryName)}</span>
                  <b>${esc(plan.planName)}</b>
                  <span class="p">${price ? money(price.priceMinorUnits, price.currency) : 'Unavailable'} <small>/${esc((price?.interval || '').toLowerCase())}</small></span>
                  <small class="f">${esc(plan.productName)} · ${plan.resources.memoryMb / 1024} GB RAM · ${plan.resources.cpuPct}% CPU · ${plan.resources.diskMb / 1024} GB disk</small>
                </button>
              `;
            })
            .join('')}
        </div>
      `;

      planHost.querySelectorAll<HTMLButtonElement>('[data-plan-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          deployState.selectedPlanId = btn.dataset['planId']!;
          renderPlansAndRegions();
          updateSummary();
        });
      });
    }
  }

  const regHost = document.getElementById('regionSelector');
  if (regHost && deployState.regions.length) {
    regHost.innerHTML = `
      <div class="g g2">
        ${deployState.regions
          .map((reg) => {
            const flag = reg.country === 'DE' ? '🇩🇪' : reg.country === 'GB' ? '🇬🇧' : '🌐';
            const selected = reg.id === deployState.selectedRegionId;
            const statusText = reg.isSoldOut
              ? 'Sold out in this region'
              : `${Math.floor(reg.memoryAvailableMb / 1024)} GB RAM available`;
            const avail = reg.isSoldOut
              ? `<span class="pill bad" style="margin-left:auto">Sold out</span>`
              : `<span class="pill good" style="margin-left:auto">Available</span>`;
            return `
              <button type="button" class="sel" data-region-id="${esc(reg.id)}" aria-pressed="${selected}" ${reg.isSoldOut ? 'disabled' : ''}>
                <span class="row nw"><b>${flag} ${esc(reg.name)} (${esc(reg.code)})</b>${avail}</span>
                <small class="f">${esc(statusText)}</small>
              </button>
            `;
          })
          .join('')}
      </div>
    `;

    regHost.querySelectorAll<HTMLButtonElement>('[data-region-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        deployState.selectedRegionId = btn.dataset['regionId']!;
        renderPlansAndRegions();
        updateSummary();
      });
    });
  }
}

function renderReviewStep(): void {
  const host = document.getElementById('deployReviewDetails');
  if (!host) return;

  const w = getSelectedWorkload();
  const plan = deployState.plans.find((p) => p.planVersionId === deployState.selectedPlanId);
  const reg = deployState.regions.find((r) => r.id === deployState.selectedRegionId);
  const sw = w?.softwareOptions.find((s) => s.id === deployState.selectedSoftwareId);
  const addons = Array.from(deployState.selectedAddons);

  host.innerHTML = `
    <div class="card flat" style="background:var(--s1);padding:14px;border-radius:10px">
      <h4 style="margin-bottom:8px">Deployment Specification Snapshot</h4>
      <dl class="kv">
        <dt>Workload</dt><dd><b>${esc(w?.name || '—')}</b></dd>
        <dt>Software Distribution</dt><dd>${esc(sw?.name || 'Standard')} (${esc(deployState.selectedSoftwareVersion || 'Default')})</dd>
        <dt>Setup Mode</dt><dd><span class="pill ${deployState.setupMode === 'QUICK' ? 'good' : 'acc'}">${esc(deployState.setupMode)}</span></dd>
        <dt>Installed Addons</dt><dd>${addons.length ? esc(addons.join(', ')) : '<span class="faint">Clean installation (0 optional addons)</span>'}</dd>
        <dt>Target Node Region</dt><dd>${esc(reg ? `${reg.name} (${reg.code})` : '—')}</dd>
        <dt>Resource Allocation</dt><dd>${plan ? `${plan.resources.memoryMb / 1024} GB RAM · ${plan.resources.cpuPct}% CPU · ${plan.resources.diskMb / 1024} GB disk` : '—'}</dd>
      </dl>
    </div>
    <div class="alert info">
      <svg class="ic s" aria-hidden="true"><use href="#i-shield-check"/></svg>
      <div><b>Verifiable Deployment Guarantee</b><span>Pterodactyl container creation and post-provisioning tasks are tracked individually. No fake operational states are reported.</span></div>
    </div>
  `;
}

export function updateSummary(): void {
  const w = getSelectedWorkload();
  const plan = deployState.plans.find((item) => item.planVersionId === deployState.selectedPlanId);
  const sw = w?.softwareOptions.find((s) => s.id === deployState.selectedSoftwareId);

  const sumWorkload = document.getElementById('sumWorkload');
  const sumSoftware = document.getElementById('sumSoftware');
  const sumMode = document.getElementById('sumMode');
  const sumAddons = document.getElementById('sumAddons');
  const sumPlan = document.getElementById('sumPlan');
  const sumReg = document.getElementById('sumReg');
  const sumTotal = document.getElementById('sumTotal');

  if (sumWorkload) sumWorkload.textContent = w?.name || 'Not selected';
  if (sumSoftware) sumSoftware.textContent = sw ? `${sw.name} ${deployState.selectedSoftwareVersion || ''}` : '—';
  if (sumMode) sumMode.textContent = deployState.setupMode === 'QUICK' ? 'Quick Setup' : 'Custom Setup';

  const addonsList = Array.from(deployState.selectedAddons);
  if (sumAddons) sumAddons.textContent = addonsList.length ? `${addonsList.length} package(s)` : 'Clean (none)';

  if (!plan) {
    if (sumPlan) sumPlan.textContent = 'Not selected';
    if (sumReg) sumReg.textContent = 'Not selected';
    if (sumTotal) sumTotal.textContent = '—';
    updateDeployActions();
    return;
  }

  const price = plan.prices[0];
  const subtotal = price?.priceMinorUnits || 0;
  const discount = deployState.activeCoupon ? deployState.activeCoupon.discountMinorUnits : 0;
  const estimatedSubtotal = Math.max(0, subtotal - discount);

  if (sumPlan) sumPlan.textContent = plan.planName;
  const selReg = deployState.regions.find((r) => r.id === deployState.selectedRegionId);
  if (sumReg) sumReg.textContent = selReg ? `${selReg.name} (${selReg.code})` : 'Not selected';

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

  if (sumTotal) sumTotal.textContent = money(estimatedSubtotal, price?.currency || 'EUR');
  updateDeployActions();
}

export function buildDeploymentSpecification(): DeploymentSpecification {
  const w = getSelectedWorkload();
  const nameInput = document.getElementById('deployServerName') as HTMLInputElement | null;
  const serverName = nameInput?.value.trim() || 'my-service';

  const spec: DeploymentSpecification = {
    workloadId: w?.id || 'minecraft',
    setupMode: deployState.setupMode,
    softwareId: deployState.selectedSoftwareId || 'paper',
    softwareVersion: deployState.selectedSoftwareVersion || '1.20.4',
    presetId: deployState.selectedPresetId || undefined,
    selectedAddons: Array.from(deployState.selectedAddons),
    environmentVariables: {},
    serverProperties: w?.id === 'minecraft' ? deployState.configValues : undefined,
    cs16Config: w?.id === 'cs16' ? {
      environment: deployState.configValues['environment'] || 'rehlds',
      maxPlayers: deployState.configValues['maxPlayers'] || 24,
      startingMap: deployState.configValues['startingMap'] || 'de_dust2',
      gameMode: deployState.selectedPresetId || 'classic',
    } : undefined,
    botConfig: w?.id === 'discord-bot' ? {
      tokenSecret: deployState.configValues['botToken'],
      packageManager: deployState.configValues['packageManager'] || 'npm',
      runtimeVersion: deployState.selectedSoftwareVersion || '20',
      deploymentPath: (deployState.selectedPresetId as any) || 'blank',
    } : undefined,
    appConfig: w?.id === 'nodejs-app' ? {
      runtimeVersion: deployState.selectedSoftwareVersion || '20',
      port: 3000,
      deploymentPath: (deployState.selectedPresetId as any) || 'blank',
    } : undefined,
    eulaAccepted: deployState.setupMode === 'QUICK' ? true : deployState.configValues['eulaAccepted'] === true,
    serverName,
    planVersionId: deployState.selectedPlanId || '',
    regionId: deployState.selectedRegionId || 'reg_fra_1',
  };

  return spec;
}

export async function beginCheckout(): Promise<void> {
  const button = document.getElementById('doDeployBtn') as HTMLButtonElement | null;
  const capabilities = capabilitiesStore.get();

  if (deployStep !== 4) return toast('Complete all configuration steps before checkout.', 'warn');

  if (!capabilities?.payments?.enabled || !capabilities?.provisioning?.enabled) {
    return toast('Ordering is unavailable until payment and infrastructure providers are verified.', 'warn');
  }

  const spec = buildDeploymentSpecification();

  if (button) {
    button.disabled = true;
    const span = button.querySelector('span');
    if (span) span.textContent = 'Validating configuration…';
  }

  try {
    // 1. Pre-flight Validation
    const validation = await api<DeploymentValidationResult>('/api/v1/deploy/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
    });

    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    if (button) {
      const span = button.querySelector('span');
      if (span) span.textContent = 'Preparing signed quote…';
    }

    // 2. Generate Authoritative Quote
    const quote = await api<{ id: string }>('/api/v1/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          planVersionId: deployState.selectedPlanId,
          quantity: 1,
          regionId: deployState.selectedRegionId,
          customOptions: { deploymentSpec: spec, serverName: spec.serverName },
        }],
        couponCode: deployState.activeCoupon?.code || undefined,
      }),
    });

    if (button) {
      const span = button.querySelector('span');
      if (span) span.textContent = 'Redirecting to checkout…';
    }

    // 3. Initiate Checkout
    const checkout = await api<{ checkoutUrl: string }>('/api/v1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        quoteId: quote.id,
        regionId: deployState.selectedRegionId,
        customOptions: { deploymentSpec: spec, serverName: spec.serverName },
      }),
    });

    window.location.href = checkout.checkoutUrl;
  } catch (error: any) {
    toast(error.message || 'Checkout initiation failed.', 'bad');
  } finally {
    if (button) {
      updateDeployActions();
    }
  }
}
