/**
 * Customer-facing domain model of the Fortless portal. These are the shapes the UI needs, not wire formats: the integration agent maps
 * backend DTOs to them in one adapter (see src/app/data/api.ts). Money is integer minor units; dates are ISO strings.
 * Service Detail keeps its own wire contracts in src/views/service-detail/contracts.ts.
 */
export type Currency = 'EUR' | 'USD' | 'RON';
export interface Money { amount: number; currency: Currency }

export type Workload = 'minecraft' | 'cs16' | 'cs2' | 'discord-bot' | 'nodejs' | 'python' | 'database';
export const WORKLOAD_LABEL: Record<Workload, string> = { minecraft: 'Minecraft', cs16: 'Counter-Strike 1.6', cs2: 'Counter-Strike 2', 'discord-bot': 'Discord bot', nodejs: 'Node.js app', python: 'Python app', database: 'Database' };

/** Observed infrastructure state. Commercial lifecycle is deliberately modelled separately. */
export type ServiceState = 'running' | 'offline' | 'starting' | 'stopping' | 'installing' | 'error' | 'unknown';
export type ServiceLifecycle = 'active' | 'past-due' | 'suspended' | 'cancelled' | 'terminated';
export type ProviderType = 'PTERODACTYL' | 'PROXMOX' | 'CPANEL';

export interface ServiceRow {
  id: string;
  name: string;
  workload: Workload;
  /** Engine or runtime, for example "Paper 1.21.8", "ReHLDS 3.14", "Node.js 22". */
  engine: string;
  state: ServiceState;
  lifecycle: ServiceLifecycle;
  provider: ProviderType;
  regionId: string;
  regionName: string;
  planId: string;
  planName: string;
  address?: string;
  players?: { online: number; max: number };
  resources: { cpuPct: number; ramUsedMb: number; ramLimitMb: number; diskUsedMb: number; diskLimitMb: number };
  /** Present only when an authoritative subscription/price record was loaded. */
  price?: Money;
  renewsOn?: string;
  createdAt: string;
  /** Why controls are unavailable (suspension, install), shown next to the row. */
  note?: string;
  tags?: string[];
}

export interface Region { id: string; name: string; country: string; available: boolean }
export interface Plan {
  id: string;
  name: string;
  /** Workload families this plan can host. */
  workloads: Workload[];
  ramMb: number; cpuPct: number; diskMb: number; slots?: number; bandwidthGb?: number;
  priceMonthly: Money;
  priceYearly: Money;
  highlight?: boolean;
  features: string[];
  /** Out of stock per region id. */
  soldOutIn?: string[];
}

export type InvoiceState = 'paid' | 'open' | 'overdue' | 'void' | 'refunded';
export interface InvoiceLineItem { id: string; description: string; serviceId?: string; amount: Money }
export interface InvoiceRecord { id: string; number: string; state: InvoiceState; issuedOn: string; dueOn?: string; paidOn?: string; lines: InvoiceLineItem[]; subtotal: Money; tax: Money; taxLabel?: string; total: Money; paymentMethodId?: string }

export type SubscriptionState = 'active' | 'cancel-scheduled' | 'past-due' | 'paused';
export type BillingCycle = 'monthly' | 'yearly';
export interface SubscriptionRecord { id: string; serviceId: string; serviceName: string; planName: string; cycle: BillingCycle; price: Money; state: SubscriptionState; renewsOn?: string; endsOn?: string; paymentMethodId?: string; autoRenew: boolean }

export interface PaymentMethodRecord { id: string; brand: 'visa' | 'mastercard' | 'amex' | 'sepa'; last4: string; expMonth?: number; expYear?: number; holder: string; isDefault: boolean }
export interface BillingProfile { company?: string; fullName: string; email: string; addressLine1: string; addressLine2?: string; city: string; postalCode: string; country: string; vatId?: string; vatStatus: 'none' | 'pending' | 'valid' | 'invalid'; currency: Currency }

export interface CartItem { id: string; kind: 'service' | 'domain' | 'addon'; title: string; detail: string; cycle: BillingCycle | 'yearly-domain'; price: Money; config?: Record<string, string> }
export type OrderState = 'pending-payment' | 'provisioning' | 'active' | 'failed' | 'cancelled';
export interface OrderRecord { id: string; number: string; placedOn: string; state: OrderState; items: { title: string; detail: string }[]; total: Money; invoiceId?: string; failure?: string }

export type DomainState = 'active' | 'expiring' | 'expired' | 'pending-transfer' | 'pending-registration';
export interface DomainRecord { id: string; name: string; state: DomainState; registeredOn: string; expiresOn: string; autoRenew: boolean; privacy: boolean; nameservers: string[]; renewPrice?: Money; locked: boolean; /** Linked service ids for the A record helper. */ serviceIds?: string[] }

export type TicketState = 'open' | 'answered' | 'awaiting-customer' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export interface TicketMessageRecord { id: string; author: string; fromStaff: boolean; at: string; body: string; attachments?: { name: string; size: number }[] }
export interface TicketRecord { id: string; number: string; subject: string; department: string; state: TicketState; priority: TicketPriority; serviceId?: string; serviceName?: string; createdAt: string; updatedAt: string; messages: TicketMessageRecord[]; unread?: boolean }
export interface NewTicket { subject: string; department: string; priority: TicketPriority; serviceId?: string; body: string; files: File[] }

export type AnnouncementKind = 'maintenance' | 'incident' | 'news' | 'resolved';
export interface Announcement { id: string; kind: AnnouncementKind; title: string; body: string; at: string; affects?: string[]; read: boolean }
export interface KbArticle { id: string; category: string; title: string; summary: string; body: string[]; updatedOn: string; tags: string[]; popular?: boolean }

export interface ActivityRecord { id: string; at: string; actor: string; actorKind: 'you' | 'teammate' | 'system'; action: string; target?: string; ip?: string; outcome: 'success' | 'failed' }
export interface ServiceEvent { id: string; at: string; serviceId: string; serviceName: string; severity: 'info' | 'warn' | 'error'; text: string }
export interface Warning { id: string; severity: 'warn' | 'error'; title: string; detail: string; serviceId?: string; action?: { label: string; to: string } }

export interface UsagePoint { t: number; cpu: number; ramMb: number; netInMbps: number; netOutMbps: number; diskMb: number }
export interface UsageSeries { serviceId: string; range: '1h' | '24h' | '7d' | '30d'; points: UsagePoint[]; bandwidth: { usedGb: number; limitGb: number } }

export interface NotificationPrefs { channels: Record<'email' | 'discord' | 'push', boolean>; topics: Record<string, { email: boolean; discord: boolean; push: boolean }> }
export interface ApiKeyRecord { id: string; name: string; prefix: string; createdOn: string; lastUsed?: string; scopes: string[] }
export interface TeamMemberRecord { id: string; name: string; email: string; role: 'owner' | 'admin' | 'billing' | 'developer' | 'viewer'; status: 'active' | 'invited'; lastActive?: string; permissions: string[] }
export interface SessionRecord { id: string; device: string; location?: string; lastActive: string; current: boolean }
export interface PasskeyRecord { id: string; name: string; addedOn: string; lastUsed?: string }
export interface Profile { fullName: string; email: string; emailVerified: boolean; phone?: string; language: string; timezone: string; avatarInitials: string; mfaEnabled: boolean; recoveryCodesLeft: number }
export interface CustomerIdentity extends Profile { accountName: string; role: string }

/** What a customer-facing capability is backed by today. The prototype labels anything that is not `production` so nobody mistakes it for live. */
export type CapabilityStatus = 'production' | 'partial' | 'planned';
