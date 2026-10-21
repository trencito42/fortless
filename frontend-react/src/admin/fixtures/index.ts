import type {
  ActionItem, Announcement, ApprovalRequest, AuditEvent, Campaign, Category, Coupon, Customer, Department, EmailDelivery, EmailTemplate, FeatureFlag, Incident, InfraNode, Invoice, IpAllocation, Job,
  KbArticle, KbCategory, LegalDoc, Macro, MaintenanceWindow, MarketingBlock, Order, Payment, Plan, PriceRule, Product, ProviderConnection, ProviderEgg, Refund, SecurityEvent, Service, StaffMember,
  StatusComponent, Subscription, Ticket, WebhookEvent, Worker,
} from '../types';
import { buildCustomers, buildStaff } from './people';
import { buildCommerce } from './commerce';
import { categories, coupons, eggs, plans, priceRules, products } from './catalog';
import { buildTickets, departments, macros } from './support';
import { buildComponents, incidents, maintenance } from './monitoring';
import { approvals, buildActions, connections, workers } from './ops';
import { announcements, campaigns, kbArticles, kbCategories, legalDocs, marketingBlocks } from './content';
import { emailDeliveries, emailTemplates, featureFlags } from './system';
import { buildAudit } from './audit';

export interface AdminData {
  customers: Customer[]; services: Service[]; orders: Order[]; invoices: Invoice[]; payments: Payment[]; refunds: Refund[]; subscriptions: Subscription[];
  categories: Category[]; products: Product[]; plans: Plan[]; coupons: Coupon[]; priceRules: PriceRule[]; eggs: ProviderEgg[];
  nodes: InfraNode[]; ips: IpAllocation[]; connections: ProviderConnection[]; jobs: Job[]; workers: Worker[]; webhooks: WebhookEvent[]; actions: ActionItem[];
  components: StatusComponent[]; incidents: Incident[]; maintenance: MaintenanceWindow[];
  tickets: Ticket[]; departments: Department[]; macros: Macro[];
  kbCategories: KbCategory[]; kbArticles: KbArticle[]; announcements: Announcement[]; marketingBlocks: MarketingBlock[]; legalDocs: LegalDoc[]; campaigns: Campaign[];
  staff: StaffMember[]; approvals: ApprovalRequest[]; audit: AuditEvent[]; security: SecurityEvent[];
  featureFlags: FeatureFlag[]; emailTemplates: EmailTemplate[]; emailDeliveries: EmailDelivery[];
}

/** Builds the whole synthetic universe. Deterministic: same input, same ids, same relationships, on every load. */
export function buildAdminData(): AdminData {
  const customers = buildCustomers();
  const staff = buildStaff();
  const c = buildCommerce(customers);
  const tickets = buildTickets(customers, c.services, staff);
  const actions = buildActions(customers, c.orders, c.jobs, c.payments, c.webhooks, tickets, c.nodes, staff);
  const { audit, security } = buildAudit(customers, c.services, staff);
  return {
    customers, services: c.services, orders: c.orders, invoices: c.invoices, payments: c.payments, refunds: c.refunds, subscriptions: c.subscriptions,
    categories, products, plans, coupons, priceRules, eggs, nodes: c.nodes, ips: c.ips, connections, jobs: c.jobs, workers, webhooks: c.webhooks, actions,
    components: buildComponents(c.nodes), incidents, maintenance, tickets, departments, macros,
    kbCategories, kbArticles, announcements, marketingBlocks, legalDocs, campaigns, staff, approvals, audit, security,
    featureFlags, emailTemplates, emailDeliveries,
  };
}
