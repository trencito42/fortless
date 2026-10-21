/** Admin domain types. Mirrors backend vocabulary (src/modules/*) where one exists; everything else is marked `preview-only`. */

export type Currency = 'EUR' | 'USD' | 'RON';
/** Integer minor units (cents). Never summed across currencies. */
export interface Money { amount: number; currency: Currency }

export type StaffRole = 'OWNER' | 'ADMINISTRATOR' | 'BILLING' | 'SUPPORT' | 'INFRASTRUCTURE' | 'AUDITOR';
export type StaffPermission =
  | 'admin:access' | 'accounts:read' | 'accounts:manage' | 'services:read' | 'services:manage' | 'tickets:read' | 'tickets:manage'
  | 'audit:read' | 'staff:read' | 'staff:manage' | 'catalog:read' | 'catalog:manage' | 'content:read' | 'content:manage';

export interface Note { id: string; author: string; at: string; body: string }

/* ---------- Customers ---------- */
export type AccountStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'RESTRICTED' | 'SUSPENDED' | 'CLOSED';
export type RiskLevel = 'low' | 'medium' | 'high';
export interface Member { id: string; name: string; email: string; role: 'owner' | 'admin' | 'billing' | 'developer' | 'viewer'; mfa: boolean; lastLoginAt: string | null; status: 'active' | 'invited' | 'disabled' }
export interface BillingProfile { legalName: string; addressLine: string; city: string; postalCode: string; country: string; vatId: string; taxExempt: boolean }
export interface Customer {
  id: string; name: string; email: string; type: 'individual' | 'business'; country: string; status: AccountStatus; risk: RiskLevel;
  currency: Currency; createdAt: string; lastLoginAt: string | null; emailVerified: boolean; mfaEnabled: boolean;
  billingProfile: BillingProfile; creditBalance: Money; members: Member[]; notes: Note[]; restrictions: string[]; tags: string[];
}

/* ---------- Catalog ---------- */
export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
export interface PlanResources { memoryMb: number; cpuPct: number; diskMb: number; databases: number; backups: number; eggId?: number; dockerImage?: string }
export interface PlanPrice { currency: Currency; interval: BillingInterval; priceMinorUnits: number; setupFeeMinorUnits: number }
export interface PlanOption { id: string; key: string; label: string; inputType: 'select' | 'number' | 'toggle'; isRequired: boolean; priceDeltaMinorUnits: number }
export interface Plan { id: string; productId: string; version: number; name: string; status: PlanStatus; resources: PlanResources; prices: PlanPrice[]; options: PlanOption[]; regions: string[]; capacityLimit: number | null }
export interface Product {
  id: string; slug: string; name: string; description: string; providerType: 'PTERODACTYL' | 'DOMAIN_REGISTRAR' | 'NONE'; isPublished: boolean;
  categoryId: string; restrictions: { allowedCountries: string[]; maxServicesPerAccount: number | null; requiresVerifiedEmail: boolean };
}
export interface Category { id: string; slug: string; name: string; order: number }
export interface Coupon { id: string; code: string; discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; discountValue: number; currency?: Currency; maxRedemptions: number; redemptionsCount: number; expiresAt: string; isActive: boolean; appliesTo: string }
export interface PriceRule { id: string; name: string; kind: 'discount' | 'tax' | 'cycle' | 'currency'; description: string; value: string; status: 'active' | 'draft' | 'disabled'; scope: string }
export interface ProviderEgg { id: number; name: string; nest: string; dockerImage: string; mappedPlans: string[]; compatible: boolean; note?: string }

/* ---------- Services ---------- */
export type ServiceLifecycle = 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'TERMINATED';
export type RuntimeState = 'running' | 'offline' | 'starting' | 'stopping' | 'installing' | 'error' | 'unknown';
export type ProviderSync = 'in_sync' | 'drift' | 'missing_remote' | 'unlinked';
export interface Service {
  id: string; name: string; customerId: string; orderId: string; productId: string; planId: string; productName: string; planName: string;
  lifecycle: ServiceLifecycle; runtime: RuntimeState; nodeId: string; region: string; ip: string; port: number;
  resources: PlanResources; usage: { memoryMb: number; cpuPct: number; diskMb: number };
  provider: { type: 'PTERODACTYL'; serverUuid: string; identifier: string; externalId: number | null; allocationId: number | null; sync: ProviderSync; lastSyncAt: string; correlationTag: string };
  billing: { interval: BillingInterval; price: Money; nextRenewal: string | null; autoRenew: boolean; subscriptionId: string };
  createdAt: string; members: string[];
}

/* ---------- Orders / billing ---------- */
export type OrderStatus = 'DRAFT' | 'AWAITING_PAYMENT' | 'PAID' | 'FULFILLING' | 'COMPLETED' | 'PARTIALLY_FULFILLED' | 'FULFILLMENT_FAILED' | 'CANCELED';
export type PaymentState = 'none' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed';
export type FulfillmentState = 'not_started' | 'queued' | 'in_progress' | 'completed' | 'partial' | 'failed';
export interface OrderLine { id: string; description: string; planId: string; quantity: number; unit: Money; interval: BillingInterval; serviceId: string | null }
export interface Order {
  id: string; customerId: string; status: OrderStatus; payment: PaymentState; fulfillment: FulfillmentState; fraudReview: 'none' | 'pending' | 'cleared' | 'rejected';
  lines: OrderLine[]; subtotal: Money; tax: Money; discount: Money; total: Money; couponCode: string | null; invoiceId: string | null; paymentIds: string[]; jobIds: string[]; createdAt: string; updatedAt: string;
  quoteId: string; error?: string;
}
export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
export interface InvoiceLine { id: string; description: string; quantity: number; unit: Money; taxRatePct: number }
export interface Invoice {
  id: string; number: string; customerId: string; status: InvoiceStatus; currency: Currency; issuedAt: string; dueAt: string;
  lines: InvoiceLine[]; subtotal: Money; tax: Money; discount: Money; total: Money; amountPaid: Money; amountRefunded: Money; creditApplied: Money;
  orderId: string | null; serviceId: string | null; paymentIds: string[]; refundIds: string[];
}
export type PaymentStatus = 'succeeded' | 'failed' | 'pending' | 'refunded' | 'partially_refunded' | 'disputed';
export interface Payment {
  id: string; customerId: string; invoiceId: string | null; orderId: string | null; amount: Money; status: PaymentStatus; method: { brand: string; last4: string } | { brand: 'SEPA'; last4: string };
  providerRef: string; createdAt: string; reconciled: boolean; failureCode?: string; webhookEventId: string | null;
}
export interface Refund { id: string; kind: 'refund' | 'credit_note'; customerId: string; invoiceId: string; paymentId: string | null; amount: Money; reason: string; status: 'pending_approval' | 'approved' | 'processed' | 'rejected' | 'failed'; requestedBy: string; approvedBy: string | null; createdAt: string; approvalId: string | null }
export type SubscriptionStatus = 'ACTIVE' | 'GRACE' | 'PAST_DUE' | 'CANCEL_AT_PERIOD_END' | 'CANCELED';
export interface Subscription { id: string; customerId: string; serviceId: string; planName: string; interval: BillingInterval; price: Money; status: SubscriptionStatus; autoRenew: boolean; currentPeriodEnd: string; failedAttempts: number; graceUntil: string | null; lastRenewalAt: string | null; }

/* ---------- Infrastructure ---------- */
export type NodeHealth = 'healthy' | 'degraded' | 'offline';
export interface InfraNode {
  id: string; name: string; region: string; fqdn: string; connectionId: string; health: NodeHealth; maintenance: { enabled: boolean; drain: boolean; reason: string | null; since: string | null; until: string | null };
  hardware: { cores: number; ramMb: number; diskMb: number; bandwidthMbps: number };
  overallocate: { ramPct: number; diskPct: number };
  usage: { cpuPct: number; ramMb: number; diskMb: number };
  allocated: { ramMb: number; diskMb: number; cpuPct: number };
  monthlyCost: Money | null; wingsVersion: string; lastHeartbeat: string; publicIp: string; ipPool: string; os: string;
}
export interface IpAllocation { id: string; ip: string; port: number; nodeId: string; serviceId: string | null; alias: string | null; kind: 'game' | 'primary' | 'reserved' }
export interface ProviderConnection { id: string; name: string; type: 'PTERODACTYL' | 'WINGS' | 'STRIPE' | 'SMTP' | 'DNS'; endpoint: string; health: 'connected' | 'degraded' | 'error' | 'not_configured'; lastSyncAt: string | null; lastError: string | null; secret: string; latencyMs: number | null; version: string | null }

/* ---------- Jobs ---------- */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead_letter' | 'manual_review';
export interface JobLog { at: string; level: 'info' | 'warn' | 'error'; message: string }
export interface Job {
  id: string; type: string; status: JobStatus; attempts: number; maxAttempts: number; correlationId: string; idempotencyKey: string;
  orderId: string | null; serviceId: string | null; customerId: string | null; nodeId: string | null; error: { code: string; message: string } | null; unknownOutcome: boolean;
  createdAt: string; startedAt: string | null; finishedAt: string | null; nextRetryAt: string | null; workerId: string | null; logs: JobLog[];
}
export interface Worker { id: string; queue: string; status: 'idle' | 'busy' | 'stalled' | 'stopped'; lastHeartbeat: string; processed24h: number; failed24h: number; currentJobId: string | null; version: string }
export interface WebhookEvent { id: string; provider: 'stripe' | 'pterodactyl'; type: string; status: 'received' | 'processed' | 'failed' | 'duplicate' | 'pending_review'; objectId: string; receivedAt: string; processedAt: string | null; signatureVerified: boolean; attempts: number; error: string | null; customerId: string | null }

/* ---------- Action center ---------- */
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';
export type ActionCategory = 'provisioning' | 'jobs' | 'webhooks' | 'payments' | 'support' | 'nodes' | 'capacity' | 'security' | 'email';
export interface ActionItem {
  id: string; category: ActionCategory; priority: ActionPriority; title: string; detail: string; status: 'open' | 'acknowledged' | 'resolved';
  resource: { type: string; id: string; label: string; to: string }; related: { type: string; id: string; label: string; to: string }[];
  assignee: string | null; createdAt: string; history: { id: string; at: string; actor: string; text: string }[]; notes: Note[];
}

/* ---------- Monitoring ---------- */
export type ComponentHealth = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance';
export interface StatusComponent { id: string; name: string; group: string; health: ComponentHealth; public: boolean; uptime30d: number; latencyMs: number | null; description: string; checkedAt: string }
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export interface Incident {
  id: string; title: string; severity: 'minor' | 'major' | 'critical'; status: IncidentStatus; componentIds: string[]; startedAt: string; resolvedAt: string | null;
  updates: { id: string; at: string; status: IncidentStatus; message: string; author: string }[]; internalNotes: Note[]; published: boolean;
}
export interface MaintenanceWindow { id: string; title: string; componentIds: string[]; startsAt: string; endsAt: string; status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'; publicMessage: string; nodeId: string | null }

/* ---------- Support ---------- */
export type TicketStatus = 'open' | 'waiting_customer' | 'waiting_staff' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export interface TicketMessage { id: string; author: 'customer' | 'staff' | 'internal'; name: string; at: string; body: string; attachments: { name: string; size: number }[] }
export interface Ticket {
  id: string; subject: string; customerId: string; requester: string; departmentId: string; priority: TicketPriority; status: TicketStatus; assigneeId: string | null;
  serviceIds: string[]; createdAt: string; updatedAt: string; firstResponseDueAt: string; firstResponseAt: string | null; messages: TicketMessage[]; tags: string[];
}
export interface Department { id: string; name: string; email: string; description: string; members: string[]; autoAssign: boolean; slaFirstResponseMin: number; active: boolean }
export interface Macro { id: string; title: string; departmentId: string | null; body: string; usage30d: number; shared: boolean }

/* ---------- Content / marketing ---------- */
export interface KbArticle { id: string; categoryId: string; title: string; slug: string; status: 'draft' | 'published' | 'archived'; body: string; seoTitle: string; seoDescription: string; updatedAt: string; author: string; views30d: number | null }
export interface KbCategory { id: string; name: string; slug: string; description: string }
export interface Announcement { id: string; title: string; body: string; severity: 'info' | 'warning' | 'maintenance'; status: 'draft' | 'scheduled' | 'published' | 'expired'; startsAt: string; endsAt: string | null; audience: string }
export interface MarketingBlock { id: string; page: string; key: string; label: string; value: string; kind: 'text' | 'longtext' | 'link'; updatedAt: string; maxLength: number }
export interface LegalRevision { version: string; at: string; author: string; summary: string; body: string }
export interface LegalDoc { id: string; kind: 'terms' | 'privacy' | 'cookies' | 'refund'; language: 'en' | 'ro'; title: string; status: 'published' | 'draft'; currentVersion: string; draft: string | null; revisions: LegalRevision[] }
export interface Campaign { id: string; name: string; channel: 'email' | 'banner' | 'social'; status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused'; audience: string; startsAt: string; endsAt: string | null; couponCode: string | null; sent: number | null; opened: number | null; notes: string }

/* ---------- Staff / audit ---------- */
export interface StaffMember { id: string; name: string; email: string; role: StaffRole; status: 'ACTIVE' | 'REVOKED'; mfa: boolean; lastLoginAt: string | null; createdAt: string; ipAllowlist: string[]; sessions: StaffSession[] }
export interface StaffSession { id: string; staffId: string; device: string; ip: string; location: string; startedAt: string; lastSeenAt: string; stepUpAt: string | null; current: boolean }
export interface ApprovalRequest { id: string; kind: 'large_refund' | 'destructive_operation' | 'permission_change' | 'sensitive_account_change'; summary: string; requestedBy: string; requestedAt: string; status: 'pending' | 'approved' | 'rejected' | 'expired'; resource: { type: string; id: string; label: string; to: string }; decidedBy: string | null; decidedAt: string | null; reason: string | null; amount: Money | null }
export interface AuditEvent {
  id: string; at: string; actor: { type: 'STAFF' | 'USER' | 'SYSTEM' | 'WEBHOOK'; id: string; name: string }; accountId: string | null; action: string;
  resource: { type: string; id: string; label: string }; result: 'success' | 'denied' | 'failed'; ip: string; correlationId: string;
  before?: Record<string, string>; after?: Record<string, string>; reason?: string; preview?: boolean;
}
export interface SecurityEvent { id: string; at: string; kind: 'login_failed' | 'mfa_failed' | 'step_up_denied' | 'permission_denied' | 'rate_limited' | 'session_revoked' | 'suspicious_login' | 'api_key_created'; severity: 'info' | 'warning' | 'critical'; actor: string; ip: string; detail: string; accountId: string | null; correlationId: string }

/* ---------- Settings ---------- */
export interface FeatureFlag { key: string; label: string; description: string; enabled: boolean; scope: 'global' | 'staff_only' | 'percentage'; rollout: number; owner: string; updatedAt: string; risk: 'low' | 'medium' | 'high' }
export interface EmailTemplate { key: string; name: string; subject: string; body: string; updatedAt: string; customized: boolean }
export interface EmailDelivery { id: string; template: string; to: string; status: 'sent' | 'failed' | 'bounced' | 'queued'; at: string; error: string | null }
