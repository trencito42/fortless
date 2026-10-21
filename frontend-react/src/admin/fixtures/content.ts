import type { Announcement, Campaign, KbArticle, KbCategory, LegalDoc, MarketingBlock } from '../types';
import { DAY, iso } from '../lib/format';

export const kbCategories: KbCategory[] = [
  { id: 'kbc_start', name: 'Getting started', slug: 'getting-started', description: 'Ordering, first login, first server.' },
  { id: 'kbc_mc', name: 'Minecraft', slug: 'minecraft', description: 'Software, plugins, mods, worlds.' },
  { id: 'kbc_cs', name: 'Counter-Strike', slug: 'counter-strike', description: 'CS2 and 1.6 configuration, FastDL.' },
  { id: 'kbc_bill', name: 'Billing', slug: 'billing', description: 'Invoices, payments, renewals, refunds.' },
  { id: 'kbc_acct', name: 'Account & security', slug: 'account-security', description: 'MFA, API keys, team access.' },
];
const body = (h: string, steps: string[]) => `# ${h}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n> This article is demo content for the admin preview.\n`;
const art = (i: number, categoryId: string, title: string, status: KbArticle['status'], steps: string[]): KbArticle => ({
  id: `kba_${String(i).padStart(3, '0')}`, categoryId, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), status, body: body(title, steps),
  seoTitle: `${title} | Fortless Help`, seoDescription: `${title}. Step-by-step guide for Fortless customers.`.slice(0, 150), updatedAt: iso(-(i * 5 + 2) * DAY), author: i % 2 ? 'Petra Novak' : 'Cătălin Rusu', views30d: status === 'published' ? 40 + i * 37 : null,
});
export const kbArticles: KbArticle[] = [
  art(1, 'kbc_start', 'Deploy your first server', 'published', ['Choose a product and plan.', 'Pick a region close to your players.', 'Pay; provisioning starts after the payment is confirmed.', 'Open the service from your panel.']),
  art(2, 'kbc_start', 'Understanding service states', 'published', ['Lifecycle (active, suspended, terminated) describes your contract.', 'Runtime (running, offline) describes the server process.', 'They are shown separately because they change for different reasons.']),
  art(3, 'kbc_mc', 'Install plugins on Paper', 'published', ['Open Files in your panel.', 'Upload the jar to /plugins.', 'Restart the server.']),
  art(4, 'kbc_mc', 'Upgrade to a larger plan', 'published', ['Open the service → Billing.', 'Choose Change plan.', 'Review the prorated amount and confirm.']),
  art(5, 'kbc_mc', 'Restore a backup', 'draft', ['Stop the server.', 'Open Backups.', 'Choose Restore on the backup you want.']),
  art(6, 'kbc_cs', 'Set up FastDL for CS 1.6', 'published', ['Enable FastDL in the service.', 'Upload maps to the fastdl folder.', 'Set sv_downloadurl.']),
  art(7, 'kbc_cs', 'Load a workshop map in CS2', 'published', ['Find the workshop ID.', 'Set the host_workshop_map convar.', 'Restart the server.']),
  art(8, 'kbc_bill', 'Download an invoice', 'published', ['Open Billing → Invoices.', 'Choose Download PDF.']),
  art(9, 'kbc_bill', 'Refund policy', 'published', ['New services: 14 days.', 'Renewals: 48 hours if unused.', 'Disputed payments are handled by the card network.']),
  art(10, 'kbc_bill', 'Why did my payment fail?', 'published', ['Check card details.', 'Ask your bank about online payments.', 'Retry from the invoice.']),
  art(11, 'kbc_acct', 'Turn on two-factor authentication', 'published', ['Open Account → Security.', 'Scan the QR code with an authenticator.', 'Save the recovery codes.']),
  art(12, 'kbc_acct', 'Invite a teammate', 'draft', ['Open Account → Team.', 'Choose a role.', 'Send the invitation.']),
  art(13, 'kbc_acct', 'Legacy API tokens', 'archived', ['Superseded by API keys.']),
];

export const announcements: Announcement[] = [
  { id: 'ann_1', title: 'Helsinki 01 upgrade today', body: 'Servers on Helsinki 01 restart once between 06:30 and 14:30 UTC.', severity: 'maintenance', status: 'published', startsAt: iso(-3 * 3_600_000), endsAt: iso(5 * 3_600_000), audience: 'Customers with services in HEL' },
  { id: 'ann_2', title: 'New: Diamond 8 GB plan', body: 'Our biggest Minecraft plan is now available in Frankfurt and Ashburn.', severity: 'info', status: 'published', startsAt: iso(-12 * DAY), endsAt: null, audience: 'All customers' },
  { id: 'ann_3', title: 'Billing database upgrade — Oct 30', body: 'Checkout is read-only for up to 45 minutes.', severity: 'warning', status: 'scheduled', startsAt: iso(5 * DAY), endsAt: iso(9 * DAY + 3_600_000), audience: 'All customers' },
  { id: 'ann_4', title: 'Draft: Black Friday plans', body: 'TBD pricing; do not publish before approval.', severity: 'info', status: 'draft', startsAt: iso(30 * DAY), endsAt: null, audience: 'All customers' },
  { id: 'ann_5', title: 'Amsterdam rack move (completed)', body: 'Completed without customer impact.', severity: 'maintenance', status: 'expired', startsAt: iso(-17 * DAY), endsAt: iso(-16 * DAY), audience: 'Customers with services in AMS' },
];

export const marketingBlocks: MarketingBlock[] = [
  { id: 'mb_1', page: 'Home', key: 'hero.title', label: 'Hero title', value: 'Game servers that stay out of your way.', kind: 'text', updatedAt: iso(-20 * DAY), maxLength: 70 },
  { id: 'mb_2', page: 'Home', key: 'hero.subtitle', label: 'Hero subtitle', value: 'Deploy in seconds on EU and US nodes. Pay monthly, cancel any time.', kind: 'longtext', updatedAt: iso(-20 * DAY), maxLength: 160 },
  { id: 'mb_3', page: 'Home', key: 'hero.cta', label: 'Primary button', value: 'Deploy a server', kind: 'text', updatedAt: iso(-60 * DAY), maxLength: 24 },
  { id: 'mb_4', page: 'Home', key: 'hero.cta.link', label: 'Primary button link', value: '/register', kind: 'link', updatedAt: iso(-60 * DAY), maxLength: 120 },
  { id: 'mb_5', page: 'Pricing', key: 'pricing.title', label: 'Pricing headline', value: 'Simple pricing in your currency', kind: 'text', updatedAt: iso(-33 * DAY), maxLength: 70 },
  { id: 'mb_6', page: 'Pricing', key: 'pricing.note', label: 'Tax note', value: 'Prices exclude VAT. VAT is calculated at checkout from your billing country.', kind: 'longtext', updatedAt: iso(-33 * DAY), maxLength: 200 },
  { id: 'mb_7', page: 'Games', key: 'games.minecraft.tagline', label: 'Minecraft tagline', value: 'Paper, Fabric and Forge, ready in under a minute.', kind: 'text', updatedAt: iso(-9 * DAY), maxLength: 90 },
  { id: 'mb_8', page: 'Footer', key: 'footer.company', label: 'Company line', value: 'Fortless is operated by Fortless Hosting (demo entity).', kind: 'text', updatedAt: iso(-120 * DAY), maxLength: 120 },
];

const rev = (version: string, daysAgo: number, author: string, summary: string, text: string) => ({ version, at: iso(-daysAgo * DAY), author, summary, body: text });
const lorem = (t: string) => `# ${t}\n\nThis is synthetic placeholder text for the admin preview and is not legal copy.\n\n## 1. Scope\nThe terms apply to all services.\n\n## 2. Payment\nAmounts are in the currency shown at checkout.\n`;
export const legalDocs: LegalDoc[] = (['terms', 'privacy', 'cookies', 'refund'] as const).flatMap((kind) => (['en', 'ro'] as const).map((language) => {
  const name = { terms: 'Terms of Service', privacy: 'Privacy Policy', cookies: 'Cookie Policy', refund: 'Refund Policy' }[kind];
  const draft = kind === 'privacy' && language === 'en';
  return {
    id: `leg_${kind}_${language}`, kind, language, title: language === 'en' ? name : `${name} (RO)`, status: 'published' as const, currentVersion: kind === 'terms' ? '3.2' : '2.1', draft: draft ? lorem(name) + '\n## 9. Sub-processors\nAdded: new email relay provider.\n' : null,
    revisions: [rev(kind === 'terms' ? '3.2' : '2.1', 90, 'Maria Ilie', 'Clarified suspension and refund wording', lorem(name)), rev(kind === 'terms' ? '3.1' : '2.0', 240, 'Maria Ilie', 'Added EU VAT section', lorem(name)), rev('1.0', 600, 'Maria Ilie', 'Initial publication', lorem(name))],
  };
}));

export const campaigns: Campaign[] = [
  { id: 'cmp_1', name: 'Welcome series', channel: 'email', status: 'running', audience: 'New accounts (automated)', startsAt: iso(-90 * DAY), endsAt: null, couponCode: 'WELCOME10', sent: 1840, opened: 902, notes: 'Three emails over seven days.' },
  { id: 'cmp_2', name: 'CS2 clan promo', channel: 'email', status: 'scheduled', audience: 'Customers tagged cs2 (preview segment)', startsAt: iso(2 * DAY), endsAt: iso(9 * DAY), couponCode: 'CLAN20', sent: null, opened: null, notes: 'Waiting for copy approval.' },
  { id: 'cmp_3', name: 'Summer sale banner', channel: 'banner', status: 'completed', audience: 'All visitors', startsAt: iso(-60 * DAY), endsAt: iso(-20 * DAY), couponCode: 'SUMMER5', sent: null, opened: null, notes: '' },
  { id: 'cmp_4', name: 'Black Friday teaser', channel: 'social', status: 'draft', audience: 'Followers', startsAt: iso(30 * DAY), endsAt: null, couponCode: 'BLACKFRIDAY26', sent: null, opened: null, notes: 'Pricing not approved.' },
  { id: 'cmp_5', name: 'Winback: cancelled last 90 days', channel: 'email', status: 'paused', audience: 'Cancelled in last 90 days', startsAt: iso(-14 * DAY), endsAt: null, couponCode: null, sent: 212, opened: 71, notes: 'Paused after unsubscribe spike.' },
];
