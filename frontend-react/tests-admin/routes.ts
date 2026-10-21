import { buildAdminData } from '../src/admin/fixtures';

/** One representative URL per route pattern. Ids are read from the same deterministic fixtures the app uses, so tests cannot drift from the data. */
const D = buildAdminData();
export const IDS = {
  failedOrder: D.orders.find((o) => o.status === 'FULFILLMENT_FAILED')!.id,
  unknownJob: D.jobs.find((j) => j.unknownOutcome)!.id,
  unreconciledPayment: D.payments.find((p) => !p.reconciled)!.id,
  pendingRefund: D.refunds.find((r) => r.status === 'pending_approval')!.id,
  urgentTicket: D.tickets.find((t) => t.priority === 'urgent' && !t.assigneeId)!.id,
  action: D.actions[0]!.id,
  audit: D.audit[0]!.id,
  largeInvoice: D.invoices.find((i) => i.status === 'PAID' && i.total.amount >= 12_000 && i.amountRefunded.amount === 0 && i.refundIds.length === 0)!.id,
  invoice: D.invoices.find((i) => i.customerId === 'acc_0001' && i.status === 'PAID')!.id,
};
export const ROUTES = [
  '/', '/actions', `/actions/${IDS.action}`,
  '/customers', '/customers/acc_0003', '/customers/acc_0001/services', '/customers/acc_0001/orders', '/customers/acc_0004/billing', '/customers/acc_0001/subscriptions', '/customers/acc_0001/support', '/customers/acc_0001/members', '/customers/acc_0001/security', '/customers/acc_0001/activity', '/customers/acc_0001/notes',
  '/services', '/services/svc_0001', '/services/svc_0001/operations', '/services/svc_0001/resources', '/services/svc_0001/provider', '/services/svc_0001/networking', '/services/svc_0001/billing', '/services/svc_0001/provisioning', '/services/svc_0001/diagnostics', '/services/svc_0001/activity', '/services/svc_0001/access', '/services/svc_0001/migrate',
  '/orders', `/orders/${IDS.failedOrder}`,
  '/billing', '/billing/invoices', `/billing/invoices/${IDS.invoice}`, '/billing/transactions', `/billing/transactions/${IDS.unreconciledPayment}`, '/billing/subscriptions', '/billing/refunds', `/billing/refunds/${IDS.pendingRefund}`, '/billing/reports',
  '/products', '/products/prd_minecraft', '/products/new', '/products/plans', '/products/plans/pln_mc_iron', '/products/plans/new', '/products/pricing', '/products/coupons', '/products/inventory',
  '/infrastructure', '/infrastructure/nodes', '/infrastructure/nodes/node-fra-02', '/infrastructure/nodes/node-fra-02/hardware', '/infrastructure/nodes/node-fra-02/allocations', '/infrastructure/nodes/node-fra-02/services', '/infrastructure/nodes/node-fra-02/networking', '/infrastructure/nodes/node-fra-02/capacity', '/infrastructure/nodes/node-fra-02/maintenance', '/infrastructure/nodes/node-fra-02/activity', '/infrastructure/capacity', '/infrastructure/allocations', '/infrastructure/maintenance', '/infrastructure/providers',
  '/provisioning/jobs', `/provisioning/jobs/${IDS.unknownJob}`, `/provisioning/timeline?order=${IDS.failedOrder}`, '/provisioning/workers', '/provisioning/webhooks',
  '/monitoring', '/monitoring/components', '/monitoring/incidents', '/monitoring/incidents/inc_0006', '/monitoring/incidents/new', '/monitoring/incidents/inc_0006/edit', '/monitoring/maintenance', '/monitoring/maintenance/mnt_0003', '/monitoring/maintenance/new', '/monitoring/public',
  '/support', `/support/tickets/${IDS.urgentTicket}`, '/support/departments', '/support/macros', '/support/performance',
  '/content', '/content/knowledge', '/content/knowledge/kba_001', '/content/knowledge/new', '/content/announcements', '/content/pages', '/content/legal', '/content/legal/leg_privacy_en',
  '/marketing', '/marketing/campaigns', '/marketing/promotions', '/marketing/referrals', '/marketing/analytics',
  '/staff', '/staff/directory/stf_09', '/staff/roles', '/staff/approvals', '/staff/sessions',
  '/audit', `/audit/events/${IDS.audit}`, '/audit/security', '/audit/access', '/audit/policy',
  '/settings', '/settings/auth', '/settings/payments', '/settings/email', '/settings/integrations', '/settings/integrations/conn_ptero', '/settings/flags', '/settings/notifications', '/settings/localization', '/settings/system',
] as string[];
