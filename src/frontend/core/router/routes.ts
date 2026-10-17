export interface RouteDefinition {
  id: string;
  path: string;
  title: string;
  subtitle?: string;
  pattern?: RegExp;
}

export const CLIENT_ROUTES: Record<string, RouteDefinition> = {
  servers: {
    id: 'servers',
    path: '/app',
    title: 'Services · FORTLESS',
    subtitle: 'Provider-observed runtime records for this account.',
  },
  deploy: {
    id: 'deploy',
    path: '/app/deploy',
    title: 'Deploy Service · FORTLESS',
    subtitle: 'Select configuration, location, and billing cycle.',
  },
  billing: {
    id: 'billing',
    path: '/app/billing',
    title: 'Billing & Invoices · FORTLESS',
    subtitle: 'Issued billing records and active subscriptions.',
  },
  tickets: {
    id: 'tickets',
    path: '/app/support',
    title: 'Support Conversations · FORTLESS',
    subtitle: 'Account-scoped support conversations. No response-time or staffing claim is implied.',
  },
  audit: {
    id: 'audit',
    path: '/app/activity',
    title: 'Security Audit · FORTLESS',
    subtitle: 'Immutable record of authentication and account actions.',
  },
  settings: {
    id: 'settings',
    path: '/app/settings',
    title: 'Settings · FORTLESS',
    subtitle: 'Account access, active device sessions, and authentication security.',
  },
  'service-detail': {
    id: 'service-detail',
    path: '/app/services/:id',
    title: 'Service Detail · FORTLESS',
    subtitle: 'Node and connection telemetry.',
    pattern: /^\/app\/services\/([^/]+)$/,
  },
};

export const ADMIN_ROUTES: Record<string, RouteDefinition> = {
  overview: {
    id: 'overview',
    path: '/admin',
    title: 'Operations Overview · FORTLESS',
    subtitle: 'Real platform records, without simulated operational controls.',
  },
  accounts: {
    id: 'accounts',
    path: '/admin/accounts',
    title: 'Customer Accounts · FORTLESS',
    subtitle: 'Ownership, membership and workload counts. Click an account to inspect or lock.',
  },
  services: {
    id: 'services',
    path: '/admin/services',
    title: 'Service Inventory · FORTLESS',
    subtitle: 'Contract and provider-observed state.',
  },
  tickets: {
    id: 'tickets',
    path: '/admin/tickets',
    title: 'Support Queue · FORTLESS',
    subtitle: 'Real customer threads. Click a ticket to view and reply.',
  },
  audit: {
    id: 'audit',
    path: '/admin/audit',
    title: 'Global Audit Trail · FORTLESS',
    subtitle: 'Security-relevant events across accounts.',
  },
  staff: {
    id: 'staff',
    path: '/admin/staff',
    title: 'Staff Access · FORTLESS',
    subtitle: 'Persisted roles, access status and MFA readiness. Click to edit role.',
  },
};
