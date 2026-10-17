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
import { renderServices } from './pages/services/index.js';
import { renderTickets, openTicketDetail, getActiveTicketId } from './pages/tickets/index.js';
import { renderAudit } from './pages/audit/index.js';
import { renderStaff, openStaffEditor } from './pages/staff/index.js';

const adminShell = new AdminShell();
const router = new Router(ADMIN_ROUTES);

function updateAdminChrome(routeName: string) {
  const titles: Record<string, [string, string]> = {
    overview: ['Operations overview', 'Real platform records, without simulated operational controls.'],
    accounts: ['Customer accounts', 'Ownership, membership and workload counts. Click an account to inspect or lock.'],
    services: ['Service inventory', 'Contract and provider-observed state.'],
    tickets: ['Support queue', 'Real customer threads. Click a ticket to view and reply.'],
    audit: ['Global audit trail', 'Security-relevant events across accounts.'],
    staff: ['Staff access', 'Persisted roles, access status and MFA readiness. Click to edit role.'],
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

function bindAdminEvents() {
  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;

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

    // Command palette trigger
    if (target.closest('[data-cmd]')) {
      adminShell.cmd.open();
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
        if (searchTarget === 'tickets') renderTickets(input.value);
        if (searchTarget === 'audit') renderAudit(input.value);
        if (searchTarget === 'staff') renderStaff(input.value);
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
      alert(`Error submitting reply: ${err.message}`);
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
      alert('Account status updated successfully.');
      const m = document.getElementById('modalAccountDetail');
      if (m) m.hidden = true;
      renderAccounts();
    } catch (err: any) {
      alert(`Error updating account status: ${err.message}`);
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
      alert('Staff permissions updated.');
      const m = document.getElementById('modalStaffEditor');
      if (m) m.hidden = true;
      renderStaff();
    } catch (err: any) {
      alert(`Error modifying staff: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
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
