import type * as D from '../domain/types';

/** All fixture data for the prototype. Invented. Replace by implementing `CustomerApi` against the real backend (src/app/data/api.ts). */
export const NOW = '2026-10-20T09:30:00Z';
const eur = (cents: number): D.Money => ({ amount: cents, currency: 'EUR' });
const d = (s: string) => `2026-${s}`;

export const regions: D.Region[] = [
  { id: 'fra', name: 'Frankfurt', country: 'DE', available: true },
  { id: 'ams', name: 'Amsterdam', country: 'NL', available: true },
  { id: 'buc', name: 'Bucharest', country: 'RO', available: true },
  { id: 'par', name: 'Paris', country: 'FR', available: true },
  { id: 'hel', name: 'Helsinki', country: 'FI', available: false },
];

export const plans: D.Plan[] = [
  { id: 'spark', name: 'Spark', workloads: ['minecraft', 'cs16', 'discord-bot', 'nodejs', 'python'], ramMb: 1024, cpuPct: 100, diskMb: 5120, slots: 10, bandwidthGb: 250, priceMonthly: eur(300), priceYearly: eur(3000), features: ['1 GB RAM', '1 vCPU', '5 GB NVMe', 'DDoS protection', 'Daily backups (2)'] },
  { id: 'flame', name: 'Flame', workloads: ['minecraft', 'cs16', 'cs2', 'discord-bot', 'nodejs', 'python', 'database'], ramMb: 4096, cpuPct: 200, diskMb: 20480, slots: 40, bandwidthGb: 1000, priceMonthly: eur(900), priceYearly: eur(9000), highlight: true, features: ['4 GB RAM', '2 vCPU', '20 GB NVMe', 'DDoS protection', 'Backups (5)', 'Free subdomain', 'Priority support'] },
  { id: 'blaze', name: 'Blaze', workloads: ['minecraft', 'cs16', 'cs2', 'discord-bot', 'nodejs', 'python', 'database'], ramMb: 8192, cpuPct: 400, diskMb: 51200, slots: 100, bandwidthGb: 3000, priceMonthly: eur(1800), priceYearly: eur(18000), features: ['8 GB RAM', '4 vCPU', '50 GB NVMe', 'DDoS protection', 'Backups (10)', 'Dedicated IP', 'Priority support'], soldOutIn: ['par'] },
  { id: 'inferno', name: 'Inferno', workloads: ['minecraft', 'cs2', 'nodejs', 'python', 'database'], ramMb: 16384, cpuPct: 800, diskMb: 102400, slots: 250, bandwidthGb: 8000, priceMonthly: eur(3600), priceYearly: eur(36000), features: ['16 GB RAM', '8 vCPU', '100 GB NVMe', 'DDoS protection', 'Backups (20)', 'Dedicated IP', 'Priority support'], soldOutIn: ['ams', 'par'] },
];

const res = (cpu: number, ram: number, ramL: number, disk: number, diskL: number) => ({ cpuPct: cpu, ramUsedMb: ram, ramLimitMb: ramL, diskUsedMb: disk, diskLimitMb: diskL });

type FixtureService = Omit<D.ServiceRow, 'lifecycle' | 'state'> & { state: D.ServiceState | 'suspended' };
const fixtureServices: FixtureService[] = [
  { id: 'svc_survival', name: 'Survival EU', workload: 'minecraft', engine: 'Paper 1.21.8', state: 'running', provider: 'PTERODACTYL', regionId: 'fra', regionName: 'Frankfurt', planId: 'flame', planName: 'Flame', address: 'survival.fortless.gg:25565', players: { online: 14, max: 40 }, resources: res(62, 2860, 4096, 6120, 20480), price: eur(900), renewsOn: d('11-02'), createdAt: d('02-14'), tags: ['production'] },
  { id: 'svc_creative', name: 'Creative Build', workload: 'minecraft', engine: 'Fabric 0.16 / 1.21.8', state: 'offline', provider: 'PTERODACTYL', regionId: 'ams', regionName: 'Amsterdam', planId: 'spark', planName: 'Spark', address: 'creative.fortless.gg:25566', players: { online: 0, max: 10 }, resources: res(0, 0, 1024, 3010, 5120), price: eur(300), renewsOn: d('10-29'), createdAt: d('05-03') },
  { id: 'svc_cs16', name: 'CS 1.6 Classic', workload: 'cs16', engine: 'ReHLDS 3.14', state: 'running', provider: 'PTERODACTYL', regionId: 'buc', regionName: 'Bucharest', planId: 'spark', planName: 'Spark', address: '185.12.4.20:27015', players: { online: 18, max: 24 }, resources: res(35, 420, 1024, 1400, 5120), price: eur(300), renewsOn: d('11-08'), createdAt: d('03-21'), tags: ['public'] },
  { id: 'svc_cs2', name: 'CS2 Wingman', workload: 'cs2', engine: 'CS2 dedicated', state: 'installing', provider: 'PTERODACTYL', regionId: 'fra', regionName: 'Frankfurt', planId: 'blaze', planName: 'Blaze', resources: res(0, 0, 8192, 0, 51200), price: eur(1800), createdAt: d('10-20'), note: 'Installing. Controls unlock when it finishes.' },
  { id: 'svc_bot', name: 'Modbot', workload: 'discord-bot', engine: 'Node.js 22', state: 'running', provider: 'PTERODACTYL', regionId: 'fra', regionName: 'Frankfurt', planId: 'spark', planName: 'Spark', resources: res(4, 210, 1024, 380, 5120), price: eur(300), renewsOn: d('11-14'), createdAt: d('06-30') },
  { id: 'svc_api', name: 'Storefront API', workload: 'nodejs', engine: 'Node.js 22 / pnpm', state: 'error', provider: 'PTERODACTYL', regionId: 'ams', regionName: 'Amsterdam', planId: 'flame', planName: 'Flame', address: 'api.shop.example:3000', resources: res(0, 0, 4096, 1120, 20480), price: eur(900), renewsOn: d('11-19'), createdAt: d('07-12'), note: 'Crashed 12 minutes ago: exit code 1.' },
  { id: 'svc_scraper', name: 'Price Scraper', workload: 'python', engine: 'Python 3.13', state: 'suspended', provider: 'PTERODACTYL', regionId: 'fra', regionName: 'Frankfurt', planId: 'spark', planName: 'Spark', resources: res(0, 0, 1024, 900, 5120), price: eur(300), createdAt: d('08-04'), note: 'Suspended: invoice INV-2026-0141 is overdue.' },
  { id: 'svc_vps', name: 'Build VPS', workload: 'nodejs', engine: 'Ubuntu 24.04', state: 'running', provider: 'PROXMOX', regionId: 'buc', regionName: 'Bucharest', planId: 'blaze', planName: 'Blaze', resources: res(18, 1900, 8192, 14000, 51200), price: eur(1800), renewsOn: d('12-01'), createdAt: d('01-09'), tags: ['vm'] },
];
export const services: D.ServiceRow[] = fixtureServices.map((service) => ({
  ...service,
  lifecycle: service.state === 'suspended' ? 'suspended' : 'active',
  state: service.state === 'suspended' ? 'offline' : service.state,
}));

const line = (id: string, description: string, cents: number, serviceId?: string): D.InvoiceLineItem => ({ id, description, serviceId, amount: eur(cents) });
const inv = (n: string, state: D.InvoiceState, issued: string, due: string | undefined, paid: string | undefined, lines: D.InvoiceLineItem[]): D.InvoiceRecord => {
  const sub = lines.reduce((a, l) => a + l.amount.amount, 0); const tax = Math.round(sub * 0.19);
  return { id: `inv_${n}`, number: `INV-2026-${n}`, state, issuedOn: issued, dueOn: due, paidOn: paid, lines, subtotal: eur(sub), tax: eur(tax), taxLabel: 'VAT 19%', total: eur(sub + tax), paymentMethodId: paid ? 'pm_visa' : undefined };
};
export const invoices: D.InvoiceRecord[] = [
  inv('0158', 'open', d('10-18'), d('10-25'), undefined, [line('l1', 'Flame: Survival EU (Nov 2 to Dec 2)', 900, 'svc_survival'), line('l2', 'Spark: Modbot (Nov 14 to Dec 14)', 300, 'svc_bot')]),
  inv('0141', 'overdue', d('09-29'), d('10-06'), undefined, [line('l1', 'Spark: Price Scraper (Oct 6 to Nov 6)', 300, 'svc_scraper')]),
  inv('0136', 'paid', d('09-18'), d('09-25'), d('09-19'), [line('l1', 'Flame: Storefront API', 900, 'svc_api'), line('l2', 'Domain renewal: shop.example', 1299)]),
  inv('0121', 'paid', d('09-02'), d('09-09'), d('09-03'), [line('l1', 'Flame: Survival EU', 900, 'svc_survival')]),
  inv('0104', 'paid', d('08-14'), d('08-21'), d('08-14'), [line('l1', 'Spark: Modbot', 300, 'svc_bot'), line('l2', 'Spark: CS 1.6 Classic', 300, 'svc_cs16')]),
  inv('0098', 'refunded', d('08-04'), d('08-11'), d('08-05'), [line('l1', 'Spark: Price Scraper (setup)', 300, 'svc_scraper')]),
  inv('0077', 'paid', d('07-12'), d('07-19'), d('07-12'), [line('l1', 'Flame: Storefront API (setup)', 900, 'svc_api')]),
  inv('0052', 'void', d('06-30'), d('07-07'), undefined, [line('l1', 'Spark: Modbot (duplicate order)', 300, 'svc_bot')]),
];

export const subscriptions: D.SubscriptionRecord[] = [
  { id: 'sub_survival', serviceId: 'svc_survival', serviceName: 'Survival EU', planName: 'Flame', cycle: 'monthly', price: eur(900), state: 'active', renewsOn: d('11-02'), paymentMethodId: 'pm_visa', autoRenew: true },
  { id: 'sub_creative', serviceId: 'svc_creative', serviceName: 'Creative Build', planName: 'Spark', cycle: 'monthly', price: eur(300), state: 'cancel-scheduled', endsOn: d('10-29'), paymentMethodId: 'pm_visa', autoRenew: false },
  { id: 'sub_cs16', serviceId: 'svc_cs16', serviceName: 'CS 1.6 Classic', planName: 'Spark', cycle: 'yearly', price: eur(3000), state: 'active', renewsOn: d('11-08'), paymentMethodId: 'pm_visa', autoRenew: true },
  { id: 'sub_bot', serviceId: 'svc_bot', serviceName: 'Modbot', planName: 'Spark', cycle: 'monthly', price: eur(300), state: 'active', renewsOn: d('11-14'), paymentMethodId: 'pm_visa', autoRenew: true },
  { id: 'sub_api', serviceId: 'svc_api', serviceName: 'Storefront API', planName: 'Flame', cycle: 'monthly', price: eur(900), state: 'active', renewsOn: d('11-19'), paymentMethodId: 'pm_sepa', autoRenew: true },
  { id: 'sub_scraper', serviceId: 'svc_scraper', serviceName: 'Price Scraper', planName: 'Spark', cycle: 'monthly', price: eur(300), state: 'past-due', renewsOn: d('10-06'), paymentMethodId: 'pm_visa', autoRenew: true },
  { id: 'sub_vps', serviceId: 'svc_vps', serviceName: 'Build VPS', planName: 'Blaze', cycle: 'yearly', price: eur(18000), state: 'active', renewsOn: d('12-01'), paymentMethodId: 'pm_sepa', autoRenew: true },
];

export const paymentMethods: D.PaymentMethodRecord[] = [
  { id: 'pm_visa', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028, holder: 'Alex Morgan', isDefault: true },
  { id: 'pm_sepa', brand: 'sepa', last4: '3057', holder: 'Alex Morgan', isDefault: false },
  { id: 'pm_mc', brand: 'mastercard', last4: '0087', expMonth: 10, expYear: 2026, holder: 'Alex Morgan', isDefault: false },
];

export const billingProfile: D.BillingProfile = { company: 'Morgan Digital SRL', fullName: 'Alex Morgan', email: 'alex@morgan.example', addressLine1: 'Strada Lipscani 12', addressLine2: 'Et. 3', city: 'Bucharest', postalCode: '030031', country: 'RO', vatId: 'RO12345678', vatStatus: 'valid', currency: 'EUR' };

export const orders: D.OrderRecord[] = [
  { id: 'ord_cs2', number: 'ORD-2026-0412', placedOn: d('10-20'), state: 'provisioning', items: [{ title: 'Blaze: CS2 Wingman', detail: 'Frankfurt, monthly' }], total: eur(2142), invoiceId: 'inv_0158' },
  { id: 'ord_dom', number: 'ORD-2026-0391', placedOn: d('09-18'), state: 'active', items: [{ title: 'Domain renewal', detail: 'shop.example, 1 year' }], total: eur(1546), invoiceId: 'inv_0136' },
  { id: 'ord_bad', number: 'ORD-2026-0377', placedOn: d('09-02'), state: 'failed', items: [{ title: 'Inferno: Staging DB', detail: 'Amsterdam, monthly' }], total: eur(4284), failure: 'The card was declined by the issuer. No service was created and nothing was charged.' },
  { id: 'ord_old', number: 'ORD-2026-0301', placedOn: d('08-04'), state: 'cancelled', items: [{ title: 'Spark: Price Scraper', detail: 'Frankfurt, monthly' }], total: eur(357) },
];

export const domains: D.DomainRecord[] = [
  { id: 'dom_shop', name: 'shop.example', state: 'expiring', registeredOn: '2023-11-12', expiresOn: d('11-12'), autoRenew: false, privacy: true, nameservers: ['ns1.fortless.dev', 'ns2.fortless.dev'], renewPrice: eur(1299), locked: true, serviceIds: ['svc_api'] },
  { id: 'dom_gg', name: 'fortless-demo.gg', state: 'active', registeredOn: '2025-03-02', expiresOn: '2027-03-02', autoRenew: true, privacy: true, nameservers: ['ns1.fortless.dev', 'ns2.fortless.dev'], renewPrice: eur(3499), locked: true, serviceIds: ['svc_survival', 'svc_cs16'] },
  { id: 'dom_ro', name: 'morgan-digital.ro', state: 'active', registeredOn: '2024-06-18', expiresOn: '2027-06-18', autoRenew: true, privacy: false, nameservers: ['ns1.fortless.dev', 'ns2.fortless.dev'], renewPrice: eur(1099), locked: false },
  { id: 'dom_tr', name: 'moved-in.net', state: 'pending-transfer', registeredOn: '2026-10-19', expiresOn: '2027-10-19', autoRenew: true, privacy: true, nameservers: ['ns1.old-registrar.example', 'ns2.old-registrar.example'], renewPrice: eur(1299), locked: true },
];

export const dnsRecords: Record<string, { id: string; type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV'; name: string; value: string; ttl: number; propagated?: boolean }[]> = {
  'shop.example': [
    { id: 'r1', type: 'A', name: '@', value: '203.0.113.10', ttl: 3600, propagated: true },
    { id: 'r2', type: 'CNAME', name: 'www', value: 'shop.example', ttl: 3600, propagated: true },
    { id: 'r3', type: 'A', name: 'api', value: '203.0.113.44', ttl: 300, propagated: true },
    { id: 'r4', type: 'MX', name: '@', value: 'mail.shop.example', ttl: 3600, propagated: true },
    { id: 'r5', type: 'TXT', name: '@', value: 'v=spf1 include:_spf.shop.example ~all', ttl: 3600, propagated: false },
  ],
  'fortless-demo.gg': [
    { id: 'r1', type: 'A', name: '@', value: '185.12.4.20', ttl: 3600, propagated: true },
    { id: 'r2', type: 'SRV', name: '_minecraft._tcp', value: '0 5 25565 survival.fortless-demo.gg', ttl: 3600, propagated: true },
    { id: 'r3', type: 'A', name: 'survival', value: '203.0.113.77', ttl: 600, propagated: true },
  ],
  'morgan-digital.ro': [{ id: 'r1', type: 'A', name: '@', value: '198.51.100.8', ttl: 3600, propagated: true }],
};

const msg = (id: string, author: string, fromStaff: boolean, at: string, body: string, attachments?: { name: string; size: number }[]): D.TicketMessageRecord => ({ id, author, fromStaff, at, body, attachments });
export const tickets: D.TicketRecord[] = [
  { id: 'tkt_1', number: 'TKT-20418', subject: 'Storefront API crashes right after start', department: 'Technical', state: 'answered', priority: 'high', serviceId: 'svc_api', serviceName: 'Storefront API', createdAt: '2026-10-19T18:02:00Z', updatedAt: '2026-10-20T08:44:00Z', unread: true, messages: [
    msg('m1', 'Alex Morgan', false, '2026-10-19T18:02:00Z', 'The service exits with code 1 about 5 seconds after start. It worked until this morning. Nothing changed in the repository.'),
    msg('m2', 'Dana (Fortless Support)', true, '2026-10-20T08:44:00Z', 'Thanks for the report. The last boot log shows ERR_MODULE_NOT_FOUND for "pg-native". Your lockfile changed on the last deploy, which removed that optional dependency. Reinstall dependencies from the Startup tab or pin the version, then restart. Tell us if it still fails.', [{ name: 'boot-log.txt', size: 4210 }]),
  ] },
  { id: 'tkt_2', number: 'TKT-20377', subject: 'Move Creative Build to Frankfurt', department: 'Sales', state: 'awaiting-customer', priority: 'normal', serviceId: 'svc_creative', serviceName: 'Creative Build', createdAt: '2026-10-15T10:12:00Z', updatedAt: '2026-10-16T09:00:00Z', messages: [
    msg('m1', 'Alex Morgan', false, '2026-10-15T10:12:00Z', 'Can you migrate this server to Frankfurt? Latency from Amsterdam is higher than I expected for my players.'),
    msg('m2', 'Mihai (Fortless Support)', true, '2026-10-16T09:00:00Z', 'Yes. A migration takes about 20 minutes of downtime. Which time window suits you best? We recommend a weekday morning, European time.'),
  ] },
  { id: 'tkt_3', number: 'TKT-20290', subject: 'Invoice INV-2026-0098 refund confirmation', department: 'Billing', state: 'closed', priority: 'low', createdAt: '2026-08-07T12:00:00Z', updatedAt: '2026-08-08T10:30:00Z', messages: [
    msg('m1', 'Alex Morgan', false, '2026-08-07T12:00:00Z', 'Please confirm that the refund for invoice 0098 was issued to my card.'),
    msg('m2', 'Ioana (Fortless Support)', true, '2026-08-08T10:30:00Z', 'Confirmed. EUR 3.57 was refunded to the Visa ending 4242. It appears within 5 business days.'),
  ] },
  { id: 'tkt_4', number: 'TKT-20233', subject: 'Plugin recommendation for anti-cheat on CS 1.6', department: 'General', state: 'open', priority: 'low', serviceId: 'svc_cs16', serviceName: 'CS 1.6 Classic', createdAt: '2026-10-10T15:40:00Z', updatedAt: '2026-10-10T15:40:00Z', messages: [msg('m1', 'Alex Morgan', false, '2026-10-10T15:40:00Z', 'Which anti-cheat setup do you support on ReHLDS? I want to know what the one-click installer offers.')] },
];

export const announcements: D.Announcement[] = [
  { id: 'an1', kind: 'maintenance', title: 'Frankfurt node fra-03 maintenance', body: 'We upgrade the hypervisor on fra-03 on Oct 27 between 02:00 and 03:30 UTC. Services on this node restart once. Estimated downtime: 5 minutes per service.', at: '2026-10-20T07:00:00Z', affects: ['svc_survival', 'svc_cs2', 'svc_bot', 'svc_scraper'], read: false },
  { id: 'an2', kind: 'incident', title: 'Elevated packet loss in Amsterdam', body: 'A transit provider is dropping a share of packets for some Amsterdam routes. We rerouted traffic and are watching it.', at: '2026-10-19T21:10:00Z', affects: ['svc_creative', 'svc_api'], read: false },
  { id: 'an3', kind: 'news', title: 'Paper 1.21.8 available in one click', body: 'Switch versions from Startup. A backup is taken first when you enable it.', at: '2026-10-12T09:00:00Z', read: true },
  { id: 'an4', kind: 'resolved', title: 'Resolved: Panel login delays', body: 'Sign-ins took up to 30 seconds between 14:00 and 15:20 UTC. The cause was a database failover and it is fixed.', at: '2026-10-08T15:30:00Z', read: true },
];

export const kb: D.KbArticle[] = [
  { id: 'kb1', category: 'Minecraft', title: 'Install plugins and mods on your server', summary: 'Use the extension catalog or upload a jar by hand.', body: ['Open your server, go to Game, then Plugins and mods.', 'Search the catalog, pick a version that matches your engine and press Install. Fortless restarts nothing for you: restart when it suits you.', 'To upload by hand, use Files and drop the jar into the plugins folder.'], updatedOn: '2026-09-30', tags: ['plugins', 'mods', 'paper', 'fabric'], popular: true },
  { id: 'kb2', category: 'Minecraft', title: 'Choose between Paper, Purpur, Fabric and Forge', summary: 'What each engine is good at.', body: ['Paper and Purpur run Bukkit plugins and are the best choice for public survival servers.', 'Fabric is light and fast for mods. Forge and NeoForge have the largest mod catalogs.', 'You can change engine later from Startup. Take a backup first.'], updatedOn: '2026-08-21', tags: ['engines'], popular: true },
  { id: 'kb3', category: 'Counter-Strike', title: 'Set up AMX Mod X on ReHLDS', summary: 'Install and enable admin plugins on CS 1.6.', body: ['Enable AMX Mod X in Game, then Addons.', 'Add admins in addons/amxmodx/configs/users.ini from the Files tab.', 'Restart the server to load the new plugins.'], updatedOn: '2026-07-14', tags: ['cs16', 'amxx'] },
  { id: 'kb4', category: 'Apps and bots', title: 'Deploy a Discord bot from GitHub', summary: 'Connect a repository, set the token, start.', body: ['Pick Discord bot in Deploy, choose Node.js or Python and paste your repository URL.', 'Store the bot token as an environment variable. Fortless hides it after saving.', 'Use the Console tab to follow logs.'], updatedOn: '2026-09-02', tags: ['discord', 'github'], popular: true },
  { id: 'kb5', category: 'Billing', title: 'How renewals and proration work', summary: 'When you are charged and what happens if a payment fails.', body: ['Invoices are issued 7 days before renewal. We retry a failed card twice, 3 days apart.', 'If an invoice stays unpaid 7 days past due, the service is suspended. Pay the invoice and it resumes within minutes. Data is kept for 14 days after suspension.'], updatedOn: '2026-09-18', tags: ['renewal', 'invoice'] },
  { id: 'kb6', category: 'Domains', title: 'Point a domain to your server', summary: 'A, SRV and CNAME records for game and web servers.', body: ['Open Domains, choose the domain and add an A record to your server address.', 'For Minecraft on a custom port add an SRV record: _minecraft._tcp.', 'DNS changes can take up to an hour to be visible everywhere.'], updatedOn: '2026-06-11', tags: ['dns', 'srv'] },
  { id: 'kb7', category: 'Account', title: 'Turn on two-factor authentication', summary: 'Authenticator apps and passkeys.', body: ['Open Account, then Security, and press Set up authenticator.', 'Scan the code, enter the 6 digit code, and save your recovery codes somewhere safe.'], updatedOn: '2026-05-03', tags: ['2fa', 'passkey'] },
];

export const activity: D.ActivityRecord[] = [
  { id: 'a1', at: '2026-10-20T08:51:00Z', actor: 'You', actorKind: 'you', action: 'Restarted server', target: 'Survival EU', ip: '86.120.4.9', outcome: 'success' },
  { id: 'a2', at: '2026-10-20T07:12:00Z', actor: 'Jules Park', actorKind: 'teammate', action: 'Created backup', target: 'Survival EU', ip: '84.17.2.3', outcome: 'success' },
  { id: 'a3', at: '2026-10-19T22:40:00Z', actor: 'You', actorKind: 'you', action: 'Signed in', ip: '86.120.4.9', outcome: 'success' },
  { id: 'a4', at: '2026-10-19T22:38:00Z', actor: 'Unknown', actorKind: 'system', action: 'Failed sign-in', ip: '185.220.101.4', outcome: 'failed' },
  { id: 'a5', at: '2026-10-19T17:55:00Z', actor: 'You', actorKind: 'you', action: 'Opened ticket', target: 'TKT-20418', outcome: 'success' },
  { id: 'a6', at: '2026-10-18T10:02:00Z', actor: 'System', actorKind: 'system', action: 'Issued invoice', target: 'INV-2026-0158', outcome: 'success' },
  { id: 'a7', at: '2026-10-17T13:20:00Z', actor: 'You', actorKind: 'you', action: 'Added passkey', target: 'Windows Hello', outcome: 'success' },
  { id: 'a8', at: '2026-10-16T09:31:00Z', actor: 'Jules Park', actorKind: 'teammate', action: 'Deleted file', target: '/plugins/old.jar', outcome: 'success' },
];

export const serviceEvents: D.ServiceEvent[] = [
  { id: 'e1', at: '2026-10-20T09:18:00Z', serviceId: 'svc_api', serviceName: 'Storefront API', severity: 'error', text: 'Process exited with code 1 after 5 seconds.' },
  { id: 'e2', at: '2026-10-20T08:51:00Z', serviceId: 'svc_survival', serviceName: 'Survival EU', severity: 'info', text: 'Restarted by you. Online in 24 seconds.' },
  { id: 'e3', at: '2026-10-20T08:02:00Z', serviceId: 'svc_cs2', serviceName: 'CS2 Wingman', severity: 'info', text: 'Install started on node fra-03.' },
  { id: 'e4', at: '2026-10-19T21:30:00Z', serviceId: 'svc_creative', serviceName: 'Creative Build', severity: 'warn', text: 'Stopped by the idle timer after 6 hours without players.' },
  { id: 'e5', at: '2026-10-19T04:00:00Z', serviceId: 'svc_survival', serviceName: 'Survival EU', severity: 'info', text: 'Scheduled backup completed (1.4 GB).' },
];

export const apiKeys: D.ApiKeyRecord[] = [
  { id: 'k1', name: 'CI deploy', prefix: 'flk_live_4f9a', createdOn: '2026-08-02', lastUsed: '2026-10-20', scopes: ['services:read', 'services:power'] },
  { id: 'k2', name: 'Grafana read-only', prefix: 'flk_live_b27c', createdOn: '2026-09-11', lastUsed: '2026-10-19', scopes: ['services:read', 'usage:read'] },
];
export const team: D.TeamMemberRecord[] = [
  { id: 't1', name: 'Alex Morgan', email: 'alex@morgan.example', role: 'owner', status: 'active', lastActive: 'now', permissions: ['*'] },
  { id: 't2', name: 'Jules Park', email: 'jules@morgan.example', role: 'developer', status: 'active', lastActive: '2 hours ago', permissions: ['service.read', 'service.control', 'files.write', 'backups.create'] },
  { id: 't3', name: 'Riley Chen', email: 'riley@morgan.example', role: 'billing', status: 'active', lastActive: 'yesterday', permissions: ['billing.read', 'billing.pay'] },
  { id: 't4', name: 'sam@morgan.example', email: 'sam@morgan.example', role: 'viewer', status: 'invited', permissions: ['service.read'] },
];
export const sessions: D.SessionRecord[] = [
  { id: 's1', device: 'Chrome on Windows', location: 'Bucharest, RO', lastActive: 'Now', current: true },
  { id: 's2', device: 'Safari on iPhone', location: 'Bucharest, RO', lastActive: '2 hours ago', current: false },
  { id: 's3', device: 'Firefox on Linux', location: 'Frankfurt, DE', lastActive: '6 days ago', current: false },
];
export const passkeys: D.PasskeyRecord[] = [{ id: 'p1', name: 'Windows Hello', addedOn: '2026-10-17', lastUsed: 'today' }, { id: 'p2', name: 'iPhone', addedOn: '2026-09-04', lastUsed: '2 days ago' }];
export const profile: D.Profile = { fullName: 'Alex Morgan', email: 'alex@morgan.example', emailVerified: true, phone: '+40 721 000 000', language: 'English', timezone: 'Europe/Bucharest', avatarInitials: 'AM', mfaEnabled: true, recoveryCodesLeft: 8 };
export const notificationTopics = [
  { id: 'service-state', label: 'Server crashes and restarts', hint: 'When a server stops unexpectedly or recovers.' },
  { id: 'billing', label: 'Invoices and payment failures', hint: 'New invoices, receipts, failed payments.' },
  { id: 'renewals', label: 'Renewal reminders', hint: '7 days and 1 day before a renewal.' },
  { id: 'support', label: 'Support replies', hint: 'Replies to your tickets.' },
  { id: 'announcements', label: 'Maintenance and incidents', hint: 'Planned work and outages that affect your services.' },
  { id: 'security', label: 'Security alerts', hint: 'New sign-ins, passkey and API key changes. Always on for email.' },
] as const;
export const notificationPrefs: D.NotificationPrefs = {
  channels: { email: true, discord: false, push: true },
  topics: { 'service-state': { email: true, discord: false, push: true }, billing: { email: true, discord: false, push: false }, renewals: { email: true, discord: false, push: false }, support: { email: true, discord: false, push: true }, announcements: { email: true, discord: false, push: false }, security: { email: true, discord: false, push: true } },
};

/** Deterministic usage history so charts look the same on every load. */
export function usageSeries(serviceId: string, range: D.UsageSeries['range']): D.UsageSeries {
  const n = range === '1h' ? 60 : range === '24h' ? 96 : range === '7d' ? 168 : 120; const step = { '1h': 60, '24h': 900, '7d': 3600, '30d': 21600 }[range] * 1000;
  const svc = services.find((s) => s.id === serviceId); const seed = [...serviceId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const end = Date.parse(NOW);
  const points = Array.from({ length: n }, (_, i) => {
    const t = end - (n - 1 - i) * step; const w = Math.sin((i + seed) / 7) * 0.5 + Math.sin((i + seed) / 3.1) * 0.25 + 0.75;
    const on = svc && svc.state !== 'offline' && svc.lifecycle !== 'suspended';
    return { t, cpu: on ? Math.round(Math.max(1, (svc!.resources.cpuPct || 20) * w)) : 0, ramMb: on ? Math.round((svc!.resources.ramUsedMb || 300) * (0.8 + w * 0.2)) : 0, netInMbps: on ? +(w * 2.4).toFixed(2) : 0, netOutMbps: on ? +(w * 5.1).toFixed(2) : 0, diskMb: svc?.resources.diskUsedMb ?? 0 };
  });
  return { serviceId, range, points, bandwidth: { usedGb: Math.round(seed % 380) + 40, limitGb: plans.find((p) => p.id === svc?.planId)?.bandwidthGb ?? 250 } };
}
