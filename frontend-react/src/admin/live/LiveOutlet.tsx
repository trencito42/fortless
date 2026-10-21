import { LiveResource, LiveUnsupported, type LiveResourceConfig as Config } from './LiveResource';
import { LiveServiceActions } from './LiveServiceActions';
import { LiveCustomerActions } from './LiveCustomerActions';
import { LiveTicketActions } from './LiveTicketActions';
import { LiveStaffActions } from './LiveStaffActions';
import { LiveContentActions } from './LiveContentActions';
import { LiveInvoiceActions } from './LiveInvoiceActions';
import { LiveJobAction, LiveNodeAction, LiveReconcileAction } from './LiveOperationalActions';
import { LiveComponentAction, LiveIncidentCreate } from './LiveMonitoringActions';

const lists: Record<string, Config> = {
  '/actions': { title: 'Action Center', description: 'Real operational attention queues from the admin overview.', endpoint: '/overview', detail: true },
  '/customers': { title: 'Customers', description: 'Authoritative customer accounts.', endpoint: '/accounts?limit=50', collection: 'accounts', detailPath: (row) => `/customers/${row['id']}` },
  '/services': { title: 'Services', description: 'Contract lifecycle and observed runtime remain separate.', endpoint: '/services?limit=50', collection: 'services', detailPath: (row) => `/services/${row['id']}` },
  '/orders': { title: 'Orders', description: 'Authoritative commerce orders.', endpoint: '/orders?limit=50', collection: 'orders', detailPath: (row) => `/orders/${row['id']}` },
  '/billing/invoices': { title: 'Invoices', description: 'Authoritative invoices in minor currency units.', endpoint: '/invoices?limit=50', collection: 'invoices', detailPath: (row) => `/billing/invoices/${row['id']}` },
  '/billing/transactions': { title: 'Payment transactions', description: 'Authoritative payment attempts and provider identifiers.', endpoint: '/transactions?limit=50', collection: 'transactions' },
  '/billing/subscriptions': { title: 'Subscriptions', description: 'Persisted renewal, dunning and auto-renew state.', endpoint: '/subscriptions?limit=50', collection: 'subscriptions', detailPath: (row) => `/services/${row['service_id']}` },
  '/billing/refunds': { title: 'Refunds', description: 'Authoritative payment-provider refund records.', endpoint: '/refunds?limit=50', collection: 'refunds' },
  '/billing': { title: 'Billing overview', description: 'Invoices, collections and outstanding balances remain separated by currency.', endpoint: '/invoices?limit=50', detail: true },
  '/billing/reports': { title: 'Billing reports', description: 'Authoritative invoice summaries grouped by currency.', endpoint: '/invoices?limit=50', detail: true },
  '/infrastructure': { title: 'Infrastructure capacity', description: 'Physical and allocated provider capacity.', endpoint: '/capacity', detail: true, actions: (_payload, reload) => <LiveReconcileAction reload={reload} /> },
  '/infrastructure/nodes': { title: 'Nodes', description: 'Authoritative capacity pools.', endpoint: '/capacity', collection: 'nodes', rowActions: (row, reload) => <LiveNodeAction row={row} reload={reload} /> },
  '/infrastructure/capacity': { title: 'Capacity', description: 'Physical and allocated capacity; observed usage is not inferred.', endpoint: '/capacity', detail: true },
  '/infrastructure/allocations': { title: 'Allocations', description: 'Persisted node allocation totals.', endpoint: '/capacity', collection: 'nodes' },
  '/infrastructure/maintenance': { title: 'Node maintenance', description: 'Persisted maintenance state for every node.', endpoint: '/capacity', collection: 'nodes', rowActions: (row, reload) => <LiveNodeAction row={row} reload={reload} /> },
  '/infrastructure/providers': { title: 'Provider configuration', description: 'Effective provider state without credentials.', endpoint: '/settings', detail: true },
  '/provisioning': { title: 'Provisioning jobs', description: 'Durable jobs and unknown provider outcomes.', endpoint: '/jobs?limit=50', collection: 'jobs', rowActions: (row, reload) => <LiveJobAction row={row} reload={reload} /> },
  '/provisioning/jobs': { title: 'Provisioning jobs', description: 'Durable jobs and unknown provider outcomes.', endpoint: '/jobs?limit=50', collection: 'jobs', detailPath: (row) => `/provisioning/jobs/${row['id']}`, rowActions: (row, reload) => <LiveJobAction row={row} reload={reload} /> },
  '/provisioning/webhooks': { title: 'Payment webhooks', description: 'Durable payment inbox jobs.', endpoint: '/jobs?limit=50&type=WEBHOOK', collection: 'jobs', rowActions: (row, reload) => <LiveJobAction row={row} reload={reload} /> },
  '/provisioning/timeline': { title: 'Provisioning timeline', description: 'Durable provisioning operations ordered by the backend.', endpoint: '/jobs?limit=50&type=PROVISIONING', collection: 'jobs' },
  '/monitoring': { title: 'System status', description: 'Persisted public components and incidents.', endpoint: '/status', detail: true },
  '/monitoring/components': { title: 'Status components', description: 'Persisted service status components.', endpoint: '/status', collection: 'components', rowActions: (row, reload) => <LiveComponentAction row={row} reload={reload} /> },
  '/monitoring/incidents': { title: 'Incidents', description: 'Persisted public incident history.', endpoint: '/status', collection: 'incidents', actions: (_payload, reload) => <LiveIncidentCreate reload={reload} /> },
  '/monitoring/incidents/new': { title: 'Declare incident', description: 'Create a persisted public incident through the protected Fastify workflow.', endpoint: '/status', detail: true, actions: (_payload, reload) => <LiveIncidentCreate reload={reload} /> },
  '/monitoring/public': { title: 'Public status data', description: 'The exact status model exposed to customers.', endpoint: '/status', detail: true },
  '/support': { title: 'Support inbox', description: 'Authoritative support queue.', endpoint: '/tickets?limit=50', collection: 'tickets', detailPath: (row) => `/support/tickets/${row['id']}` },
  '/support/departments': { title: 'Support departments', description: 'Persisted routing departments.', endpoint: '/support/meta', collection: 'departments' },
  '/support/macros': { title: 'Support macros', description: 'Persisted staff reply macros.', endpoint: '/support/meta', collection: 'macros' },
  '/support/performance': { title: 'Support performance', description: 'Authoritative ticket queue data; no synthetic SLA metrics.', endpoint: '/tickets?limit=50', detail: true },
  '/staff': { title: 'Staff directory', description: 'Persisted staff memberships and MFA state.', endpoint: '/staff?limit=50', collection: 'staff', actions: (payload, reload) => <LiveStaffActions payload={payload} reload={reload} />, detailPath: (row) => `/staff/directory/${row['id']}` },
  '/audit': { title: 'Audit explorer', description: 'Server-written audit events.', endpoint: '/audit?limit=50', collection: 'logs', detailPath: (row) => `/audit/events/${row['id']}` },
  '/products': { title: 'Products', description: 'Versioned product catalog.', endpoint: '/catalog/products', collection: 'products', detailPath: (row) => `/products/${row['id']}` },
  '/products/plans': { title: 'Plans', description: 'Versioned plans nested under the authoritative catalog.', endpoint: '/catalog/products', detail: true },
  '/products/pricing': { title: 'Catalog pricing', description: 'Prices belong to immutable plan versions.', endpoint: '/catalog/products', detail: true },
  '/products/coupons': { title: 'Coupons', description: 'Persisted coupons and redemption limits.', endpoint: '/catalog/coupons', collection: 'coupons' },
  '/products/inventory': { title: 'Provider inventory', description: 'Read-only provider inventory.', endpoint: '/providers/pterodactyl/inventory', detail: true },
  '/content': { title: 'Managed content', description: 'Knowledge base and announcements.', endpoint: '/content', detail: true, actions: (payload, reload) => <LiveContentActions payload={payload} reload={reload} /> },
  '/content/knowledge': { title: 'Knowledge base', description: 'Persisted categories and Markdown articles.', endpoint: '/content', detail: true, actions: (payload, reload) => <LiveContentActions payload={payload} reload={reload} /> },
  '/content/announcements': { title: 'Announcements', description: 'Persisted announcements and publication state.', endpoint: '/content', detail: true, actions: (payload, reload) => <LiveContentActions payload={payload} reload={reload} /> },
  '/marketing': { title: 'Marketing capabilities', description: 'Only persisted catalog promotions are shown.', endpoint: '/catalog/coupons', detail: true },
  '/marketing/promotions': { title: 'Promotions', description: 'Persisted coupon rules and redemption limits.', endpoint: '/catalog/coupons', collection: 'coupons' },
  '/settings': { title: 'Platform settings', description: 'Safe, non-secret operational configuration.', endpoint: '/settings', detail: true },
  '/settings/auth': { title: 'Authentication settings', description: 'Effective session, MFA and step-up policy.', endpoint: '/settings', detail: true },
  '/settings/payments': { title: 'Payment integration', description: 'Effective provider availability without secrets.', endpoint: '/settings', detail: true },
  '/settings/email': { title: 'Email operations', description: 'Templates and failed delivery queue.', endpoint: '/settings/email-templates', detail: true },
  '/settings/integrations': { title: 'Integrations', description: 'Effective provider configuration without credentials.', endpoint: '/settings', detail: true },
  '/settings/system': { title: 'System information', description: 'Effective platform counts and runtime configuration.', endpoint: '/settings', detail: true },
  '/settings/flags': { title: 'Feature availability', description: 'Effective backend capabilities; no browser-only toggles.', endpoint: '/settings', detail: true },
  '/settings/notifications': { title: 'Notification configuration', description: 'Effective platform configuration; unsupported controls remain read-only.', endpoint: '/settings', detail: true },
  '/settings/localization': { title: 'Localization', description: 'Effective currency and platform configuration.', endpoint: '/settings', detail: true },
  '/staff/roles': { title: 'Staff roles', description: 'Persisted staff assignments and authoritative permission bundles.', endpoint: '/staff?limit=50', detail: true },
  '/audit/policy': { title: 'Security policy', description: 'Effective authentication controls and platform security posture.', endpoint: '/settings', detail: true },
};

const details: Array<{ pattern: RegExp; make: (match: RegExpMatchArray) => Config }> = [
  { pattern: /^\/customers\/([^/]+)(?:\/.*)?$/, make: (m) => ({ title: 'Customer 360', description: 'Authoritative account detail and related records.', endpoint: `/accounts/${encodeURIComponent(m[1]!)}`, detail: true, actions: (payload, reload) => <LiveCustomerActions payload={payload} reload={reload} /> }) },
  { pattern: /^\/services\/([^/]+)(?:\/.*)?$/, make: (m) => ({ title: 'Service detail', description: 'Authoritative service, provider and runtime state.', endpoint: `/services/${encodeURIComponent(m[1]!)}`, detail: true, actions: (payload, reload) => <LiveServiceActions payload={payload} reload={reload} /> }) },
  { pattern: /^\/orders\/([^/]+)$/, make: (m) => ({ title: 'Order detail', description: 'Payment, fulfillment and provisioning evidence.', endpoint: `/orders/${encodeURIComponent(m[1]!)}`, detail: true }) },
  { pattern: /^\/billing\/invoices\/([^/]+)$/, make: (m) => ({ title: 'Invoice detail', description: 'Authoritative invoice lines, payments and refundable balance.', endpoint: `/invoices/${encodeURIComponent(m[1]!)}`, detail: true, actions: (payload, reload) => <LiveInvoiceActions payload={payload} reload={reload} /> }) },
  { pattern: /^\/billing\/transactions\/([^/]+)$/, make: (m) => ({ title: 'Payment transaction', description: 'Authoritative payment-attempt evidence.', endpoint: `/transactions?limit=50&q=${encodeURIComponent(m[1]!)}`, detail: true }) },
  { pattern: /^\/billing\/refunds\/([^/]+)$/, make: (m) => ({ title: 'Refund detail', description: 'Authoritative payment-provider refund record.', endpoint: `/refunds?limit=50&q=${encodeURIComponent(m[1]!)}`, detail: true }) },
  { pattern: /^\/support\/tickets\/([^/]+)$/, make: (m) => ({ title: 'Ticket conversation', description: 'Full persisted support history.', endpoint: `/tickets/${encodeURIComponent(m[1]!)}`, detail: true, actions: (payload, reload) => <LiveTicketActions payload={payload} reload={reload} /> }) },
  { pattern: /^\/infrastructure\/nodes\/([^/]+)(?:\/.*)?$/, make: () => ({ title: 'Node detail', description: 'Authoritative node and allocation data.', endpoint: '/capacity', detail: true }) },
  { pattern: /^\/provisioning\/jobs\/([^/]+)$/, make: () => ({ title: 'Job detail', description: 'Durable job state and error evidence.', endpoint: '/jobs?limit=50', detail: true }) },
  { pattern: /^\/products\/([^/]+)$/, make: () => ({ title: 'Product detail', description: 'Versioned product and plan configuration.', endpoint: '/catalog/products', detail: true }) },
  { pattern: /^\/staff\/directory\/([^/]+)$/, make: (m) => ({ title: 'Staff detail', description: 'Persisted staff membership and MFA state.', endpoint: '/staff?limit=50', detail: true, actions: (payload, reload) => <LiveStaffActions payload={payload} reload={reload} targetId={m[1]} /> }) },
  { pattern: /^\/audit\/(?:events\/[^/]+|security|access)$/, make: () => ({ title: 'Audit evidence', description: 'Server-written audit records.', endpoint: '/audit?limit=50', detail: true }) },
  { pattern: /^\/monitoring\/incidents\/([^/]+)(?:\/edit)?$/, make: () => ({ title: 'Incident detail', description: 'Persisted incident and component history.', endpoint: '/status', detail: true }) },
  { pattern: /^\/actions\/([^/]+)$/, make: () => ({ title: 'Operational issue detail', description: 'Real operational attention queues.', endpoint: '/overview', detail: true }) },
  { pattern: /^\/content\/knowledge\/([^/]+)$/, make: (m) => ({ title: 'Knowledge article', description: 'Persisted Markdown content and publication state.', endpoint: '/content', detail: true, actions: (payload, reload) => <LiveContentActions payload={payload} reload={reload} articleId={m[1]} /> }) },
  { pattern: /^\/settings\/integrations\/([^/]+)$/, make: () => ({ title: 'Integration detail', description: 'Effective configuration without credentials.', endpoint: '/settings', detail: true }) },
];

export function LiveOutlet({ path }: { path: string }) {
  const exact = lists[path]; if (exact) return <LiveResource config={exact} />;
  for (const route of details) { const match = path.match(route.pattern); if (match) return <LiveResource config={route.make(match)} />; }
  return <LiveUnsupported title="Integration unavailable" path={path} />;
}
