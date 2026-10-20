import type * as D from '../domain/types';
import { ApiError, type CustomerApi, type DeploySpec, type DomainSearchResult, type WorkloadCatalog } from './api';
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
const bool = (value: unknown) => value === true || value === 1;
const enc = encodeURIComponent;

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
  if (contract === 'CANCELLED' || contract === 'TERMINATED') return 'offline';
  const runtime = text(service.runtime_state, 'UNKNOWN').toUpperCase();
  if (runtime === 'ERROR') return 'error';
  if (runtime === 'RUNNING') return 'running';
  if (runtime === 'INSTALLING') return 'installing';
  if (contract !== 'ACTIVE') return 'offline';
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

function workloadFromCatalog(value: unknown): D.Workload[] {
  const slug = text(value).toLowerCase();
  if (slug.includes('minecraft')) return ['minecraft'];
  if (slug.includes('cs-1') || slug.includes('cs16') || slug.includes('counter-strike-1')) return ['cs16'];
  if (slug.includes('cs2') || slug.includes('counter-strike-2')) return ['cs2'];
  if (slug.includes('discord') || slug.includes('bot')) return ['discord-bot'];
  if (slug.includes('python')) return ['python'];
  if (slug.includes('database')) return ['database'];
  return ['nodejs'];
}

function ticketState(value: unknown): D.TicketState {
  const status = text(value).toUpperCase();
  if (status === 'CLOSED' || status === 'RESOLVED') return 'closed';
  if (status === 'WAITING_CUSTOMER' || status === 'ANSWERED') return 'awaiting-customer';
  return 'open';
}

function bytesToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ApiError(`Could not read ${file.name}.`, 'FILE_READ_FAILED'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

const bufferToBase64url = (value: ArrayBuffer) => {
  const bytes = new Uint8Array(value); let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const base64urlToBuffer = (value: string) => {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

const deploymentSpec = (spec: DeploySpec): Record<string, unknown> => ({
  workloadId: spec.workload, setupMode: spec.mode.toUpperCase(), softwareId: spec.engine,
  softwareVersion: spec.version, presetId: spec.preset, selectedAddons: spec.addons,
  environmentVariables: { ...spec.settings, ...spec.secrets }, serverProperties: spec.settings,
  eulaAccepted: spec.settings['eulaAccepted'] === 'true' || spec.mode === 'quick',
  serverName: spec.name, planVersionId: spec.planId, regionId: spec.regionId,
});

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

  const plans = async (): Promise<D.Plan[]> => {
    const payload = await request<Json>('/api/v1/catalog/plans');
    return array(payload['plans'], 'plans').map((plan, index) => {
      const resources = record(plan['resources'], `plans[${index}].resources`);
      const prices = array(plan['prices'], `plans[${index}].prices`);
      const monthly = prices.find((price) => text(price['interval']) === 'MONTHLY');
      const yearly = prices.find((price) => text(price['interval']) === 'ANNUAL');
      if (!monthly || !yearly) throw new ApiError('A published plan is missing monthly or annual pricing.', 'INVALID_RESPONSE', 502);
      const c = currency(monthly['currency']);
      return {
        id: requiredText(plan['planVersionId'], 'plan.planVersionId'), name: requiredText(plan['planName'], 'plan.planName'),
        workloads: workloadFromCatalog(plan['productSlug']), ramMb: number(resources['memoryMb'], 'plan.resources.memoryMb'),
        cpuPct: number(resources['cpuPct'], 'plan.resources.cpuPct'), diskMb: number(resources['diskMb'], 'plan.resources.diskMb'),
        priceMonthly: { amount: number(monthly['priceMinorUnits'], 'plan.monthlyPrice'), currency: c },
        priceYearly: { amount: number(yearly['priceMinorUnits'], 'plan.annualPrice'), currency: currency(yearly['currency']) },
        features: [`${number(resources['databases'] ?? 0, 'plan.resources.databases')} databases`, `${number(resources['backups'] ?? 0, 'plan.resources.backups')} backups`],
      };
    });
  };

  const mapInvoice = (invoice: Json, lines: Json[] = []): D.InvoiceRecord => {
    const status = text(invoice['status']).toUpperCase();
    const state: D.InvoiceState = status === 'PAID' ? 'paid' : status === 'OVERDUE' ? 'overdue' : status === 'VOIDED' ? 'void' : status === 'CREDITED' ? 'refunded' : 'open';
    const c = currency(invoice['currency']);
    return {
      id: requiredText(invoice['id'], 'invoice.id'), number: text(invoice['invoice_number'], 'Draft'), state,
      issuedOn: iso(invoice['created_at']), dueOn: typeof invoice['due_date'] === 'string' ? invoice['due_date'] : undefined,
      paidOn: typeof invoice['paid_at'] === 'string' ? invoice['paid_at'] : undefined,
      lines: lines.map((line) => ({ id: requiredText(line['id'], 'invoiceLine.id'), description: text(line['description'], 'Hosting service'), serviceId: typeof line['service_id'] === 'string' ? line['service_id'] : undefined, amount: { amount: number(line['amount_minor_units'], 'invoiceLine.amount_minor_units'), currency: c } })),
      subtotal: { amount: number(invoice['subtotal_minor_units'], 'invoice.subtotal_minor_units'), currency: c }, tax: { amount: number(invoice['tax_minor_units'], 'invoice.tax_minor_units'), currency: c }, total: { amount: number(invoice['total_minor_units'], 'invoice.total_minor_units'), currency: c },
    };
  };

  const mapTicket = (ticket: Json, messages: Json[] = [], attachments: Json[] = []): D.TicketRecord => ({
    id: requiredText(ticket['id'], 'ticket.id'), number: requiredText(ticket['id'], 'ticket.id'), subject: requiredText(ticket['subject'], 'ticket.subject'),
    department: 'Support', state: ticketState(ticket['status']), priority: text(ticket['priority'], 'NORMAL').toLowerCase() as D.TicketPriority,
    createdAt: iso(ticket['created_at']), updatedAt: iso(ticket['updated_at']),
    messages: messages.map((message) => ({
      id: requiredText(message['id'], 'ticket.message.id'), author: text(message['author_name'], bool(message['is_staff']) ? 'Fortless Support' : 'Customer'), fromStaff: bool(message['is_staff']), at: iso(message['created_at']), body: text(message['body']),
      attachments: attachments.filter((attachment) => attachment['message_id'] === message['id']).map((attachment) => ({ name: text(attachment['filename'], 'attachment'), size: number(attachment['byte_size'], 'attachment.byte_size') })),
    })),
  });

  const uploadTicketFiles = async (ticketId: string, messageId: string | undefined, files: File[]) => {
    for (const file of files) {
      await request(`${`/api/v1/tickets/${enc(ticketId)}/attachments`}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', dataBase64: await bytesToBase64(file), messageId }) });
    }
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
        ...services.filter((service) => service.state === 'error').map<D.Warning>((service) => ({ id: `service-${service.id}`, severity: 'error', title: `${service.name} needs attention`, detail: service.note ?? 'The service encountered a technical error.', serviceId: service.id, action: { label: 'View service', to: `/app/services/${service.id}` } })),
        ...invoices.filter((invoice) => invoice.state === 'overdue').map<D.Warning>((invoice) => ({ id: `invoice-${invoice.id}`, severity: 'warn', title: `Invoice ${invoice.number} is overdue`, detail: 'Review the authoritative invoice record before taking action.', action: { label: 'Review invoices', to: '/app/billing/invoices' } })),
      ];
    },
    serviceEvents: async () => (await activity()).filter((event) => event.target).slice(0, 12).map((event) => ({ id: event.id, at: event.at, serviceId: '', serviceName: event.target!, severity: event.outcome === 'failed' ? 'error' : 'info', text: event.action })),
    profile: async () => api.identity(),
    saveProfile: async (patch) => {
      const current = await api.identity();
      const name = patch.fullName ?? current.fullName;
      await request('/api/v1/account/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      bump(); return { ...current, fullName: name, avatarInitials: initials(name) };
    },
    changePassword: async (currentPassword, newPassword) => { await request('/api/v1/auth/password/change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) }); bump(); },
    beginMfaEnrollment: async (password) => { const payload = await request<Json>('/api/v1/auth/mfa/totp/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); return { secret: requiredText(payload['secret'], 'mfa.secret'), uri: requiredText(payload['uri'], 'mfa.uri') }; },
    confirmMfaEnrollment: async (code) => { const payload = await request<Json>('/api/v1/auth/mfa/totp/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }); bump(); return Array.isArray(payload['recoveryCodes']) ? payload['recoveryCodes'].map((value) => requiredText(value, 'recovery code')) : []; },
    completeMfaStepUp: async (password, code) => { await request('/api/v1/auth/step-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, code }) }); },
    regenerateRecoveryCodes: async () => { const payload = await request<Json>('/api/v1/auth/mfa/recovery-codes/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return Array.isArray(payload['recoveryCodes']) ? payload['recoveryCodes'].map((value) => requiredText(value, 'recovery code')) : []; },
    regions: async () => {
      const payload = await request<Json>('/api/v1/catalog/regions');
      return array(payload['regions'], 'regions').map((region) => ({ id: requiredText(region['id'], 'region.id'), name: requiredText(region['name'], 'region.name'), country: requiredText(region['country'], 'region.country'), available: !bool(region['isSoldOut']) }));
    },
    deploymentCatalog: async (): Promise<WorkloadCatalog[]> => {
      const payload = await request<Json>('/api/v1/deploy/workloads');
      return array(payload['workloads'], 'deployment workloads').filter((workload) => bool(workload['supported'])).map((workload, workloadIndex) => ({
        id: requiredText(workload['id'], `workloads[${workloadIndex}].id`), label: requiredText(workload['name'], `workloads[${workloadIndex}].name`),
        blurb: text(workload['tagline'], text(workload['description'])), icon: text(workload['icon'], 'server-01'), defaultMode: text(workload['defaultSetupMode']) === 'CUSTOM' ? 'custom' : 'quick',
        engines: array(workload['softwareOptions'], 'workload software').map((software) => ({ id: requiredText(software['id'], 'software.id'), label: requiredText(software['name'], 'software.name'), description: text(software['description']), versions: Array.isArray(software['versions']) ? software['versions'].map((version) => requiredText(version, 'software.version')) : [], recommended: bool(software['recommended']) })),
        presets: array(workload['presets'], 'workload presets').map((preset) => ({ id: requiredText(preset['id'], 'preset.id'), label: requiredText(preset['name'], 'preset.name'), description: text(preset['description']) })),
        addons: array(workload['addonOptions'], 'workload addons').map((addon) => ({ id: requiredText(addon['id'], 'addon.id'), label: requiredText(addon['name'], 'addon.name'), description: text(addon['description']) })),
        fields: Array.isArray(workload['configurationFields']) ? array(workload['configurationFields'], 'workload fields').map((field) => { const rawType = text(field['type']); return { key: requiredText(field['key'], 'field.key'), label: requiredText(field['label'], 'field.label'), type: rawType === 'boolean' ? 'switch' as const : rawType === 'string' ? 'text' as const : rawType as 'number' | 'select' | 'secret', default: String(field['default'] ?? ''), required: bool(field['required']), secret: rawType === 'secret', help: text(field['description']) || undefined, options: Array.isArray(field['options']) ? array(field['options'], 'field options').map((option) => ({ value: requiredText(option['value'], 'option.value'), label: requiredText(option['label'], 'option.label') })) : undefined }; }) : [],
      }));
    },
    plans,
    quote: async (spec: DeploySpec) => {
      const validated = deploymentSpec(spec);
      await request('/api/v1/deploy/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validated) });
      const payload = await request<Json>('/api/v1/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ planVersionId: spec.planId, quantity: 1, interval: spec.cycle === 'yearly' ? 'ANNUAL' : 'MONTHLY', regionId: spec.regionId, customOptions: { deploymentSpec: validated, serverName: spec.name } }] }) });
      const c = currency(payload['currency']);
      return { id: requiredText(payload['id'], 'quote.id'), lines: array(payload['lines'], 'quote.lines').map((line) => ({ label: text(line['planVersionId'], 'Hosting plan'), amount: { amount: number(line['totalMinorUnits'], 'quote.line.totalMinorUnits'), currency: c } })), tax: { amount: number(payload['taxMinorUnits'], 'quote.taxMinorUnits'), currency: c }, total: { amount: number(payload['totalMinorUnits'], 'quote.totalMinorUnits'), currency: c }, dueToday: { amount: number(payload['totalMinorUnits'], 'quote.totalMinorUnits'), currency: c } };
    },
    listOrders: async () => {
      const payload = await request<Json>('/api/v1/orders');
      const orders = array(payload['orders'], 'orders');
      return Promise.all(orders.map(async (summary) => {
        const detail = await request<Json>(`/api/v1/orders/${enc(requiredText(summary['id'], 'order.id'))}`);
        const order = record(detail['order'], 'order'); const items = array(detail['items'], 'order.items');
        const rawStatus = text(order['status']).toUpperCase();
        const state: D.OrderState = rawStatus === 'ACTIVE' || rawStatus === 'FULFILLED' || rawStatus === 'PAID' ? 'active' : rawStatus === 'FAILED' ? 'failed' : rawStatus === 'CANCELED' || rawStatus === 'CANCELLED' ? 'cancelled' : rawStatus === 'PENDING_PAYMENT' ? 'pending-payment' : 'provisioning';
        return { id: requiredText(order['id'], 'order.id'), number: requiredText(order['id'], 'order.id'), placedOn: iso(order['created_at']), state, items: items.map((item) => ({ title: text(item['description'], text(item['plan_version_id'], 'Hosting service')), detail: text(item['billing_interval'], '') })), total: { amount: number(order['total_minor_units'], 'order.total_minor_units'), currency: currency(order['currency']) }, invoiceId: typeof order['invoice_id'] === 'string' ? order['invoice_id'] : undefined };
      }));
    },
    getInvoice: async (id) => { const payload = await request<Json>(`/api/v1/invoices/${enc(id)}`); return mapInvoice(record(payload['invoice'], 'invoice'), array(payload['lines'], 'invoice.lines')); },
    cancelSubscription: async (id) => { await request(`/api/v1/subscriptions/${enc(id)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ immediate: false }) }); bump(); },
    resumeSubscription: async (id) => { await request(`/api/v1/subscriptions/${enc(id)}/reactivate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); bump(); },
    billingProfile: async () => {
      const payload = await request<Json>('/api/v1/account/billing-profile'); const profile = payload['profile'] === null ? {} : record(payload['profile'], 'billing profile'); const identity = await api.identity();
      return { company: text(profile['companyName']) || undefined, fullName: identity.fullName, email: identity.email, addressLine1: text(profile['addressLine1']), addressLine2: text(profile['addressLine2']) || undefined, city: text(profile['city']), postalCode: text(profile['postalCode']), country: text(profile['country'], 'DE'), vatId: text(profile['taxId']) || undefined, vatStatus: profile['taxId'] ? 'pending' : 'none', currency: 'EUR' };
    },
    saveBillingProfile: async (profile) => {
      const payload = await request<Json>('/api/v1/account/billing-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyName: profile.company ?? null, taxId: profile.vatId ?? null, addressLine1: profile.addressLine1, addressLine2: profile.addressLine2 ?? null, city: profile.city, postalCode: profile.postalCode, country: profile.country }) });
      const saved = record(payload['profile'], 'billing profile'); bump(); return { ...profile, company: text(saved['companyName']) || undefined, vatId: text(saved['taxId']) || undefined, vatStatus: saved['taxId'] ? 'pending' : 'none' };
    },
    listDomains: async () => {
      const payload = await request<Json>('/api/v1/domains/zones');
      return array(payload['zones'], 'domain zones').map((zone) => ({ id: requiredText(zone['id'], 'zone.id'), name: requiredText(zone['domain_name'], 'zone.domain_name'), state: text(zone['status']).includes('EXPIRED') ? 'expired' : text(zone['status']).includes('PENDING') ? 'pending-registration' : 'active', registeredOn: iso(zone['created_at']), expiresOn: iso(zone['expires_at']), autoRenew: bool(zone['auto_renew']), privacy: bool(zone['whois_privacy']), nameservers: (() => { try { return JSON.parse(text(zone['nameservers'], '[]')) as string[]; } catch { return []; } })(), locked: false }));
    },
    getDomain: async (name) => { const domains = await api.listDomains(); const domain = domains.find((item) => item.name === name); if (!domain) throw new ApiError('Domain not found.', 'NOT_FOUND', 404); return domain; },
    searchDomains: async (query): Promise<DomainSearchResult[]> => { const payload = await request<Json>(`/api/v1/domains/search?query=${enc(query)}`); return array(payload['results'], 'domain search').map((item) => { const rawAmount = item['annualPriceMinorUnits']; const price = rawAmount === undefined || rawAmount === null ? undefined : { amount: number(rawAmount, 'domain.annualPriceMinorUnits'), currency: currency(item['currency']) }; return { name: requiredText(item['domain'], 'domain.domain'), tld: text(item['tld']), available: bool(item['available']), price, renewPrice: price }; }); },
    dnsRecords: async (name) => { const domain = await api.getDomain(name); const payload = await request<Json>(`/api/v1/domains/zones/${enc(domain.id)}/records`); return array(payload['records'], 'dns records').filter((item) => text(item['record_type']) !== 'NS').map((item) => ({ id: requiredText(item['id'], 'dns.id'), type: text(item['record_type']) as 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV', name: text(item['name'], '@'), value: requiredText(item['content'], 'dns.content'), ttl: number(item['ttl'], 'dns.ttl') })); },
    saveDnsRecord: async (name, item) => { const domain = await api.getDomain(name); await request(`/api/v1/domains/zones/${enc(domain.id)}/records${item.id ? `/${enc(item.id)}` : ''}`, { method: item.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordType: item.type, name: item.name, content: item.value, ttl: item.ttl }) }); bump(); },
    deleteDnsRecord: async (name, id) => { const domain = await api.getDomain(name); await request(`/api/v1/domains/zones/${enc(domain.id)}/records/${enc(id)}`, { method: 'DELETE' }); bump(); },
    getTicket: async (id) => { const payload = await request<Json>(`/api/v1/tickets/${enc(id)}`); return mapTicket(record(payload['ticket'], 'ticket'), array(payload['messages'], 'ticket.messages'), array(payload['attachments'], 'ticket.attachments')); },
    createTicket: async (ticket) => { const created = await request<Json>('/api/v1/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: ticket.subject, priority: ticket.priority.toUpperCase(), message: ticket.body }) }); const id = requiredText(created['ticketId'], 'ticket.ticketId'); await uploadTicketFiles(id, text(created['messageId']) || undefined, ticket.files); bump(); return api.getTicket(id); },
    replyTicket: async (id, body, files) => { const result = await request<Json>(`/api/v1/tickets/${enc(id)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) }); await uploadTicketFiles(id, text(result['messageId']) || undefined, files); bump(); },
    closeTicket: async (id) => { await request(`/api/v1/tickets/${enc(id)}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); bump(); },
    sessions: async () => { const payload = await request<Json>('/api/v1/auth/sessions'); return array(payload['sessions'], 'sessions').map((session) => ({ id: requiredText(session['id'], 'session.id'), device: text(session['userAgent'], 'Unknown browser'), location: text(session['ipAddress']) || undefined, lastActive: iso(session['lastActiveAt']), current: bool(session['isCurrent']) })); },
    revokeSession: async (id) => { await request(`/api/v1/auth/sessions/${enc(id)}`, { method: 'DELETE' }); bump(); },
    revokeOtherSessions: async () => { await request('/api/v1/auth/sessions/revoke-others', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); bump(); },
    passkeys: async () => { const payload = await request<Json>('/api/v1/auth/passkeys'); return array(payload['passkeys'], 'passkeys').map((key) => ({ id: requiredText(key['id'], 'passkey.id'), name: text(key['deviceLabel'], 'Passkey'), addedOn: iso(key['createdAt']), lastUsed: typeof key['lastUsedAt'] === 'string' ? key['lastUsedAt'] : undefined })); },
    addPasskey: async (name) => {
      if (!window.PublicKeyCredential || !navigator.credentials) throw new ApiError('Passkeys are not supported by this browser.', 'UNSUPPORTED', 501);
      const options = await request<Json>('/api/v1/auth/passkeys/register-options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const user = record(options['user'], 'passkey.user'); const challenge = requiredText(options['challenge'], 'passkey.challenge');
      const credential = await navigator.credentials.create({ publicKey: { challenge: base64urlToBuffer(challenge), rp: record(options['rp'], 'passkey.rp') as unknown as PublicKeyCredentialRpEntity, user: { id: new TextEncoder().encode(requiredText(user['id'], 'passkey.user.id')), name: requiredText(user['name'], 'passkey.user.name'), displayName: requiredText(user['displayName'], 'passkey.user.displayName') }, pubKeyCredParams: array(options['pubKeyCredParams'], 'passkey.pubKeyCredParams') as unknown as PublicKeyCredentialParameters[], timeout: number(options['timeout'], 'passkey.timeout'), authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }, attestation: 'none' } }) as PublicKeyCredential | null;
      if (!credential) throw new ApiError('Passkey registration was cancelled.', 'CANCELLED');
      const response = credential.response as AuthenticatorAttestationResponse;
      const result = await request<Json>('/api/v1/auth/passkeys/register-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceLabel: name || 'Passkey', challenge, clientDataJSON: bufferToBase64url(response.clientDataJSON), credentialId: bufferToBase64url(credential.rawId), publicKey: bufferToBase64url(response.attestationObject), transports: response.getTransports?.() }) });
      const key = record(result['passkey'], 'passkey'); bump(); return { id: requiredText(key['id'], 'passkey.id'), name: text(key['deviceLabel'], name), addedOn: iso(key['createdAt']) };
    },
    removePasskey: async (id) => { await request(`/api/v1/auth/passkeys/${enc(id)}`, { method: 'DELETE' }); bump(); },
    team: async () => { const payload = await request<Json>('/api/v1/account/members'); const role = (value: unknown): D.TeamMemberRecord['role'] => text(value) === 'OWNER' ? 'owner' : text(value) === 'TECH_ADMIN' ? 'admin' : text(value) === 'BILLING_MANAGER' ? 'billing' : 'viewer'; return [...array(payload['members'], 'members').map((member) => ({ id: requiredText(member['id'], 'member.id'), name: text(member['name'], text(member['email'])), email: requiredText(member['email'], 'member.email'), role: role(member['role']), status: 'active' as const, permissions: [] })), ...array(payload['invitations'], 'invitations').map((invite) => ({ id: requiredText(invite['id'], 'invitation.id'), name: requiredText(invite['email'], 'invitation.email'), email: requiredText(invite['email'], 'invitation.email'), role: role(invite['role']), status: 'invited' as const, permissions: [] }))]; },
    inviteMember: async (email, role) => { const backendRole = role === 'owner' ? 'OWNER' : role === 'admin' || role === 'developer' ? 'TECH_ADMIN' : role === 'billing' ? 'BILLING_MANAGER' : 'VIEWER'; await request('/api/v1/account/members/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role: backendRole }) }); bump(); },
    removeMember: async (id) => { await request(`/api/v1/account/members/${enc(id)}`, { method: 'DELETE' }); bump(); },
    notificationPrefs: async () => { const payload = await request<Json>('/api/v1/notification-preferences'); const prefs = record(payload['preferences'], 'notification preferences'); return { channels: { email: true, discord: false, push: false }, topics: { billing: { email: bool(prefs['billingEmail']), discord: false, push: false }, service: { email: bool(prefs['serviceEmail']), discord: false, push: false }, support: { email: bool(prefs['supportEmail']), discord: false, push: false } } }; },
    saveNotificationPrefs: async (prefs) => { await request('/api/v1/notification-preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billingEmail: prefs.topics['billing']?.email ?? true, serviceEmail: prefs.topics['service']?.email ?? true, supportEmail: prefs.topics['support']?.email ?? true }) }); bump(); },
    announcements: async () => { const payload = await request<Json>('/api/v1/notifications'); return array(payload['notifications'], 'notifications').map((item) => ({ id: requiredText(item['id'], 'notification.id'), kind: text(item['type']).includes('INCIDENT') ? 'incident' : text(item['type']).includes('MAINTENANCE') ? 'maintenance' : 'news', title: requiredText(item['title'], 'notification.title'), body: text(item['message']), at: iso(item['createdAt']), read: Boolean(item['readAt']) })); },
    markAnnouncementRead: async (id) => { await request(`/api/v1/notifications/${enc(id)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); bump(); },
    markAllAnnouncementsRead: async () => { await request('/api/v1/notifications/read-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); bump(); },
    kb: async () => { const payload = await request<Json>('/api/v1/kb/articles?limit=20'); return array(payload['articles'], 'knowledge articles').map((item) => ({ id: text(item['slug'], requiredText(item['id'], 'article.id')), category: text(item['category'], 'General'), title: requiredText(item['title'], 'article.title'), summary: text(item['summary']), body: text(item['contentMarkdown']).split(/\n\s*\n/).filter(Boolean), updatedOn: iso(item['updatedAt']), tags: Array.isArray(item['tags']) ? item['tags'].filter((tag): tag is string => typeof tag === 'string') : [] })); },
    power: async (id, action) => { await request(`/api/v1/services/${enc(id)}/power`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action.toUpperCase() }) }); bump(); },
    usage: unsupported,
    checkout: async (input) => {
      if (!input.acceptedTerms) throw new ApiError('Accept the terms of service to continue.', 'TERMS_REQUIRED', 400);
      const validated = deploymentSpec(input.deploymentSpec);
      const payload = await request<Json>('/api/v1/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ quoteId: input.quoteId, regionId: input.regionId, customOptions: { deploymentSpec: validated, serverName: input.deploymentSpec.name } }) });
      return { orderId: requiredText(payload['orderId'], 'checkout.orderId'), invoiceId: typeof payload['invoiceId'] === 'string' ? payload['invoiceId'] : undefined, paymentAttemptId: typeof payload['paymentAttemptId'] === 'string' ? payload['paymentAttemptId'] : undefined, checkoutUrl: requiredText(payload['checkoutUrl'], 'checkout.checkoutUrl') };
    },
    cart: async () => [], addToCart: unsupported, removeFromCart: unsupported, payInvoice: unsupported, changeCycle: unsupported,
    listPaymentMethods: async () => [], addPaymentMethod: unsupported, removePaymentMethod: unsupported, setDefaultPaymentMethod: unsupported,
    saveNameservers: unsupported, setDomainAutoRenew: unsupported, apiKeys: unsupported, createApiKey: unsupported, revokeApiKey: unsupported,
  };
  return Object.assign(api, { subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, version: () => version, bump });
}
