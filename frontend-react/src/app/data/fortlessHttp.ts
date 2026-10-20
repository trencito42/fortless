import type * as D from '../domain/types';
import { ApiError, type CustomerApi } from './api';
import type { ObservableCustomerApi } from './DataProvider';

type Json = Record<string, unknown>;
type WireService = Json & {
  id: string; contract_status?: string; runtime_state?: string; provider_type?: string; identifier?: string;
  node_id?: string; node_name?: string; plan_name?: string; cpu_limit_pct?: number; memory_limit_mb?: number;
  disk_limit_mb?: number; created_at?: string; custom_options?: string; suspension_reason?: string;
};

const currency = (value: unknown): D.Currency => value === 'USD' || value === 'RON' ? value : 'EUR';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
const iso = (value: unknown) => typeof value === 'string' && value ? value : new Date(0).toISOString();
const text = (value: unknown, fallback = '') => typeof value === 'string' && value ? value : fallback;

function record(value: unknown, label: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(`${label} returned an invalid object.`, 'INVALID_RESPONSE', 502);
  return value as Json;
}

function array(value: unknown, label: string): Json[] {
  if (!Array.isArray(value)) throw new ApiError(`${label} returned an invalid list.`, 'INVALID_RESPONSE', 502);
  return value.map((item, index) => record(item, `${label}[${index}]`));
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(`${label} is missing from the server response.`, 'INVALID_RESPONSE', 502);
  return value;
}

function number(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) throw new ApiError(`${label} is invalid in the server response.`, 'INVALID_RESPONSE', 502);
  return parsed;
}

function workloadFor(service: WireService): D.Workload {
  const value = `${service.plan_name ?? ''} ${service.identifier ?? ''}`.toLowerCase();
  if (value.includes('minecraft')) return 'minecraft';
  if (value.includes('cs 1.6') || value.includes('cs16') || value.includes('rehlds')) return 'cs16';
  if (value.includes('counter-strike 2') || value.includes('cs2')) return 'cs2';
  if (value.includes('discord')) return 'discord-bot';
  if (value.includes('python')) return 'python';
  if (value.includes('database')) return 'database';
  return 'nodejs';
}

function serviceState(service: WireService): D.ServiceState {
  const contract = text(service.contract_status, 'ACTIVE').toUpperCase();
  if (contract === 'SUSPENDED' || contract === 'PAST_DUE') return 'suspended';
  if (contract !== 'ACTIVE') return 'error';
  const runtime = text(service.runtime_state, 'UNKNOWN').toUpperCase();
  if (runtime === 'RUNNING') return 'running';
  if (runtime === 'INSTALLING') return 'installing';
  if (runtime === 'ERROR') return 'error';
  return 'offline';
}

function serviceName(service: WireService): string {
  try {
    const options = JSON.parse(text(service.custom_options, '{}')) as Json;
    return text(options['serverName'], text(service.plan_name, text(service.identifier, 'Hosting service')));
  } catch { return text(service.plan_name, text(service.identifier, 'Hosting service')); }
}

function roleLabel(role: unknown): string {
  return text(role, 'VIEWER').toLowerCase().split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

export function createFortlessHttpApi(baseUrl = ''): ObservableCustomerApi {
  let csrf: string | null = null;
  let version = 0;
  const listeners = new Set<() => void>();
  const bump = () => { version += 1; for (const listener of listeners) listener(); };

  const request = async <T>(path: string, init: RequestInit = {}, retryCsrf = true): Promise<T> => {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!csrf) {
        const tokenResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`, { credentials: 'same-origin' });
        if (!tokenResponse.ok) throw new ApiError('Could not initialize the secure session.', 'CSRF_INIT_FAILED', tokenResponse.status);
        csrf = ((await tokenResponse.json()) as { csrfToken: string }).csrfToken;
      }
      headers.set('X-CSRF-Token', csrf);
    }
    const response = await fetch(`${baseUrl}${path}`, { ...init, method, headers, credentials: 'same-origin', cache: 'no-store' });
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    const raw = await response.text();
    let body: Json = {};
    if (raw && contentType.includes('application/json')) {
      try { body = record(JSON.parse(raw), path); } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(`${path} returned malformed JSON.`, 'INVALID_RESPONSE', 502);
      }
    }
    if (response.status === 401) {
      if (location.pathname.startsWith('/app')) location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      throw new ApiError('Your session has expired. Sign in again.', 'SESSION_EXPIRED', 401);
    }
    if (response.status === 403 && body['code'] === 'CSRF_INVALID' && retryCsrf && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      csrf = null;
      return request<T>(path, init, false);
    }
    if (!response.ok) throw new ApiError(text(body['message'], text(body['error'], `Request failed (${response.status}).`)), text(body['code'], 'HTTP_ERROR'), response.status);
    if (!contentType.includes('application/json')) {
      throw new ApiError(`${path} returned ${contentType || 'an unknown content type'} instead of JSON. Check the preview /api proxy.`, 'INVALID_CONTENT_TYPE', 502);
    }
    return body as T;
  };

  const unsupported = (..._args: unknown[]): Promise<never> => Promise.reject(new ApiError('This action is not available in the React preview yet.', 'NOT_WIRED', 501));

  const listServices = async (): Promise<D.ServiceRow[]> => {
    const payload = await request<Json>('/api/v1/services');
    const services = array(payload['services'], 'services') as WireService[];
    return services.map((service, index) => {
      requiredText(service.id, `services[${index}].id`);
      const state = serviceState(service);
      return {
        id: service.id,
        name: serviceName(service),
        workload: workloadFor(service),
        engine: text(service.plan_name, 'Runtime details unavailable'),
        state,
        provider: service.provider_type === 'CPANEL' ? 'CPANEL' : service.provider_type === 'VPS' ? 'PROXMOX' : 'PTERODACTYL',
        regionId: text(service.node_id, 'unknown'),
        regionName: text(service.node_name, 'Region unavailable'),
        planId: text(service['plan_version_id'], text(service.plan_name, service.id)),
        planName: text(service.plan_name, 'Hosting service'),
        address: service.identifier,
        resources: {
          cpuPct: 0,
          ramUsedMb: 0,
          ramLimitMb: Number(service.memory_limit_mb ?? 0),
          diskUsedMb: 0,
          diskLimitMb: Number(service.disk_limit_mb ?? 0),
        },
        createdAt: iso(service.created_at),
        note: state === 'suspended' ? text(service.suspension_reason, 'Service controls are unavailable.') : undefined,
      };
    });
  };

  const listInvoices = async (): Promise<D.InvoiceRecord[]> => {
    const payload = await request<Json>('/api/v1/invoices');
    const invoices = array(payload['invoices'], 'invoices');
    return invoices.map((invoice) => {
      const status = text(invoice['status']).toUpperCase();
      const state: D.InvoiceState = status === 'PAID' ? 'paid' : status === 'OVERDUE' ? 'overdue' : status === 'VOIDED' ? 'void' : status === 'CREDITED' ? 'refunded' : 'open';
      const c = currency(invoice['currency']);
      return {
        id: requiredText(invoice['id'], 'invoice.id'), number: text(invoice['invoice_number'], 'Draft'), state,
        issuedOn: iso(invoice['created_at']), dueOn: typeof invoice['due_date'] === 'string' ? invoice['due_date'] : undefined,
        paidOn: typeof invoice['paid_at'] === 'string' ? invoice['paid_at'] : undefined, lines: [],
        subtotal: { amount: number(invoice['subtotal_minor_units'], 'invoice.subtotal_minor_units'), currency: c },
        tax: { amount: number(invoice['tax_minor_units'], 'invoice.tax_minor_units'), currency: c },
        total: { amount: number(invoice['total_minor_units'], 'invoice.total_minor_units'), currency: c },
      };
    });
  };

  const listSubscriptions = async (): Promise<D.SubscriptionRecord[]> => {
    const payload = await request<Json>('/api/v1/subscriptions');
    const subscriptions = array(payload['subscriptions'], 'subscriptions');
    return subscriptions.map((sub) => {
      const status = text(sub['status']).toUpperCase();
      const state: D.SubscriptionState = status === 'PAST_DUE' ? 'past-due' : status === 'CANCEL_SCHEDULED' ? 'cancel-scheduled' : status === 'ACTIVE' ? 'active' : 'paused';
      return {
        id: requiredText(sub['id'], 'subscription.id'), serviceId: requiredText(sub['serviceId'], 'subscription.serviceId'), serviceName: text(sub['serviceName'], 'Hosting subscription'),
        planName: text(sub['serviceName'], 'Hosting subscription'), cycle: text(sub['billingInterval']).toUpperCase() === 'ANNUAL' ? 'yearly' : 'monthly',
        price: { amount: number(sub['renewalPriceMinorUnits'], 'subscription.renewalPriceMinorUnits'), currency: currency(sub['currency']) }, state,
        renewsOn: typeof sub['nextRenewalDate'] === 'string' ? sub['nextRenewalDate'] : undefined,
        endsOn: status === 'CANCEL_SCHEDULED' && typeof sub['currentPeriodEnd'] === 'string' ? sub['currentPeriodEnd'] : undefined,
        autoRenew: Boolean(sub['autoRenew']),
      };
    });
  };

  const listTickets = async (): Promise<D.TicketRecord[]> => {
    const payload = await request<Json>('/api/v1/tickets');
    const tickets = array(payload['tickets'], 'tickets');
    return tickets.map((ticket) => {
      const status = text(ticket['status']).toUpperCase();
      const state: D.TicketState = status === 'CLOSED' || status === 'RESOLVED' ? 'closed' : status === 'WAITING_CUSTOMER' ? 'awaiting-customer' : status === 'WAITING_STAFF' ? 'open' : 'open';
      const priority = text(ticket['priority'], 'NORMAL').toLowerCase() as D.TicketPriority;
      const id = requiredText(ticket['id'], 'ticket.id');
      return { id, number: id, subject: requiredText(ticket['subject'], 'ticket.subject'), department: 'Support', state, priority, createdAt: iso(ticket['created_at']), updatedAt: iso(ticket['updated_at']), messages: [] };
    });
  };

  const activity = async (): Promise<D.ActivityRecord[]> => {
    const payload = await request<Json>('/api/v1/audit?limit=50');
    const logs = array(payload['logs'], 'audit logs');
    return logs.map((log) => ({
      id: requiredText(log['id'], 'audit.id'), at: iso(log['created_at']), actor: text(log['actor_name'], log['actor_type'] === 'SYSTEM' ? 'Fortless' : 'You'),
      actorKind: log['actor_type'] === 'SYSTEM' ? 'system' : log['actor_name'] ? 'teammate' : 'you', action: text(log['action']).replace(/[._]/g, ' '),
      target: text(log['service_name'], text(log['ticket_subject'], text(log['resource_id']))) || undefined,
      ip: typeof log['ip_address'] === 'string' ? log['ip_address'] : undefined,
      outcome: text(log['action']).includes('failed') ? 'failed' : 'success',
    }));
  };

  const api: CustomerApi = {
    identity: async () => {
      const [identity, mfa] = await Promise.all([
        request<Json>('/api/v1/auth/me'),
        request<Json>('/api/v1/auth/mfa').catch((): Json => ({})),
      ]);
      const user = record(identity['user'], 'auth.user');
      const account = record(identity['account'], 'auth.account');
      const membership = record(identity['membership'], 'auth.membership');
      const name = text(user['name'], text(account['name'], 'Customer'));
      return { fullName: name, email: text(user['email']), emailVerified: Boolean(user['email_verified_at']), language: 'en', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, avatarInitials: initials(name), mfaEnabled: Boolean(mfa['enabled'] ?? mfa['totpEnabled']), recoveryCodesLeft: Number(mfa['recoveryCodesRemaining'] ?? 0), accountName: text(account['name'], 'Fortless'), role: roleLabel(membership['role']) };
    },
    listServices,
    getService: async (id) => { const services = await listServices(); const service = services.find((item) => item.id === id); if (!service) throw new ApiError('Service not found.', 'NOT_FOUND', 404); return service; },
    listInvoices,
    listSubscriptions,
    listTickets,
    activity,
    warnings: async () => {
      const [services, invoices] = await Promise.all([listServices(), listInvoices()]);
      return [
        ...services.filter((service) => service.state === 'suspended' || service.state === 'error').map<D.Warning>((service) => ({ id: `service-${service.id}`, severity: 'error', title: `${service.name} needs attention`, detail: service.note ?? 'The service is not operational.', serviceId: service.id, action: { label: 'View service', to: `/app/services/${service.id}` } })),
        ...invoices.filter((invoice) => invoice.state === 'overdue').map<D.Warning>((invoice) => ({ id: `invoice-${invoice.id}`, severity: 'warn', title: `Invoice ${invoice.number} is overdue`, detail: 'Review the authoritative invoice record before taking action.', action: { label: 'Review invoices', to: '/app/billing/invoices' } })),
      ];
    },
    serviceEvents: async () => (await activity()).filter((event) => event.target).slice(0, 12).map((event) => ({ id: event.id, at: event.at, serviceId: '', serviceName: event.target!, severity: event.outcome === 'failed' ? 'error' : 'info', text: event.action })),
    profile: async () => api.identity(),
    regions: unsupported, plans: unsupported, quote: unsupported, cart: unsupported, addToCart: unsupported, removeFromCart: unsupported,
    checkout: unsupported, listOrders: unsupported, getInvoice: unsupported, payInvoice: unsupported, cancelSubscription: unsupported,
    resumeSubscription: unsupported, changeCycle: unsupported, listPaymentMethods: unsupported, addPaymentMethod: unsupported,
    removePaymentMethod: unsupported, setDefaultPaymentMethod: unsupported, billingProfile: unsupported, saveBillingProfile: unsupported,
    listDomains: unsupported, getDomain: unsupported, searchDomains: unsupported, dnsRecords: unsupported, saveDnsRecord: unsupported,
    deleteDnsRecord: unsupported, saveNameservers: unsupported, setDomainAutoRenew: unsupported, getTicket: unsupported,
    createTicket: unsupported, replyTicket: unsupported, closeTicket: unsupported, saveProfile: unsupported, sessions: unsupported,
    revokeSession: unsupported, passkeys: unsupported, addPasskey: unsupported, removePasskey: unsupported, apiKeys: unsupported,
    createApiKey: unsupported, revokeApiKey: unsupported, team: unsupported, inviteMember: unsupported, removeMember: unsupported,
    notificationPrefs: unsupported, saveNotificationPrefs: unsupported, announcements: unsupported, markAnnouncementRead: unsupported, kb: unsupported,
    power: unsupported, usage: unsupported,
  };
  return Object.assign(api, { subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, version: () => version, bump });
}
