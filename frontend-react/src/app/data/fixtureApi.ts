import type * as D from '../domain/types';
import * as F from '../fixtures/data';
import { CATALOG } from '../fixtures/catalog';
import { ApiError, type CustomerApi, type DeploySpec, type DomainSearchResult } from './api';

export interface FixtureOptions {
  latency?: number;
  /** Method names that fail with the given error, for error-state demos and tests. */
  failing?: Partial<Record<keyof CustomerApi, ApiError>>;
  empty?: boolean;
}

const clone = <T,>(x: T): T => structuredClone(x);
const eur = (amount: number): D.Money => ({ amount, currency: 'EUR' });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let seq = 100;
const nid = (p: string) => `${p}_${++seq}`;

/**
 * Stateful in-memory implementation of CustomerApi used by the prototype and by tests. It changes its own copy of the fixtures so
 * actions visibly work (a created ticket appears, a cancelled subscription changes state) but nothing is sent anywhere.
 */
export function createFixtureApi(opts: FixtureOptions = {}): CustomerApi & { subscribe(fn: () => void): () => void; version(): number; reset(): void } {
  const latency = opts.latency ?? 160;
  let s = seed();
  const listeners = new Set<() => void>(); let ver = 0;
  const bump = () => { ver++; listeners.forEach((l) => l()); };
  function seed() {
    const e = !!opts.empty;
    return {
      services: e ? [] : clone(F.services), invoices: e ? [] : clone(F.invoices), subs: e ? [] : clone(F.subscriptions), methods: e ? [] : clone(F.paymentMethods), profile: clone(F.billingProfile),
      orders: e ? [] : clone(F.orders), cart: [] as D.CartItem[], domains: e ? [] : clone(F.domains), dns: clone(F.dnsRecords), tickets: e ? [] : clone(F.tickets), account: clone(F.profile),
      sessions: clone(F.sessions), passkeys: clone(F.passkeys), keys: e ? [] : clone(F.apiKeys), team: clone(F.team), prefs: clone(F.notificationPrefs), activity: e ? [] : clone(F.activity),
      news: clone(F.announcements), events: e ? [] : clone(F.serviceEvents),
    };
  }
  const call = async <T,>(name: keyof CustomerApi, fn: () => T): Promise<T> => {
    await sleep(latency);
    const f = opts.failing?.[name]; if (f) throw f;
    return clone(fn());
  };
  const find = <T extends { id: string }>(list: T[], id: string, what: string): T => { const x = list.find((i) => i.id === id); if (!x) throw new ApiError(`${what} not found.`, 'NOT_FOUND', 404); return x; };
  const total = (lines: D.Money[]) => eur(lines.reduce((a, l) => a + l.amount, 0));
  const tax = (m: D.Money) => eur(Math.round(m.amount * 0.19));

  const quoteFor = (spec: DeploySpec) => {
    const plan = F.plans.find((p) => p.id === spec.planId); if (!plan) throw new ApiError('Choose a plan first.', 'PLAN_REQUIRED');
    const price = spec.cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    const lines = [{ label: `${plan.name} (${spec.cycle})`, amount: price }, ...(spec.addons.length ? [{ label: `${spec.addons.length} addon${spec.addons.length > 1 ? 's' : ''}`, amount: eur(0) }] : [])];
    const sub = total(lines.map((l) => l.amount)); const t = tax(sub);
    return { id: 'quote_test', lines, tax: t, total: eur(sub.amount + t.amount), dueToday: eur(sub.amount + t.amount) };
  };

  const api: CustomerApi = {
    identity: () => call('identity', () => ({ ...s.account, accountName: 'Fortless Demo', role: 'Owner' })),
    warnings: () => call('warnings', () => {
      const w: D.Warning[] = [];
      for (const v of s.services) {
        if (v.state === 'error') w.push({ id: `w_${v.id}`, severity: 'error', title: `${v.name} crashed`, detail: v.note ?? 'The process exited unexpectedly.', serviceId: v.id, action: { label: 'Open console', to: `/app/services/${v.id}/console` } });
        if (v.resources.diskLimitMb && v.resources.diskUsedMb / v.resources.diskLimitMb > 0.85) w.push({ id: `wd_${v.id}`, severity: 'warn', title: `${v.name} is almost out of disk`, detail: 'Over 85% of the disk is used.', serviceId: v.id });
      }
      const od = s.invoices.filter((i) => i.state === 'overdue').length; if (od) w.push({ id: 'w_inv', severity: 'warn', title: `${od} overdue invoice${od > 1 ? 's' : ''}`, detail: 'Services with unpaid invoices are suspended after 7 days.', action: { label: 'Review invoices', to: '/app/billing/invoices' } });
      const exp = s.domains.filter((x) => x.state === 'expiring'); for (const x of exp) w.push({ id: `wx_${x.id}`, severity: 'warn', title: `${x.name} expires on ${x.expiresOn}`, detail: x.autoRenew ? 'Auto-renew is on.' : 'Auto-renew is off.', action: { label: 'Manage domain', to: `/app/domains/${x.name}` } });
      return w;
    }),
    serviceEvents: () => call('serviceEvents', () => s.events),
    listServices: () => call('listServices', () => s.services),
    getService: (id) => call('getService', () => find(s.services, id, 'Service')),
    power: async (id, action) => {
      await call('power', () => find(s.services, id, 'Service'));
      const v = find(s.services, id, 'Service');
      if (v.state === 'suspended' || v.state === 'installing') throw new ApiError(v.note ?? 'This service cannot be controlled right now.', 'SERVICE_NOT_ACTIVE', 403);
      v.state = action === 'start' ? 'starting' : action === 'restart' ? 'starting' : 'stopping'; bump();
      setTimeout(() => { v.state = action === 'stop' || action === 'kill' ? 'offline' : 'running'; if (v.state === 'offline') { v.resources.cpuPct = 0; v.resources.ramUsedMb = 0; } else { v.resources.cpuPct = v.resources.cpuPct || 12; v.resources.ramUsedMb = v.resources.ramUsedMb || Math.round(v.resources.ramLimitMb * 0.3); } bump(); }, 1400);
    },
    usage: (id, range) => call('usage', () => F.usageSeries(find(s.services, id, 'Service').id, range)),
    regions: () => call('regions', () => F.regions),
    plans: () => call('plans', () => F.plans),
    deploymentCatalog: () => call('deploymentCatalog', () => Object.entries(CATALOG).map(([id, item]) => ({ id, label: item.label, blurb: item.blurb, icon: item.icon, defaultMode: 'quick' as const, engines: item.engines, presets: item.presets.map(({ recommendedPlan: _recommendedPlan, ...preset }) => preset), addons: item.addons.map(({ price: _price, planned: _planned, ...addon }) => addon), fields: item.fields }))),
    quote: (spec) => call('quote', () => quoteFor(spec)),
    cart: () => call('cart', () => s.cart),
    addToCart: (item) => call('addToCart', () => { const c = { ...item, id: nid('cart') }; s.cart.push(c); bump(); return c; }),
    removeFromCart: (id) => call('removeFromCart', () => { s.cart = s.cart.filter((c) => c.id !== id); bump(); }),
    checkout: (input) => call('checkout', () => {
      if (!input.acceptedTerms) throw new ApiError('Accept the terms of service to continue.', 'TERMS_REQUIRED');
      return { orderId: 'ord_test', invoiceId: 'inv_test', checkoutUrl: '/app?checkout=test' };
    }),
    listOrders: () => call('listOrders', () => s.orders),
    listInvoices: () => call('listInvoices', () => s.invoices),
    getInvoice: (id) => call('getInvoice', () => find(s.invoices, id, 'Invoice')),
    payInvoice: (id, pm) => call('payInvoice', () => {
      const i = find(s.invoices, id, 'Invoice'); const m = find(s.methods, pm, 'Payment method');
      if (i.state !== 'open' && i.state !== 'overdue') throw new ApiError('This invoice cannot be paid.', 'INVOICE_NOT_PAYABLE');
      if (m.brand === 'mastercard' && m.last4 === '0087') throw new ApiError('The card was declined by the issuer. Nothing was charged.', 'CARD_DECLINED', 402);
      i.state = 'paid'; i.paidOn = '2026-10-20'; i.paymentMethodId = pm;
      for (const l of i.lines) { const v = s.services.find((x) => x.id === l.serviceId); if (v?.state === 'suspended') { v.state = 'offline'; v.note = undefined; } const sub = s.subs.find((x) => x.serviceId === l.serviceId); if (sub?.state === 'past-due') sub.state = 'active'; }
      bump(); return { ok: true as const, receipt: `RCPT-${i.number}` };
    }),
    listSubscriptions: () => call('listSubscriptions', () => s.subs),
    cancelSubscription: (id) => call('cancelSubscription', () => { const x = find(s.subs, id, 'Subscription'); x.state = 'cancel-scheduled'; x.endsOn = x.renewsOn; x.autoRenew = false; bump(); }),
    resumeSubscription: (id) => call('resumeSubscription', () => { const x = find(s.subs, id, 'Subscription'); x.state = 'active'; x.endsOn = undefined; x.autoRenew = true; bump(); }),
    changeCycle: (id, cycle) => call('changeCycle', () => { const x = find(s.subs, id, 'Subscription'); const p = F.plans.find((q) => q.name === x.planName); if (p) x.price = cycle === 'yearly' ? p.priceYearly : p.priceMonthly; x.cycle = cycle; bump(); }),
    listPaymentMethods: () => call('listPaymentMethods', () => s.methods),
    addPaymentMethod: (m) => call('addPaymentMethod', () => { const n = { ...m, id: nid('pm'), isDefault: s.methods.length === 0 }; s.methods.push(n); bump(); return n; }),
    removePaymentMethod: (id) => call('removePaymentMethod', () => {
      const m = find(s.methods, id, 'Payment method');
      if (s.subs.some((x) => x.paymentMethodId === id && x.state !== 'cancel-scheduled')) throw new ApiError('This method pays for active subscriptions. Move them to another method first.', 'IN_USE', 409);
      s.methods = s.methods.filter((x) => x !== m); if (m.isDefault && s.methods[0]) s.methods[0].isDefault = true; bump();
    }),
    setDefaultPaymentMethod: (id) => call('setDefaultPaymentMethod', () => { find(s.methods, id, 'Payment method'); s.methods.forEach((m) => { m.isDefault = m.id === id; }); bump(); }),
    billingProfile: () => call('billingProfile', () => s.profile),
    saveBillingProfile: (p) => call('saveBillingProfile', () => {
      if (p.vatId && !/^[A-Z]{2}\d{6,12}$/.test(p.vatId.replace(/\s/g, ''))) throw new ApiError('Enter the VAT ID with its country prefix, for example RO12345678.', 'VAT_INVALID');
      s.profile = { ...p, vatStatus: p.vatId ? (p.vatId === s.profile.vatId ? s.profile.vatStatus : 'pending') : 'none' }; bump(); return s.profile;
    }),
    listDomains: () => call('listDomains', () => s.domains),
    getDomain: (name) => call('getDomain', () => { const x = s.domains.find((d) => d.name === name); if (!x) throw new ApiError('Domain not found.', 'NOT_FOUND', 404); return x; }),
    searchDomains: (q) => call('searchDomains', (): DomainSearchResult[] => {
      const base = q.trim().toLowerCase().replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9-]/g, ''); if (!base) throw new ApiError('Enter a name to search.', 'EMPTY');
      const tlds: [string, number, number][] = [['.com', 1299, 1499], ['.net', 1399, 1599], ['.gg', 3499, 3999], ['.ro', 1099, 1199], ['.dev', 1599, 1599], ['.io', 4999, 4999]];
      return tlds.map(([tld, p, r]) => ({ name: base + tld, tld, available: !(s.domains.some((d) => d.name === base + tld) || (base.length < 4 && tld === '.com') || (tld === '.io' && base.length % 2 === 0)), premium: base.length <= 3, price: eur(p), renewPrice: eur(r) }));
    }),
    dnsRecords: (d) => call('dnsRecords', () => s.dns[d] ?? []),
    saveDnsRecord: (d, r) => call('saveDnsRecord', () => { const list = (s.dns[d] ??= []); if (r.id) { const i = list.findIndex((x) => x.id === r.id); if (i < 0) throw new ApiError('Record not found.', 'NOT_FOUND', 404); list[i] = { ...r, id: r.id, propagated: false }; } else list.push({ ...r, id: nid('r'), propagated: false }); bump(); }),
    deleteDnsRecord: (d, id) => call('deleteDnsRecord', () => { s.dns[d] = (s.dns[d] ?? []).filter((x) => x.id !== id); bump(); }),
    saveNameservers: (d, ns) => call('saveNameservers', () => { const x = s.domains.find((q) => q.name === d); if (!x) throw new ApiError('Domain not found.', 'NOT_FOUND', 404); if (ns.length < 2) throw new ApiError('Enter at least two nameservers.', 'NS_MIN'); x.nameservers = ns; bump(); }),
    setDomainAutoRenew: (d, on) => call('setDomainAutoRenew', () => { const x = s.domains.find((q) => q.name === d); if (!x) throw new ApiError('Domain not found.', 'NOT_FOUND', 404); x.autoRenew = on; bump(); }),
    listTickets: () => call('listTickets', () => s.tickets),
    getTicket: (id) => call('getTicket', () => { const t = find(s.tickets, id, 'Ticket'); t.unread = false; return t; }),
    createTicket: (n) => call('createTicket', () => {
      if (n.subject.trim().length < 5) throw new ApiError('Use at least 5 characters in the subject.', 'SUBJECT');
      if (n.body.trim().length < 10) throw new ApiError('Describe the problem in at least 10 characters.', 'BODY');
      const svc = s.services.find((v) => v.id === n.serviceId);
      const t: D.TicketRecord = { id: nid('tkt'), number: `TKT-${20419 + s.tickets.length}`, subject: n.subject.trim(), department: n.department, state: 'open', priority: n.priority, serviceId: n.serviceId, serviceName: svc?.name, createdAt: F.NOW, updatedAt: F.NOW, messages: [{ id: 'm1', author: s.account.fullName, fromStaff: false, at: F.NOW, body: n.body.trim(), attachments: n.files.map((f) => ({ name: f.name, size: f.size })) }] };
      s.tickets.unshift(t); bump(); return t;
    }),
    replyTicket: (id, body, files) => call('replyTicket', () => { const t = find(s.tickets, id, 'Ticket'); if (t.state === 'closed') throw new ApiError('This ticket is closed. Open a new one.', 'CLOSED', 409); t.messages.push({ id: nid('m'), author: s.account.fullName, fromStaff: false, at: F.NOW, body, attachments: files.map((f) => ({ name: f.name, size: f.size })) }); t.state = 'open'; t.updatedAt = F.NOW; bump(); }),
    closeTicket: (id) => call('closeTicket', () => { find(s.tickets, id, 'Ticket').state = 'closed'; bump(); }),
    profile: () => call('profile', () => s.account),
    saveProfile: (p) => call('saveProfile', () => { if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) throw new ApiError('Enter a valid email address.', 'EMAIL'); s.account = { ...s.account, ...p, emailVerified: p.email && p.email !== s.account.email ? false : s.account.emailVerified }; bump(); return s.account; }),
    changePassword: () => call('changePassword', () => undefined),
    beginMfaEnrollment: () => call('beginMfaEnrollment', () => ({ secret: 'TESTONLYSECRET', uri: 'otpauth://totp/Fortless:test?secret=TESTONLYSECRET&issuer=Fortless' })),
    confirmMfaEnrollment: () => call('confirmMfaEnrollment', () => ['test-code']),
    completeMfaStepUp: () => call('completeMfaStepUp', () => undefined),
    regenerateRecoveryCodes: () => call('regenerateRecoveryCodes', () => ['test-code']),
    sessions: () => call('sessions', () => s.sessions),
    revokeSession: (id) => call('revokeSession', () => { if (find(s.sessions, id, 'Session').current) throw new ApiError('Sign out from the account menu to end this session.', 'CURRENT'); s.sessions = s.sessions.filter((x) => x.id !== id); bump(); }),
    revokeOtherSessions: () => call('revokeOtherSessions', () => { s.sessions = s.sessions.filter((x) => x.current); bump(); }),
    passkeys: () => call('passkeys', () => s.passkeys),
    addPasskey: (name) => call('addPasskey', () => { const p = { id: nid('p'), name: name.trim() || 'Passkey', addedOn: '2026-10-20' }; s.passkeys.push(p); bump(); return p; }),
    removePasskey: (id) => call('removePasskey', () => { s.passkeys = s.passkeys.filter((p) => p.id !== id); bump(); }),
    apiKeys: () => call('apiKeys', () => s.keys),
    createApiKey: (name, scopes) => call('createApiKey', () => { if (!name.trim()) throw new ApiError('Name the key so you can recognise it later.', 'NAME'); const secret = `flk_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 18)}`; const key = { id: nid('k'), name: name.trim(), prefix: secret.slice(0, 13), createdOn: '2026-10-20', scopes }; s.keys.push(key); bump(); return { key, secret }; }),
    revokeApiKey: (id) => call('revokeApiKey', () => { s.keys = s.keys.filter((k) => k.id !== id); bump(); }),
    team: () => call('team', () => s.team),
    inviteMember: (email, role) => call('inviteMember', () => { if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('Enter a valid email address.', 'EMAIL'); if (s.team.some((m) => m.email === email)) throw new ApiError('This person is already on your team.', 'DUPLICATE', 409); s.team.push({ id: nid('t'), name: email, email, role, status: 'invited', permissions: [] }); bump(); }),
    removeMember: (id) => call('removeMember', () => { if (find(s.team, id, 'Member').role === 'owner') throw new ApiError('The owner cannot be removed.', 'OWNER', 409); s.team = s.team.filter((m) => m.id !== id); bump(); }),
    notificationPrefs: () => call('notificationPrefs', () => s.prefs),
    saveNotificationPrefs: (p) => call('saveNotificationPrefs', () => { s.prefs = p; bump(); }),
    activity: () => call('activity', () => s.activity),
    announcements: () => call('announcements', () => s.news),
    markAnnouncementRead: (id) => call('markAnnouncementRead', () => { find(s.news, id, 'Announcement').read = true; bump(); }),
    markAllAnnouncementsRead: () => call('markAllAnnouncementsRead', () => { for (const a of s.news) a.read = true; bump(); }),
    kb: () => call('kb', () => F.kb),
  };
  return Object.assign(api, { subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, version: () => ver, reset: () => { s = seed(); bump(); } });
}
