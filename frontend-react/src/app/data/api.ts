import type * as D from '../domain/types';

/**
 * The single seam between the customer UI and data. The prototype implements it with fixtures (fixtureApi.ts); the integration agent
 * implements it against Fortless HTTP and maps wire DTOs to these domain types here, nowhere else. Every method is async and may reject
 * with `ApiError`. Capability flags tell the UI what is backed by production today (see `capabilities`).
 */
export class ApiError extends Error {
  constructor(message: string, readonly code: string = 'ERROR', readonly status = 400) { super(message); this.name = 'ApiError'; }
}

export interface DomainSearchResult { name: string; tld: string; available: boolean; premium?: boolean; price?: D.Money; renewPrice?: D.Money }
export interface PayResult { ok: true; receipt: string }
export interface CheckoutInput { quoteId: string; regionId: string; deploymentSpec: DeploySpec; acceptedTerms: boolean }
export interface CheckoutResult { orderId: string; invoiceId?: string; paymentAttemptId?: string; checkoutUrl: string }
export interface ServiceFilters { q?: string }
export interface CatalogField { key: string; label: string; type: 'text' | 'number' | 'select' | 'secret' | 'switch'; default: string; required?: boolean; options?: { value: string; label: string }[]; help?: string; secret?: boolean; min?: number; max?: number }
export interface CatalogEngine { id: string; label: string; description: string; versions: string[]; recommended?: boolean }
export interface CatalogPreset { id: string; label: string; description: string }
export interface CatalogAddon { id: string; label: string; description: string }
export interface WorkloadCatalog { id: string; label: string; blurb: string; icon: string; defaultMode: 'quick' | 'custom'; engines: CatalogEngine[]; presets: CatalogPreset[]; addons: CatalogAddon[]; fields: CatalogField[] }
export interface DeploySpec {
  workload: string; mode: 'quick' | 'custom'; name: string; engine: string; version: string; preset?: string; addons: string[];
  settings: Record<string, string>; secrets?: Record<string, string>; planId: string; regionId: string; cycle: D.BillingCycle;
}
export interface DeployQuote { id: string; lines: { label: string; amount: D.Money }[]; tax: D.Money; total: D.Money; dueToday: D.Money }

export interface CustomerApi {
  identity(): Promise<D.CustomerIdentity>;
  // dashboard
  warnings(): Promise<D.Warning[]>;
  serviceEvents(): Promise<D.ServiceEvent[]>;
  // services
  listServices(): Promise<D.ServiceRow[]>;
  getService(id: string): Promise<D.ServiceRow>;
  power(id: string, action: 'start' | 'stop' | 'restart' | 'kill'): Promise<void>;
  usage(serviceId: string, range: D.UsageSeries['range']): Promise<D.UsageSeries>;
  // catalog + deploy + cart + orders
  regions(): Promise<D.Region[]>;
  plans(): Promise<D.Plan[]>;
  deploymentCatalog(): Promise<WorkloadCatalog[]>;
  quote(spec: DeploySpec): Promise<DeployQuote>;
  cart(): Promise<D.CartItem[]>;
  addToCart(item: Omit<D.CartItem, 'id'>): Promise<D.CartItem>;
  removeFromCart(id: string): Promise<void>;
  checkout(input: CheckoutInput): Promise<CheckoutResult>;
  listOrders(): Promise<D.OrderRecord[]>;
  // billing
  listInvoices(): Promise<D.InvoiceRecord[]>;
  getInvoice(id: string): Promise<D.InvoiceRecord>;
  payInvoice(id: string, paymentMethodId: string): Promise<PayResult>;
  listSubscriptions(): Promise<D.SubscriptionRecord[]>;
  cancelSubscription(id: string): Promise<void>;
  resumeSubscription(id: string): Promise<void>;
  changeCycle(id: string, cycle: D.BillingCycle): Promise<void>;
  listPaymentMethods(): Promise<D.PaymentMethodRecord[]>;
  addPaymentMethod(m: Omit<D.PaymentMethodRecord, 'id' | 'isDefault'>): Promise<D.PaymentMethodRecord>;
  removePaymentMethod(id: string): Promise<void>;
  setDefaultPaymentMethod(id: string): Promise<void>;
  billingProfile(): Promise<D.BillingProfile>;
  saveBillingProfile(p: D.BillingProfile): Promise<D.BillingProfile>;
  // domains
  listDomains(): Promise<D.DomainRecord[]>;
  getDomain(name: string): Promise<D.DomainRecord>;
  searchDomains(query: string): Promise<DomainSearchResult[]>;
  dnsRecords(domain: string): Promise<{ id: string; type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV'; name: string; value: string; ttl: number; propagated?: boolean }[]>;
  saveDnsRecord(domain: string, r: { id?: string; type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV'; name: string; value: string; ttl: number }): Promise<void>;
  deleteDnsRecord(domain: string, id: string): Promise<void>;
  saveNameservers(domain: string, ns: string[]): Promise<void>;
  setDomainAutoRenew(domain: string, on: boolean): Promise<void>;
  // support
  listTickets(): Promise<D.TicketRecord[]>;
  getTicket(id: string): Promise<D.TicketRecord>;
  createTicket(t: D.NewTicket): Promise<D.TicketRecord>;
  replyTicket(id: string, body: string, files: File[]): Promise<void>;
  closeTicket(id: string): Promise<void>;
  // account
  profile(): Promise<D.Profile>;
  saveProfile(p: Partial<D.Profile>): Promise<D.Profile>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  beginMfaEnrollment(password: string): Promise<{ secret: string; uri: string }>;
  confirmMfaEnrollment(code: string): Promise<string[]>;
  completeMfaStepUp(password: string, code: string): Promise<void>;
  regenerateRecoveryCodes(): Promise<string[]>;
  sessions(): Promise<D.SessionRecord[]>;
  revokeSession(id: string): Promise<void>;
  passkeys(): Promise<D.PasskeyRecord[]>;
  addPasskey(name: string): Promise<D.PasskeyRecord>;
  removePasskey(id: string): Promise<void>;
  apiKeys(): Promise<D.ApiKeyRecord[]>;
  createApiKey(name: string, scopes: string[]): Promise<{ key: D.ApiKeyRecord; secret: string }>;
  revokeApiKey(id: string): Promise<void>;
  team(): Promise<D.TeamMemberRecord[]>;
  inviteMember(email: string, role: D.TeamMemberRecord['role']): Promise<void>;
  removeMember(id: string): Promise<void>;
  notificationPrefs(): Promise<D.NotificationPrefs>;
  saveNotificationPrefs(p: D.NotificationPrefs): Promise<void>;
  activity(): Promise<D.ActivityRecord[]>;
  // content
  announcements(): Promise<D.Announcement[]>;
  markAnnouncementRead(id: string): Promise<void>;
  kb(): Promise<D.KbArticle[]>;
}

/** What each area is backed by. Drives the "Prototype" / "Planned" labels so unfinished integration is never implied to be live. */
export const capabilities: Record<string, { status: D.CapabilityStatus; note?: string }> = {
  services: { status: 'production' },
  deploy: { status: 'production' },
  billing: { status: 'partial', note: 'Invoices, orders, subscriptions and the billing profile are live. Saved payment methods, direct invoice payment and billing-cycle changes are not exposed by the backend.' },
  domains: { status: 'partial', note: 'DNS zones and records are live. Registrar purchase, nameserver updates and auto-renew changes are not exposed by the backend.' },
  support: { status: 'production' },
  account: { status: 'production', note: 'Identity is loaded from the authenticated Fortless session.' },
  usage: { status: 'planned', note: 'Historical usage needs a metrics backend.' },
  announcements: { status: 'production' },
  knowledge: { status: 'production' },
  notifications: { status: 'partial', note: 'Email preferences are live. Discord and push channels are not exposed by the backend.' },
};
