/**
 * Staff Control Plane — Main Entrypoint
 * Bundles to public/assets/admin-ui.js
 */

import { Router } from '../core/router/router.js';
import { ADMIN_ROUTES } from '../core/router/routes.js';
import { api } from '../core/api/client.js';
import { AdminShell } from './shell/admin-shell.js';

// Feature Pages
import { renderOverview } from './pages/overview/index.js';
import { renderAccounts, openAccountDetail, getActiveAccountId } from './pages/accounts/index.js';
import { renderServices, openServiceDetail } from './pages/services/index.js';
import {
  renderCatalog,
  filterCatalog,
  openProductCreator,
  openPlanCreator,
  setProductPublished,
  setPlanStatus,
  submitProduct,
  submitPlan,
  openCreateProductFromEgg,
  submitProductFromEgg,
} from './pages/catalog/index.js';
import { renderTickets, openTicketDetail, getActiveTicketId } from './pages/tickets/index.js';
import { renderAudit } from './pages/audit/index.js';
import { renderStaff, openStaffEditor } from './pages/staff/index.js';
import { renderOrders, renderBilling, renderInfrastructure, renderStatus } from './pages/operations/index.js';
import { renderSettings, testProviderConnection } from './pages/settings/index.js';
import { toast } from '../petal/index.js';

const adminShell = new AdminShell();
const router = new Router(ADMIN_ROUTES);

function updateAdminChrome(routeName: string) {
  const titles: Record<string, [string, string]> = {
    overview: ['Operations overview', 'Real platform records, without simulated operational controls.'],
    accounts: ['Customer accounts', 'Ownership, membership and workload counts. Click an account to inspect or lock.'],
    services: ['Service inventory', 'Contract and provider-observed state.'],
    orders: ['Orders', 'Commercial order lifecycle and fulfillment state.'],
    billing: ['Billing operations', 'Invoices, credit notes and payment state.'],
    infrastructure: ['Infrastructure', 'Capacity pools and provider readiness.'],
    catalog: ['Catalog & providers', 'Products stay private until plans are mapped to real provider inventory.'],
    tickets: ['Support queue', 'Real customer threads. Click a ticket to view and reply.'],
    audit: ['Global audit trail', 'Security-relevant events across accounts.'],
    staff: ['Staff access', 'Persisted roles, access status and MFA readiness. Click to edit role.'],
    status: ['System status', 'Components and customer-visible incidents.'],
    settings: ['Platform settings & integrations', 'Environment configuration, payment modes, transactional mail, and hypervisor API diagnostics.'],
  };

  const titleEntry = titles[routeName] ?? titles.overview!;
  const pageTitle = document.querySelector('#pageTitle');
  const pageSubtitle = document.querySelector('#pageSubtitle');
  if (pageTitle) pageTitle.textContent = titleEntry[0];
  if (pageSubtitle) pageSubtitle.textContent = titleEntry[1];

  document.querySelectorAll<HTMLElement>('.page').forEach((x) => {
    x.classList.toggle('on', x.id === `page-${routeName}`);
  });
}

// Register Route Handlers
router.register('overview', async () => {
  updateAdminChrome('overview');
  await renderOverview();
});

router.register('accounts', async () => {
  updateAdminChrome('accounts');
  await renderAccounts();
});

router.register('services', async () => {
  updateAdminChrome('services');
  await renderServices();
});
router.register('orders', async () => { updateAdminChrome('orders'); await renderOrders(); });
router.register('billing', async () => { updateAdminChrome('billing'); await renderBilling(); });
router.register('infrastructure', async () => { updateAdminChrome('infrastructure'); await renderInfrastructure(); });

router.register('catalog', async () => {
  updateAdminChrome('catalog');
  await renderCatalog();
});

router.register('tickets', async () => {
  updateAdminChrome('tickets');
  await renderTickets();
});

router.register('audit', async () => {
  updateAdminChrome('audit');
  await renderAudit();
});

router.register('staff', async () => {
  updateAdminChrome('staff');
  await renderStaff();
});
router.register('status', async () => { updateAdminChrome('status'); await renderStatus(); });
router.register('settings', async () => {
  updateAdminChrome('settings');
  await renderSettings();
});

function openOperation(kind: string, id: string, maxAmount = 0, currency = 'EUR'): void {
  const titles: Record<string, string> = { suspend: 'Suspend service', unsuspend: 'Unsuspend service', terminate: 'Terminate service', refund: 'Refund invoice' };
  (document.getElementById('operationKind') as HTMLInputElement).value = kind;
  (document.getElementById('operationId') as HTMLInputElement).value = id;
  (document.getElementById('operationTitle') as HTMLElement).textContent = titles[kind] || 'Confirm operation';
  (document.getElementById('operationReason') as HTMLInputElement).value = '';
  const amountField = document.getElementById('operationAmountField') as HTMLElement;
  amountField.hidden = kind !== 'refund';
  const amount = document.getElementById('operationAmount') as HTMLInputElement;
  amount.required = kind === 'refund'; amount.max = String(maxAmount); amount.value = kind === 'refund' ? String(maxAmount) : '';
  const help = document.getElementById('operationAmountHelp');
  if (help) help.textContent = `Maximum refundable: ${new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(maxAmount / 100)}`;
  const modal = document.getElementById('modalOperation'); if (modal) modal.hidden = false;
}

function openIncident(id?: string): void {
  (document.getElementById('incidentId') as HTMLInputElement).value = id || '';
  (document.getElementById('incidentModalTitle') as HTMLElement).textContent = id ? 'Publish incident update' : 'Declare incident';
  (document.getElementById('incidentTitleField') as HTMLElement).hidden = Boolean(id);
  (document.getElementById('incidentTitle') as HTMLInputElement).required = !id;
  const modal = document.getElementById('modalIncident'); if (modal) modal.hidden = false;
}

function bindAdminEvents() {
  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Theme toggle
    if (target.closest('#themeToggleBtn, [data-act="theme"]')) {
      adminShell.toggleTheme();
      return;
    }

    // Navigation links
    const link = target.closest<HTMLAnchorElement>('a[data-route]');
    if (link && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      router.navigate(link.href);
      return;
    }

    // Ticket rows
    const ticketRow = target.closest<HTMLElement>('[data-ticket-id]');
    if (ticketRow) {
      openTicketDetail(ticketRow.dataset.ticketId!);
      return;
    }

    // Account rows
    const accountRow = target.closest<HTMLElement>('[data-account-id]');
    if (accountRow) {
      openAccountDetail(accountRow.dataset.accountId!);
      return;
    }

    // Staff rows
    const staffRow = target.closest<HTMLElement>('[data-staff-user-id]');
    if (staffRow) {
      openStaffEditor(
        staffRow.dataset.staffUserId!,
        staffRow.dataset.staffName!,
        staffRow.dataset.staffRole!,
        staffRow.dataset.staffStatus!
      );
      return;
    }

    if (target.closest('[data-new-product]')) {
      openProductCreator();
      return;
    }
    const createFromEgg = target.closest<HTMLElement>('[data-create-from-egg]');
    if (createFromEgg) {
      openCreateProductFromEgg(Number(createFromEgg.dataset.createFromEgg));
      return;
    }
    const newPlan = target.closest<HTMLElement>('[data-new-plan-product]');
    if (newPlan) {
      openPlanCreator(newPlan.dataset.newPlanProduct);
      return;
    }
    const publish = target.closest<HTMLElement>('[data-product-publish]');
    if (publish) {
      setProductPublished(publish.dataset.productId!, publish.dataset.productPublish === 'true')
        .catch((error) => toast(error.message, 'bad'));
      return;
    }
    const planStatus = target.closest<HTMLElement>('[data-plan-status]');
    if (planStatus) {
      setPlanStatus(planStatus.dataset.planId!, planStatus.dataset.planStatus as 'ACTIVE' | 'RETIRED')
        .catch((error) => toast(error.message, 'bad'));
      return;
    }

    const serviceAction = target.closest<HTMLElement>('[data-service-action]');
    if (serviceAction) {
      openOperation(serviceAction.dataset.serviceAction!, serviceAction.dataset.serviceId!);
      return;
    }
    const serviceRow = target.closest<HTMLElement>('[data-service-id]');
    if (serviceRow) {
      openServiceDetail(serviceRow.dataset.serviceId!);
      return;
    }
    const refund = target.closest<HTMLElement>('[data-refund-invoice]');
    if (refund) {
      openOperation('refund', refund.dataset.refundInvoice!, Number(refund.dataset.refundMax || 0), refund.dataset.refundCurrency || 'EUR');
      return;
    }
    if (target.closest('[data-add-staff]')) { const m = document.getElementById('modalAddStaff'); if (m) m.hidden = false; return; }
    if (target.closest('[data-new-incident]')) { openIncident(); return; }
    const incident = target.closest<HTMLElement>('[data-incident-id]');
    if (incident) { openIncident(incident.dataset.incidentId); return; }
    const component = target.closest<HTMLElement>('[data-component-id]');
    if (component) {
      (document.getElementById('componentId') as HTMLInputElement).value = component.dataset.componentId!;
      (document.getElementById('componentStatus') as HTMLSelectElement).value = component.dataset.componentStatus!;
      const m = document.getElementById('modalComponent'); if (m) m.hidden = false; return;
    }

    // Modal close buttons
    if (target.closest('[data-close-ticket-modal]')) {
      const m = document.getElementById('modalTicketDetail');
      if (m) m.hidden = true;
    }
    if (target.closest('[data-close-account-modal]')) {
      const m = document.getElementById('modalAccountDetail');
      if (m) m.hidden = true;
    }
    if (target.closest('[data-close-staff-modal]')) {
      const m = document.getElementById('modalStaffEditor');
      if (m) m.hidden = true;
    }
    if (target.closest('[data-close-stepup-modal]')) {
      const m = document.getElementById('modalStepUp');
      if (m) m.hidden = true;
    }
    if (target.closest('[data-close-catalog-product]')) {
      const m = document.getElementById('modalCatalogProduct');
      if (m) m.hidden = true;
    }
    if (target.closest('[data-close-catalog-plan]')) {
      const m = document.getElementById('modalCatalogPlan');
      if (m) m.hidden = true;
    }
    if (target.closest('[data-close-service-modal]')) {
      const m = document.getElementById('modalAdminServiceDetail');
      if (m) m.hidden = true;
    }
    if (target.closest('[data-close-egg-modal]')) {
      const m = document.getElementById('modalCreateProductFromEgg');
      if (m) m.hidden = true;
    }
    if (target.closest('#testProviderBtn')) {
      testProviderConnection().catch((err) => toast(err.message, 'bad'));
      return;
    }
    if (target.closest('#refreshSettingsBtn')) {
      renderSettings().then(() => toast('Settings reloaded', 'good')).catch((err) => toast(err.message, 'bad'));
      return;
    }
    for (const [selector, id] of [['[data-close-operation]','modalOperation'],['[data-close-add-staff]','modalAddStaff'],['[data-close-incident]','modalIncident'],['[data-close-component]','modalComponent']] as const) {
      if (target.closest(selector)) { const m = document.getElementById(id); if (m) m.hidden = true; }
    }

    // Command palette trigger
    if (target.closest('[data-cmd]')) {
      adminShell.cmd.open();
      return;
    }

    const filterButton = target.closest<HTMLButtonElement>('[data-filter-value]');
    if (filterButton) {
      const group = filterButton.closest<HTMLElement>('[data-filter-target]');
      if (!group) return;
      group.querySelectorAll<HTMLButtonElement>('[data-filter-value]').forEach((button) => button.setAttribute('aria-selected', String(button === filterButton)));
      const value = filterButton.dataset.filterValue || 'ALL';
      const list = document.getElementById(group.dataset.filterTarget || '');
      list?.querySelectorAll<HTMLElement>('[data-filter-state]').forEach((item) => { item.hidden = value !== 'ALL' && item.dataset.filterState !== value; });
      return;
    }
  });

  // Search input debouncers
  document.querySelectorAll<HTMLInputElement>('[data-search]').forEach((input) => {
    let timer: number;
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      const searchTarget = input.dataset.search;
      timer = window.setTimeout(() => {
        if (searchTarget === 'accounts') renderAccounts(input.value);
        if (searchTarget === 'services') renderServices(input.value);
        if (searchTarget === 'orders') renderOrders(input.value);
        if (searchTarget === 'billing') renderBilling(input.value);
        if (searchTarget === 'tickets') renderTickets(input.value);
        if (searchTarget === 'audit') renderAudit(input.value);
        if (searchTarget === 'staff') renderStaff(input.value);
        if (searchTarget === 'catalog') filterCatalog(input.value);
      }, 220);
    });
  });

  // Ticket attachment file selection
  document.getElementById('adminTicketFileInput')?.addEventListener('change', (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    const lbl = document.getElementById('adminTicketFileLabel');
    if (lbl) lbl.textContent = file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : '';
  });

  // Admin Ticket Reply Form Submission
  document.getElementById('adminTicketReplyForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const activeTicketId = getActiveTicketId();
    if (!activeTicketId) return;

    const body = (document.getElementById('adminReplyBody') as HTMLTextAreaElement).value.trim();
    const isInternalNote = (document.getElementById('adminTicketInternalNote') as HTMLInputElement).checked;
    const newStatus = (document.getElementById('adminTicketStatusSelect') as HTMLSelectElement).value;
    const fileInput = document.getElementById('adminTicketFileInput') as HTMLInputElement | null;
    const btn = document.getElementById('adminSendReplyBtn') as HTMLButtonElement;

    btn.disabled = true;
    try {
      await api(`/api/v1/admin/tickets/${encodeURIComponent(activeTicketId)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, isInternalNote }),
      });

      if (fileInput && fileInput.files?.[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        await new Promise<void>((resolve, reject) => {
          reader.onload = async () => {
            try {
              const base64 = String(reader.result || '').split(',')[1];
              await api(`/api/v1/admin/tickets/${encodeURIComponent(activeTicketId)}/attachments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  filename: file.name,
                  contentType: file.type || 'application/octet-stream',
                  dataBase64: base64,
                }),
              });
              resolve();
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        fileInput.value = '';
        const lbl = document.getElementById('adminTicketFileLabel');
        if (lbl) lbl.textContent = '';
      }

      await api(`/api/v1/admin/tickets/${encodeURIComponent(activeTicketId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      (document.getElementById('adminReplyBody') as HTMLTextAreaElement).value = '';
      await openTicketDetail(activeTicketId);
      renderTickets();
    } catch (err: any) {
      toast(`Error submitting reply: ${err.message}`, 'bad');
    } finally {
      btn.disabled = false;
    }
  });

  // Admin Account Status / Lock Form Submission
  document.getElementById('adminAccountStatusForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const activeAccountId = getActiveAccountId();
    if (!activeAccountId) return;

    const status = (document.getElementById('adminAccountStatusSelect') as HTMLSelectElement).value;
    const reason = (document.getElementById('adminAccountReason') as HTMLInputElement).value.trim();
    const btn = document.getElementById('adminUpdateAccountBtn') as HTMLButtonElement;

    btn.disabled = true;
    try {
      await api(`/api/v1/admin/accounts/${encodeURIComponent(activeAccountId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason }),
      });
      toast('Account status updated successfully.', 'good');
      const m = document.getElementById('modalAccountDetail');
      if (m) m.hidden = true;
      renderAccounts();
    } catch (err: any) {
      toast(`Error updating account status: ${err.message}`, 'bad');
    } finally {
      btn.disabled = false;
    }
  });

  // Admin Staff Role Form Submission
  document.getElementById('adminStaffForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const userId = (document.getElementById('adminStaffUserId') as HTMLInputElement).value;
    const role = (document.getElementById('adminStaffRoleSelect') as HTMLSelectElement).value;
    const status = (document.getElementById('adminStaffStatusSelect') as HTMLSelectElement).value;
    const reason = (document.getElementById('adminStaffReason') as HTMLInputElement).value.trim();
    const btn = document.getElementById('adminSaveStaffBtn') as HTMLButtonElement;

    btn.disabled = true;
    try {
      await api(`/api/v1/admin/staff/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, status, reason }),
      });
      toast('Staff permissions updated.', 'good');
      const m = document.getElementById('modalStaffEditor');
      if (m) m.hidden = true;
      renderStaff();
    } catch (err: any) {
      toast(`Error modifying staff: ${err.message}`, 'bad');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('catalogProductForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await submitProduct(form);
    } catch (error: any) {
      toast(`Unable to create product: ${error.message}`, 'bad');
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById('catalogPlanForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await submitPlan(form);
    } catch (error: any) {
      toast(`Unable to create plan: ${error.message}`, 'bad');
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById('createProductFromEggForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await submitProductFromEgg(form);
      toast('Product and plan configured successfully from egg', 'good');
    } catch (error: any) {
      toast(`Error creating product from egg: ${error.message}`, 'bad');
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById('operationForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const kind = (document.getElementById('operationKind') as HTMLInputElement).value;
    const id = (document.getElementById('operationId') as HTMLInputElement).value;
    const reason = (document.getElementById('operationReason') as HTMLInputElement).value.trim();
    const amountMinorUnits = Number((document.getElementById('operationAmount') as HTMLInputElement).value || 0);
    const endpoint = kind === 'refund' ? `/api/v1/admin/invoices/${encodeURIComponent(id)}/refund` : `/api/v1/admin/services/${encodeURIComponent(id)}/${kind}`;
    try {
      await api(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'refund' ? { amountMinorUnits, reason } : { reason }) });
      const modal = document.getElementById('modalOperation'); if (modal) modal.hidden = true;
      toast(`${kind === 'refund' ? 'Refund' : 'Service operation'} accepted and audited.`, 'good');
      if (kind === 'refund') await renderBilling(); else await renderServices();
    } catch (error: any) { toast(error.message, 'bad'); }
  });

  document.getElementById('addStaffForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const values = new FormData(form);
    try {
      await api('/api/v1/admin/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: values.get('email'), role: values.get('role'), status: 'ACTIVE', reason: values.get('reason') }) });
      const modal = document.getElementById('modalAddStaff'); if (modal) modal.hidden = true; form.reset(); toast('Staff access granted.', 'good'); await renderStaff();
    } catch (error: any) { toast(error.message, 'bad'); }
  });

  document.getElementById('incidentForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault(); const id = (document.getElementById('incidentId') as HTMLInputElement).value;
    const payload: any = { impact: (document.getElementById('incidentImpact') as HTMLSelectElement).value, status: (document.getElementById('incidentStatus') as HTMLSelectElement).value, message: (document.getElementById('incidentMessage') as HTMLTextAreaElement).value.trim() };
    if (!id) payload.title = (document.getElementById('incidentTitle') as HTMLInputElement).value.trim();
    try {
      await api(id ? `/api/v1/admin/incidents/${encodeURIComponent(id)}/updates` : '/api/v1/admin/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const modal = document.getElementById('modalIncident'); if (modal) modal.hidden = true; toast('Status incident published.', 'good'); await renderStatus();
    } catch (error: any) { toast(error.message, 'bad'); }
  });

  document.getElementById('componentForm')?.addEventListener('submit', async (e: Event) => {
    e.preventDefault(); const id = (document.getElementById('componentId') as HTMLInputElement).value; const status = (document.getElementById('componentStatus') as HTMLSelectElement).value;
    try {
      await api(`/api/v1/admin/components/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const modal = document.getElementById('modalComponent'); if (modal) modal.hidden = true; toast('Component status updated.', 'good'); await renderStatus();
    } catch (error: any) { toast(error.message, 'bad'); }
  });
}

async function init() {
  adminShell.init();
  bindAdminEvents();
  await adminShell.loadIdentity();
  router.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
