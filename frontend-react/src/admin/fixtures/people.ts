import type { AccountStatus, Currency, Customer, Member, RiskLevel, StaffMember, StaffSession } from '../types';
import { DAY, HOUR, MIN, iso } from '../lib/format';
import { makeRng, pad } from './rng';

const first = ['Alex', 'Bianca', 'Carlos', 'Dana', 'Emil', 'Freya', 'Gabriel', 'Hana', 'Ivan', 'Julia', 'Karim', 'Lucia', 'Mihai', 'Nora', 'Oskar', 'Paula', 'Quinn', 'Rafael', 'Sara', 'Theo', 'Uma', 'Viktor', 'Wendy', 'Xavier', 'Yara', 'Zoran', 'Ilinca', 'Bogdan', 'Matei', 'Elena'];
const last = ['Albu', 'Becker', 'Costa', 'Dumitru', 'Ek', 'Fischer', 'Georgescu', 'Haas', 'Ionescu', 'Jansen', 'Kowalski', 'Lambert', 'Moreau', 'Neumann', 'Oprea', 'Petrov', 'Quintero', 'Rossi', 'Stan', 'Tudor', 'Ulrich', 'Vasile', 'Weiss', 'Zahn', 'Marin', 'Nistor'];
const orgs = ['Aurora', 'Blackbird', 'Cobalt', 'Driftwood', 'Ember', 'Fjord', 'Granite', 'Halcyon', 'Ironclad', 'Juniper', 'Krypton', 'Lumen', 'Monolith', 'Nebula', 'Obsidian', 'Polaris', 'Quartz', 'Redwood', 'Summit', 'Titan'];
const orgSuffix = ['Gaming', 'Esports', 'Studio', 'Labs', 'Community', 'Network', 'Games'];
const countries = [['DE', 'EUR'], ['RO', 'RON'], ['NL', 'EUR'], ['FR', 'EUR'], ['PL', 'EUR'], ['US', 'USD'], ['FI', 'EUR'], ['ES', 'EUR'], ['IT', 'EUR'], ['RO', 'EUR']] as const;
const vatPrefix: Record<string, string> = { DE: 'DE', RO: 'RO', NL: 'NL', FR: 'FR', PL: 'PL', FI: 'FI', ES: 'ES', IT: 'IT', US: '' };
const places: Record<string, { street: string; cities: string[] }> = { DE: { street: 'Hauptstr.', cities: ['Berlin', 'Hamburg', 'Köln'] }, RO: { street: 'Strada Libertății', cities: ['București', 'Cluj-Napoca', 'Iași'] }, NL: { street: 'Keizersgracht', cities: ['Amsterdam', 'Utrecht'] }, FR: { street: 'Rue Lafayette', cities: ['Paris', 'Lyon'] }, PL: { street: 'ul. Marszałkowska', cities: ['Warszawa', 'Kraków'] }, US: { street: 'Market St', cities: ['Austin', 'Seattle'] }, FI: { street: 'Mannerheimintie', cities: ['Helsinki', 'Tampere'] }, ES: { street: 'Calle Mayor', cities: ['Madrid', 'Valencia'] }, IT: { street: 'Via Roma', cities: ['Milano', 'Torino'] } };
const ascii = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

const hero: Array<Partial<Customer> & { id: string; name: string; email: string }> = [
  { id: 'acc_0001', name: 'Northwind Gaming GmbH', email: 'billing@northwind-gaming.example', type: 'business', country: 'DE', currency: 'EUR', status: 'ACTIVE', risk: 'low', tags: ['key-account', 'annual'] },
  { id: 'acc_0002', name: 'Andrei Popescu', email: 'andrei.popescu@example.test', type: 'individual', country: 'RO', currency: 'RON', status: 'ACTIVE', risk: 'low', tags: [] },
  { id: 'acc_0003', name: 'Lena Hartmann', email: 'lena.hartmann@example.test', type: 'individual', country: 'DE', currency: 'EUR', status: 'RESTRICTED', risk: 'high', tags: ['chargeback'], restrictions: ['New orders blocked', 'Under payment dispute review'] },
  { id: 'acc_0004', name: 'PixelForge Studio B.V.', email: 'finance@pixelforge.example', type: 'business', country: 'NL', currency: 'EUR', status: 'ACTIVE', risk: 'medium', tags: ['past-due'] },
  { id: 'acc_0005', name: 'Marcus Reed', email: 'marcus.reed@example.test', type: 'individual', country: 'US', currency: 'USD', status: 'ACTIVE', risk: 'low', tags: [] },
  { id: 'acc_0006', name: 'Sofia Ionescu', email: 'sofia.ionescu@example.test', type: 'individual', country: 'RO', currency: 'EUR', status: 'PENDING_VERIFICATION', risk: 'medium', tags: ['new'] },
  { id: 'acc_0007', name: 'Kestrel Esports', email: 'ops@kestrel-esports.example', type: 'business', country: 'FI', currency: 'EUR', status: 'ACTIVE', risk: 'low', tags: ['clan', 'cs2'] },
  { id: 'acc_0008', name: 'Tomasz Nowak', email: 'tomasz.nowak@example.test', type: 'individual', country: 'PL', currency: 'EUR', status: 'SUSPENDED', risk: 'high', tags: ['abuse-report'], restrictions: ['All services suspended', 'Login allowed read-only'] },
];

export function buildCustomers(): Customer[] {
  const r = makeRng(7);
  const out: Customer[] = [];
  const total = 200;
  for (let i = 1; i <= total; i++) {
    const id = `acc_${pad(i)}`;
    const h = hero.find((x) => x.id === id);
    const [country, cur] = r.pick(countries);
    const business = h?.type ? h.type === 'business' : r.chance(0.28);
    const f = r.pick(first), l = r.pick(last);
    const name = h?.name ?? (business ? `${r.pick(orgs)} ${r.pick(orgSuffix)}` : `${f} ${l}`);
    const emailBase = ascii(name).slice(0, 18);
    const created = iso(-r.int(2, 640) * DAY - r.int(0, 20) * HOUR);
    const status: AccountStatus = h?.status ?? r.weighted<AccountStatus>([['ACTIVE', 86], ['PENDING_VERIFICATION', 5], ['RESTRICTED', 3], ['SUSPENDED', 3], ['CLOSED', 3]]);
    const risk: RiskLevel = h?.risk ?? (status === 'RESTRICTED' || status === 'SUSPENDED' ? 'high' : r.weighted<RiskLevel>([['low', 82], ['medium', 15], ['high', 3]]));
    const currency: Currency = (h?.currency ?? cur) as Currency;
    const cc = h?.country ?? country;
    const ownerName = business ? `${f} ${l}` : name;
    const members: Member[] = [{ id: `usr_${pad(i)}_1`, name: ownerName, email: business ? `${ascii(ownerName)}@${emailBase}.example` : (h?.email ?? `${emailBase}@example.test`), role: 'owner', mfa: r.chance(0.55), lastLoginAt: status === 'CLOSED' ? null : iso(-r.int(0, 30) * DAY - r.int(0, 23) * HOUR), status: 'active' }];
    if (business) {
      const n = r.int(1, 3);
      for (let k = 0; k < n; k++) members.push({ id: `usr_${pad(i)}_${k + 2}`, name: `${r.pick(first)} ${r.pick(last)}`, email: `${ascii(r.pick(first))}.${ascii(r.pick(last))}@${emailBase}.example`, role: r.pick(['admin', 'billing', 'developer', 'viewer'] as const), mfa: r.chance(0.4), lastLoginAt: iso(-r.int(0, 60) * DAY), status: r.chance(0.12) ? 'invited' : 'active' });
    }
    out.push({
      id, name, email: h?.email ?? members[0]!.email, type: business ? 'business' : 'individual', country: cc, status, risk, currency, createdAt: created,
      lastLoginAt: members[0]!.lastLoginAt, emailVerified: status !== 'PENDING_VERIFICATION', mfaEnabled: members[0]!.mfa,
      billingProfile: { legalName: name, addressLine: `${r.int(1, 220)} ${(places[cc] ?? places['DE']!).street}`, city: r.pick((places[cc] ?? places['DE']!).cities), postalCode: String(r.int(10000, 99999)), country: cc, vatId: business && vatPrefix[cc] ? `${vatPrefix[cc]}${r.int(100000000, 999999999)}` : '', taxExempt: business && r.chance(0.2) },
      creditBalance: { amount: r.chance(0.12) ? r.int(2, 40) * 100 : 0, currency },
      members,
      notes: r.chance(0.2) ? [{ id: `note_${pad(i)}_1`, author: 'Cătălin Rusu', at: iso(-r.int(2, 90) * DAY), body: 'Asked about migrating to a closer region. Quoted no price; revisit after Q4 capacity review.' }] : [],
      restrictions: h?.restrictions ?? (status === 'RESTRICTED' ? ['New orders blocked'] : status === 'SUSPENDED' ? ['All services suspended'] : []),
      tags: h?.tags ?? (r.chance(0.08) ? ['clan'] : []),
    });
  }
  // Hero accounts carry richer history so detail pages are not bare.
  const byId = (id: string) => out.find((c) => c.id === id)!;
  byId('acc_0003').notes = [
    { id: 'note_3_1', author: 'Ioana Marin', at: iso(-6 * DAY), body: 'Card dispute opened by the cardholder on invoice INV-2026-01177. Services remain active until Stripe outcome; do not issue a manual refund.' },
    { id: 'note_3_2', author: 'Daniel Voss', at: iso(-5 * DAY), body: 'Restricted new orders per fraud checklist step 3. Customer contacted via ticket.' },
  ];
  byId('acc_0008').notes = [{ id: 'note_8_1', author: 'Victor Lang', at: iso(-11 * DAY), body: 'Abuse report: outbound UDP flood from svc_0412 traced to this account. Services suspended pending customer response (ticket open).' }];
  byId('acc_0001').notes = [{ id: 'note_1_1', author: 'Maria Ilie', at: iso(-40 * DAY), body: 'Annual contract renewal agreed verbally; invoice net-30. Keep priority support routing.' }];
  byId('acc_0004').members.forEach((m) => { m.mfa = false; });
  return out;
}

const names: Array<[string, string, StaffMember['role'], boolean]> = [
  ['stf_01', 'Maria Ilie', 'OWNER', true], ['stf_02', 'Daniel Voss', 'ADMINISTRATOR', true], ['stf_03', 'Ioana Marin', 'BILLING', true], ['stf_04', 'Cătălin Rusu', 'SUPPORT', true],
  ['stf_05', 'Petra Novak', 'SUPPORT', true], ['stf_06', 'Victor Lang', 'INFRASTRUCTURE', true], ['stf_07', 'Elena Stoica', 'AUDITOR', true], ['stf_08', 'Radu Pop', 'SUPPORT', false], ['stf_09', 'Anton Weber', 'INFRASTRUCTURE', true],
];
export function buildStaff(): StaffMember[] {
  return names.map(([id, name, role, mfa], i) => {
    const status = id === 'stf_08' ? 'REVOKED' as const : 'ACTIVE' as const;
    const sessions: StaffSession[] = status === 'REVOKED' ? [] : Array.from({ length: id === 'stf_01' ? 3 : 1 + (i % 2) }, (_, k) => ({
      id: `ses_${id}_${k}`, staffId: id, device: ['Chrome 141 · Linux', 'Firefox 143 · Windows', 'Safari 19 · iOS'][(i + k) % 3]!, ip: `203.0.113.${20 + i * 3 + k}`, location: ['Bucharest, RO', 'Berlin, DE', 'Amsterdam, NL'][(i + k) % 3]!,
      startedAt: iso(-(k + 1) * 5 * HOUR - i * MIN), lastSeenAt: iso(-(i * 7 + k * 40) * MIN), stepUpAt: k === 0 && i % 3 !== 2 ? iso(-(20 + i * 9) * MIN) : null, current: id === 'stf_01' && k === 0,
    }));
    return { id, name, email: `${name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.')}@fortless.example`, role, status, mfa: id === 'stf_09' ? false : mfa || id === 'stf_08', lastLoginAt: status === 'REVOKED' ? iso(-71 * DAY) : iso(-(i * 3 + 1) * HOUR), createdAt: iso(-(300 + i * 40) * DAY), ipAllowlist: role === 'OWNER' || role === 'INFRASTRUCTURE' ? ['203.0.113.0/24'] : [], sessions };
  });
}
