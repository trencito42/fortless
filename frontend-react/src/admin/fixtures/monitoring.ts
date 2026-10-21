import type { Incident, InfraNode, MaintenanceWindow, StatusComponent } from '../types';
import { DAY, HOUR, MIN, iso } from '../lib/format';

export function buildComponents(nodes: InfraNode[]): StatusComponent[] {
  const base: StatusComponent[] = [
    { id: 'cmp_web', name: 'Website', group: 'Platform', health: 'operational', public: true, uptime30d: 99.99, latencyMs: 142, description: 'Marketing site and sign-in pages.', checkedAt: iso(-30_000) },
    { id: 'cmp_panel', name: 'Customer panel', group: 'Platform', health: 'operational', public: true, uptime30d: 99.95, latencyMs: 188, description: 'Authenticated customer area.', checkedAt: iso(-30_000) },
    { id: 'cmp_api', name: 'Fortless API', group: 'Platform', health: 'operational', public: true, uptime30d: 99.97, latencyMs: 74, description: 'Internal and customer-facing API.', checkedAt: iso(-30_000) },
    { id: 'cmp_ptero', name: 'Game panel (Pterodactyl)', group: 'Provisioning', health: 'operational', public: true, uptime30d: 99.9, latencyMs: 230, description: 'Provider panel used for provisioning and consoles.', checkedAt: iso(-45_000) },
    { id: 'cmp_pay', name: 'Payments', group: 'Billing', health: 'operational', public: true, uptime30d: 99.98, latencyMs: 310, description: 'Checkout and card processing via Stripe.', checkedAt: iso(-60_000) },
    { id: 'cmp_email', name: 'Transactional email', group: 'Platform', health: 'degraded', public: true, uptime30d: 98.9, latencyMs: null, description: 'Receipts, verification and notifications. Relay is greylisting some deliveries.', checkedAt: iso(-60_000) },
    { id: 'cmp_dns', name: 'DNS', group: 'Network', health: 'operational', public: true, uptime30d: 100, latencyMs: 12, description: 'Authoritative nameservers.', checkedAt: iso(-30_000) },
  ];
  const nodeComps: StatusComponent[] = nodes.map((n) => ({
    id: `cmp_${n.id}`, name: `Game nodes · ${n.name}`, group: 'Game nodes', health: n.maintenance.enabled ? 'maintenance' : n.health === 'degraded' ? 'partial_outage' : n.health === 'offline' ? 'major_outage' : 'operational', public: true,
    uptime30d: n.health === 'degraded' ? 99.2 : 99.96, latencyMs: n.health === 'degraded' ? 61 : 9, description: `Hosting capacity in ${n.region.toUpperCase()}.`, checkedAt: iso(-20_000),
  }));
  return [...base, ...nodeComps];
}

export const incidents: Incident[] = [
  {
    id: 'inc_0006', title: 'Elevated packet loss on Frankfurt 02', severity: 'major', status: 'identified', componentIds: ['cmp_node-fra-02'], startedAt: iso(-2 * HOUR - 10 * MIN), resolvedAt: null, published: true,
    updates: [
      { id: 'iu_6_3', at: iso(-35 * MIN), status: 'identified', message: 'The cause is a saturated uplink on one rack switch. We are moving traffic to the redundant uplink.', author: 'Victor Lang' },
      { id: 'iu_6_2', at: iso(-80 * MIN), status: 'investigating', message: 'Some servers on Frankfurt 02 see 3–8% packet loss. Other Frankfurt nodes are unaffected.', author: 'Victor Lang' },
      { id: 'iu_6_1', at: iso(-2 * HOUR - 10 * MIN), status: 'investigating', message: 'We are investigating reports of lag on servers in Frankfurt.', author: 'Cătălin Rusu' },
    ],
    internalNotes: [{ id: 'in_6_1', author: 'Victor Lang', at: iso(-50 * MIN), body: 'Do not promise an ETA. Uplink swap needs DC hands; ticket DC-88231 with the facility.' }],
  },
  {
    id: 'inc_0005', title: 'Delayed transactional emails', severity: 'minor', status: 'monitoring', componentIds: ['cmp_email'], startedAt: iso(-5 * HOUR), resolvedAt: null, published: true,
    updates: [
      { id: 'iu_5_2', at: iso(-1 * HOUR), status: 'monitoring', message: 'Relay accepts mail again. We are watching the retry queue drain.', author: 'Daniel Voss' },
      { id: 'iu_5_1', at: iso(-5 * HOUR), status: 'investigating', message: 'Verification and receipt emails may arrive late.', author: 'Daniel Voss' },
    ],
    internalNotes: [],
  },
  { id: 'inc_0004', title: 'Checkout errors for Visa cards', severity: 'major', status: 'resolved', componentIds: ['cmp_pay'], startedAt: iso(-9 * DAY), resolvedAt: iso(-9 * DAY + 95 * MIN), published: true, updates: [{ id: 'iu_4_2', at: iso(-9 * DAY + 95 * MIN), status: 'resolved', message: 'Stripe resolved an issuer-side problem. Payments are succeeding again.', author: 'Ioana Marin' }, { id: 'iu_4_1', at: iso(-9 * DAY), status: 'investigating', message: 'Some Visa payments fail at checkout. Other methods work.', author: 'Ioana Marin' }], internalNotes: [] },
  { id: 'inc_0003', title: 'Amsterdam 01 maintenance overran', severity: 'minor', status: 'resolved', componentIds: ['cmp_node-ams-01'], startedAt: iso(-16 * DAY), resolvedAt: iso(-16 * DAY + 70 * MIN), published: true, updates: [{ id: 'iu_3_1', at: iso(-16 * DAY + 70 * MIN), status: 'resolved', message: 'Maintenance finished 70 minutes later than announced.', author: 'Victor Lang' }], internalNotes: [] },
  { id: 'inc_0002', title: 'Panel login failures', severity: 'critical', status: 'resolved', componentIds: ['cmp_panel', 'cmp_api'], startedAt: iso(-31 * DAY), resolvedAt: iso(-31 * DAY + 42 * MIN), published: true, updates: [{ id: 'iu_2_2', at: iso(-31 * DAY + 42 * MIN), status: 'resolved', message: 'A bad deploy was rolled back.', author: 'Maria Ilie' }, { id: 'iu_2_1', at: iso(-31 * DAY), status: 'investigating', message: 'Sign-in is failing for many users.', author: 'Maria Ilie' }], internalNotes: [{ id: 'in_2_1', author: 'Maria Ilie', at: iso(-30 * DAY), body: 'Post-mortem in wiki. Root cause: session table migration without lock timeout.' }] },
  { id: 'inc_0001', title: 'Helsinki network blip', severity: 'minor', status: 'resolved', componentIds: ['cmp_node-hel-01'], startedAt: iso(-52 * DAY), resolvedAt: iso(-52 * DAY + 14 * MIN), published: false, updates: [{ id: 'iu_1_1', at: iso(-52 * DAY + 14 * MIN), status: 'resolved', message: 'Short upstream flap; no customer impact reports.', author: 'Victor Lang' }], internalNotes: [] },
];

export const maintenance: MaintenanceWindow[] = [
  { id: 'mnt_0004', title: 'Helsinki 01 kernel and Wings upgrade', componentIds: ['cmp_node-hel-01'], startsAt: iso(-3 * HOUR), endsAt: iso(5 * HOUR), status: 'in_progress', publicMessage: 'Servers on Helsinki 01 are restarted once during this window. Expect roughly 5 minutes of downtime each.', nodeId: 'node-hel-01' },
  { id: 'mnt_0003', title: 'Frankfurt 01 disk replacement', componentIds: ['cmp_node-fra-01'], startsAt: iso(3 * DAY), endsAt: iso(3 * DAY + 2 * HOUR), status: 'scheduled', publicMessage: 'Rolling restart of services on Frankfurt 01. Backups run beforehand.', nodeId: 'node-fra-01' },
  { id: 'mnt_0002', title: 'Billing database upgrade', componentIds: ['cmp_pay', 'cmp_panel'], startsAt: iso(9 * DAY), endsAt: iso(9 * DAY + 45 * MIN), status: 'scheduled', publicMessage: 'Checkout and the billing pages are read-only for up to 45 minutes. Running servers are not affected.', nodeId: null },
  { id: 'mnt_0001', title: 'Amsterdam 01 rack move', componentIds: ['cmp_node-ams-01'], startsAt: iso(-16 * DAY), endsAt: iso(-16 * DAY + 4 * HOUR), status: 'completed', publicMessage: 'Planned rack move.', nodeId: 'node-ams-01' },
];
