import type { Customer, Department, Macro, Service, StaffMember, Ticket, TicketMessage, TicketPriority, TicketStatus } from '../types';
import { ADMIN_NOW, DAY, HOUR, MIN, iso } from '../lib/format';
import { makeRng, pad } from './rng';

export const departments: Department[] = [
  { id: 'dep_tech', name: 'Technical support', email: 'support@fortless.example', description: 'Server errors, installs, performance, migrations.', members: ['stf_04', 'stf_05', 'stf_06'], autoAssign: true, slaFirstResponseMin: 60, active: true },
  { id: 'dep_billing', name: 'Billing', email: 'billing@fortless.example', description: 'Invoices, payments, refunds, tax questions.', members: ['stf_03', 'stf_04'], autoAssign: false, slaFirstResponseMin: 240, active: true },
  { id: 'dep_abuse', name: 'Abuse & security', email: 'abuse@fortless.example', description: 'DDoS reports, abuse complaints, account security.', members: ['stf_02', 'stf_06'], autoAssign: false, slaFirstResponseMin: 30, active: true },
  { id: 'dep_sales', name: 'Sales', email: 'sales@fortless.example', description: 'Pre-sales questions and custom quotes.', members: ['stf_02'], autoAssign: false, slaFirstResponseMin: 480, active: false },
];

export const macros: Macro[] = [
  { id: 'mac_1', title: 'Server restart steps', departmentId: 'dep_tech', body: 'Hi {{customer.name}},\n\nPlease stop the server from the Power menu, wait until it shows Offline, then start it again. If it stops again within a few minutes, send us the last 50 lines of the console.\n\n— {{agent.name}}', usage30d: 61, shared: true },
  { id: 'mac_2', title: 'Refund policy summary', departmentId: 'dep_billing', body: 'Hi {{customer.name}},\n\nWe refund new services cancelled within 14 days of the first payment. Renewals are refundable within 48 hours when the service was not used. Your request is being reviewed.\n\n— {{agent.name}}', usage30d: 24, shared: true },
  { id: 'mac_3', title: 'Invoice copy', departmentId: 'dep_billing', body: 'Hi {{customer.name}},\n\nYou can download every invoice from Billing → Invoices in your panel. If your legal details changed, update the billing profile and we will reissue the document.', usage30d: 37, shared: true },
  { id: 'mac_4', title: 'Abuse: request for information', departmentId: 'dep_abuse', body: 'We received a report about traffic originating from your service. Please reply within 24 hours describing what runs on it.', usage30d: 4, shared: false },
  { id: 'mac_5', title: 'Node migration notice', departmentId: null, body: 'Your service is being moved to a different node as part of planned maintenance. Expect about 5 minutes of downtime.', usage30d: 9, shared: true },
];

const topics: Array<{ dep: string; subject: string; body: string; tags: string[]; service: boolean }> = [
  { dep: 'dep_tech', subject: 'Server stuck on "starting"', body: 'My server has been stuck on starting for 20 minutes. Console shows nothing after "Loading libraries".', tags: ['startup'], service: true },
  { dep: 'dep_tech', subject: 'Lag spikes every few minutes', body: 'Players report rubber banding every 5 minutes or so. CPU in the panel is low.', tags: ['performance'], service: true },
  { dep: 'dep_tech', subject: 'How do I install a modpack?', body: 'I would like to run a Forge modpack from CurseForge. Can you help?', tags: ['how-to'], service: true },
  { dep: 'dep_tech', subject: 'Please move my server closer to EU West', body: 'Most of my players are in the Netherlands. Is a migration to Amsterdam possible without losing the world?', tags: ['migration'], service: true },
  { dep: 'dep_tech', subject: 'Disk full, cannot save world', body: 'Console says "No space left on device". I did not add any mods.', tags: ['disk'], service: true },
  { dep: 'dep_billing', subject: 'Invoice shows the wrong VAT number', body: 'Please reissue the last invoice with our VAT ID.', tags: ['vat'], service: false },
  { dep: 'dep_billing', subject: 'Charged twice this month', body: 'I see two charges on my card for the same server.', tags: ['duplicate-charge'], service: true },
  { dep: 'dep_billing', subject: 'Renewal failed but card is valid', body: 'The renewal payment failed. My bank says no decline was recorded on their side.', tags: ['payment-failed'], service: true },
  { dep: 'dep_billing', subject: 'Request refund within 14 days', body: 'I bought the wrong plan yesterday. Can I get a refund and order the correct one?', tags: ['refund'], service: true },
  { dep: 'dep_abuse', subject: 'DDoS against my server', body: 'We are being attacked, the whole node seems affected. Please check.', tags: ['ddos'], service: true },
  { dep: 'dep_abuse', subject: 'Account login from unknown country', body: 'I got a login alert from a country I have never visited.', tags: ['security'], service: false },
  { dep: 'dep_tech', subject: 'Cannot connect over SFTP', body: 'Authentication fails with the panel password.', tags: ['sftp'], service: true },
];
const staffReplies = [
  'Thanks for the details. I checked the node and the console history on your side and I can see the cause. I will follow up in a few minutes.',
  'We restarted the container from our side and watched the startup complete. Could you confirm it is stable for you now?',
  'Understood. I have escalated this to infrastructure and added the diagnostics to the ticket.',
  'Done. You should see the change in your panel within a minute. Let us know if anything looks off.',
];

export function buildTickets(customers: Customer[], services: Service[], staff: StaffMember[]): Ticket[] {
  const r = makeRng(31);
  const agents = staff.filter((s) => (s.role === 'SUPPORT' || s.role === 'ADMINISTRATOR' || s.role === 'INFRASTRUCTURE' || s.role === 'BILLING') && s.status === 'ACTIVE');
  const out: Ticket[] = [];
  for (let i = 1; i <= 96; i++) {
    const topic = r.pick(topics);
    const c = i <= 6 ? customers[[0, 2, 3, 6, 7, 3][i - 1]!]! : r.pick(customers.filter((x) => x.status !== 'CLOSED'));
    const mine = services.filter((s) => s.customerId === c.id && s.lifecycle !== 'TERMINATED');
    const svc = topic.service && mine.length ? [r.pick(mine).id] : [];
    const ageH = i <= 8 ? r.int(1, 30) : Math.round(Math.pow(r.next(), 1.8) * 24 * 70);
    const createdMs = ADMIN_NOW - ageH * HOUR;
    const status = i <= 8 ? r.pick<TicketStatus>(['open', 'open', 'waiting_staff', 'open']) : r.weighted<TicketStatus>([['open', 14], ['waiting_customer', 16], ['waiting_staff', 12], ['resolved', 22], ['closed', 36]]);
    const priority: TicketPriority = topic.tags.includes('ddos') ? (r.chance(0.7) ? 'urgent' : 'high') : r.weighted<TicketPriority>([['low', 20], ['normal', 58], ['high', 17], ['urgent', 5]]);
    const dueIn = topic.dep === 'dep_abuse' ? 30 : topic.dep === 'dep_billing' ? 240 : 60;
    const assignee = (i === 2 || i === 4) ? null : status === 'open' && r.chance(0.35) ? null : r.pick(agents).id;
    const msgs: TicketMessage[] = [{ id: `tm_${i}_1`, author: 'customer', name: c.members[0]?.name ?? c.name, at: new Date(createdMs).toISOString(), body: topic.body, attachments: r.chance(0.12) ? [{ name: 'console-tail.txt', size: 4200 }] : [] }];
    let firstResponseAt: string | null = null;
    if (status !== 'open' || assignee) {
      const a = agents.find((x) => x.id === assignee) ?? agents[0]!;
      if (status !== 'open' || r.chance(0.6)) {
        const t = createdMs + r.int(5, dueIn + 40) * MIN;
        if (t < ADMIN_NOW) { firstResponseAt = new Date(t).toISOString(); msgs.push({ id: `tm_${i}_2`, author: 'staff', name: a.name, at: firstResponseAt, body: r.pick(staffReplies), attachments: [] }); }
        if (r.chance(0.3) && t < ADMIN_NOW) msgs.push({ id: `tm_${i}_n`, author: 'internal', name: a.name, at: new Date(t + 2 * MIN).toISOString(), body: 'Checked provider state: in sync. Looks customer-side config. No action on node needed.', attachments: [] });
      }
    }
    if (['resolved', 'closed', 'waiting_staff'].includes(status) && msgs.length >= 2) msgs.push({ id: `tm_${i}_3`, author: 'customer', name: c.members[0]?.name ?? c.name, at: new Date(Math.min(ADMIN_NOW - 5 * MIN, Date.parse(msgs[1]!.at) + r.int(20, 400) * MIN)).toISOString(), body: status === 'waiting_staff' ? 'Still not fixed, same problem again.' : 'That fixed it, thank you!', attachments: [] });
    out.push({ id: `tkt_${pad(i)}`, subject: topic.subject, customerId: c.id, requester: msgs[0]!.name, departmentId: topic.dep, priority, status, assigneeId: assignee, serviceIds: svc, createdAt: new Date(createdMs).toISOString(), updatedAt: msgs[msgs.length - 1]!.at, firstResponseDueAt: new Date(createdMs + dueIn * MIN).toISOString(), firstResponseAt, messages: msgs, tags: topic.tags });
  }
  // Stories that other pages link to.
  const urgent = out[1]!; urgent.priority = 'urgent'; urgent.status = 'open'; urgent.assigneeId = null; urgent.firstResponseAt = null; urgent.messages = [urgent.messages[0]!]; urgent.subject = 'DDoS against my server'; urgent.departmentId = 'dep_abuse'; urgent.firstResponseDueAt = iso(-25 * MIN); urgent.createdAt = iso(-85 * MIN); urgent.messages[0]!.at = urgent.createdAt; urgent.updatedAt = urgent.createdAt;
  const urgent2 = out[3]!; urgent2.subject = 'Server will not start after plan upgrade'; urgent2.departmentId = 'dep_tech'; urgent2.priority = 'urgent'; urgent2.status = 'open'; urgent2.assigneeId = null; urgent2.firstResponseAt = null; urgent2.messages = [urgent2.messages[0]!]; urgent2.createdAt = iso(-3 * HOUR); urgent2.messages[0]!.at = urgent2.createdAt; urgent2.updatedAt = urgent2.createdAt; urgent2.firstResponseDueAt = iso(-2 * HOUR);
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  void DAY;
  return out;
}
