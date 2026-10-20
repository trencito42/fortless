import { useState } from 'react';
import { PlanComparison, PricingTable, SegmentedControl, type PricingPlan } from '@/design-system';
import { AnnouncementFeed, CartItems, CheckoutSummary, KnowledgeBaseSearch, NetworkAllocations, NotificationPreferences, StartupEditor, UsageOverview, type AnnouncementItem, type KnowledgeArticle, type NotificationMatrix, type UsageSample } from '@/features';
import { defineStory } from '../types';

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
const NOTE = 'Sample data defined in the story file.';

const PLANS: PricingPlan[] = [
  { id: 'spark', name: 'Spark', price: '€3.00', period: '/ month', features: ['1 GB RAM', '1 vCPU', '5 GB NVMe', 'DDoS protection'], description: '1 GB RAM · 1 vCPU' },
  { id: 'flame', name: 'Flame', price: '€9.00', period: '/ month', features: ['4 GB RAM', '2 vCPU', '20 GB NVMe', 'Priority support'], highlight: true, description: '4 GB RAM · 2 vCPU' },
  { id: 'blaze', name: 'Blaze', price: '€18.00', period: '/ month', features: ['8 GB RAM', '4 vCPU', '50 GB NVMe', 'Dedicated IP'], current: true, description: '8 GB RAM · 4 vCPU' },
  { id: 'inferno', name: 'Inferno', price: '€36.00', period: '/ month', features: ['16 GB RAM', '8 vCPU', '100 GB NVMe'], unavailable: 'Sold out in Frankfurt. Choose another region.', description: '16 GB RAM · 8 vCPU' },
];
const Cycle = () => { const [c, setC] = useState<'monthly' | 'yearly'>('monthly'); return <PricingTable plans={PLANS.map((p) => (c === 'yearly' ? { ...p, price: `€${(parseFloat(p.price.slice(1)) * 10 / 12).toFixed(2)}`, note: 'billed yearly' } : p))} onSelect={() => {}} header={<SegmentedControl aria-label="Billing cycle" value={c} onValueChange={setC} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />} />; };

const TOPICS = [
  { id: 'service-state', label: 'Server status', description: 'A server crashed or was suspended.' },
  { id: 'billing', label: 'Invoices and payments', description: 'New invoices and failed payments.' },
  { id: 'security', label: 'Security alerts', description: 'New sign-ins and security changes.', locked: ['email' as const] },
];
const MATRIX: NotificationMatrix = { 'service-state': { email: true, discord: false, push: true }, billing: { email: true, discord: false, push: false }, security: { email: true, discord: false, push: true } };

const NEWS: AnnouncementItem[] = [
  { id: 'a1', kind: 'maintenance', title: 'Frankfurt node fra-03 maintenance', body: 'Services on this node restart once on Oct 27 between 02:00 and 03:30 UTC.', time: '20 Oct 2026, 09:00 UTC', affects: ['Survival EU'], read: false },
  { id: 'a2', kind: 'incident', title: 'Elevated packet loss in Amsterdam', body: 'A transit provider drops a share of packets. Traffic was rerouted.', time: '19 Oct 2026, 14:20 UTC', read: false },
  { id: 'a3', kind: 'news', title: 'Paper 1.21.8 in one click', body: 'Switch versions from Startup.', time: '12 Oct 2026, 09:00 UTC', read: true },
];
const KB: KnowledgeArticle[] = [
  { id: 'k1', category: 'Minecraft', title: 'Install plugins and mods', summary: 'Use the catalog or upload a jar.', tags: ['plugins', 'mods'], popular: true, searchText: 'Open Game, then Plugins and mods.' },
  { id: 'k2', category: 'Counter-Strike', title: 'Set up AMX Mod X on ReHLDS', summary: 'Enable admin plugins on CS 1.6.', tags: ['amxx'] },
  { id: 'k3', category: 'Billing', title: 'How renewals and invoices work', summary: 'When we charge and what happens on failure.', tags: ['invoice'] },
];

const samples = (n: number): UsageSample[] => Array.from({ length: n }, (_, i) => ({ label: `${String(i % 24).padStart(2, '0')}:00`, cpu: Math.round(40 + 35 * Math.sin(i / 3)), ramMb: 1800 + Math.round(600 * Math.sin(i / 5)), inMbps: +(1.5 + Math.sin(i / 2)).toFixed(1), outMbps: +(3 + 2 * Math.sin(i / 4)).toFixed(1) }));
const Usage = ({ state, data }: { state: 'ready' | 'loading' | 'empty' | 'error'; data: UsageSample[] }) => { const [r, setR] = useState<'1h' | '24h' | '7d' | '30d'>('24h'); return <UsageOverview range={r} onRangeChange={setR} samples={data} state={state} onRetry={() => {}} bandwidth={{ usedGb: 212, limitGb: 1000 }} formatMemory={(m) => `${(m / 1024).toFixed(1)} GB`} />; };

const Checkout = ({ fail, none }: { fail?: boolean; none?: boolean }) => {
  const [m, setM] = useState<string | null>(none ? null : 'v');
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <CartItems items={[{ id: '1', title: 'Survival EU', detail: 'Flame · Paper 1.21.8 · monthly', price: '€9.00' }, { id: '2', title: 'mygamehost.com', detail: '1 year registration', price: '€12.00' }]} onRemove={async () => wait(200)} />
      <CheckoutSummary rows={[{ label: 'Subtotal', value: '€21.00' }, { label: 'VAT 19%', value: '€3.99' }]} total={{ label: 'Due today', value: '€24.99' }} methods={none ? [] : [{ value: 'v', label: 'VISA •••• 4242' }, { value: 'm', label: 'MASTERCARD •••• 0087', description: 'Declined (sample)' }]} methodId={m} onMethodChange={setM} termsLabel="I agree to the Terms of Service" footnote="Simulated: nothing is charged." onSubmit={async () => { await wait(); if (fail) throw new Error('The card was declined by the issuer. Nothing was charged.'); }} />
    </div>
  );
};

const base = { category: 'Hosting compositions' as const, layer: 'C: Fortless' as const, responsive: 'Stacks to one column on phones; rendered 320 to 1920 px by the automated suite.' };

export const commerceStories = [
  defineStory({
    id: 'pricing-table', title: 'PricingTable and PlanComparison', category: 'Data display', layer: 'B: composition',
    purpose: 'Plan cards for choosing a plan, plus a side-by-side comparison table. Prices arrive formatted; nothing is calculated here.', source: 'Stripe pricing table, WHMCS product list (new)',
    variants: ['monthly / yearly header', 'highlighted plan', 'current plan', 'unavailable with reason', 'comparison table'], props: ['plans: PricingPlan[]', 'onSelect(plan)', 'selectLabel?(plan)', 'header?', 'PlanComparison: plans, rows'],
    a11y: 'Plans are a labelled list of headings; the comparison is a real table with row and column headers, and included/not included are read as text.', responsive: 'One column on phones, four on xl. The comparison scrolls inside its own region.', status: 'implemented',
    scenarios: [{ name: 'Cards with cycle switch', note: NOTE, render: () => <Cycle /> }, { name: 'Current and sold-out plans', render: () => <PricingTable plans={PLANS} onSelect={() => {}} /> }, { name: 'Comparison', render: () => <PlanComparison plans={PLANS} rows={[{ label: 'Memory', values: { spark: '1 GB', flame: '4 GB', blaze: '8 GB', inferno: '16 GB' } }, { label: 'Dedicated IP', values: { spark: false, flame: false, blaze: true, inferno: true } }, { label: 'Priority support', values: { spark: false, flame: true, blaze: true, inferno: true } }]} /> }],
  }),
  defineStory({
    id: 'notification-preferences', title: 'NotificationPreferences', ...base,
    purpose: 'Topic by channel matrix. Edits stay local until Save; locked cells and unconnected channels explain themselves.', source: 'Fortless Security & Team (screenshot)',
    variants: ['default', 'Discord not connected', 'save fails'], props: ['topics', 'value', 'channels', 'onSave(matrix)'],
    a11y: 'Every cell is a labelled switch; locked and unconnected states are disabled with visible text, not colour alone.', status: 'implemented',
    scenarios: [
      { name: 'Default', note: NOTE, render: () => <NotificationPreferences topics={TOPICS} value={MATRIX} channels={{ email: { label: 'Email', connected: true }, discord: { label: 'Discord', connected: false, hint: 'Connect Discord first' }, push: { label: 'Browser push', connected: true } }} onSave={async () => wait()} /> },
      { name: 'Save fails', render: () => <NotificationPreferences topics={TOPICS} value={MATRIX} channels={{ email: { label: 'Email', connected: true }, discord: { label: 'Discord', connected: true }, push: { label: 'Browser push', connected: true } }} onSave={async () => { await wait(); throw new Error('Could not save. Try again.'); }} /> },
    ],
  }),
  defineStory({
    id: 'cart-checkout', title: 'CartItems and CheckoutSummary', ...base,
    purpose: 'Cart lines and a checkout card with totals, payment method, terms and one primary action.', source: 'WHMCS cart; Stripe checkout summary (new)',
    variants: ['items + checkout', 'declined card', 'no payment method', 'empty cart'], props: ['CartItems: items, onRemove, emptyAction', 'CheckoutSummary: rows, total, methods, methodId, termsLabel, onSubmit'],
    a11y: 'Remove buttons name the item; the primary action is disabled until terms are accepted; failures are announced in a notice.', status: 'implemented',
    scenarios: [{ name: 'Ready', note: NOTE, render: () => <Checkout /> }, { name: 'Card declined', render: () => <Checkout fail /> }, { name: 'No payment method', render: () => <Checkout none /> }, { name: 'Empty cart', render: () => <CartItems items={[]} onRemove={() => {}} emptyAction={<span className="text-ink3">Deploy a server to begin.</span>} /> }],
  }),
  defineStory({
    id: 'announcements-kb', title: 'AnnouncementFeed and KnowledgeBaseSearch', ...base,
    purpose: 'Maintenance and incident feed with unread state, and a searchable, filterable article list.', source: 'WHMCS announcements and knowledge base (new)',
    variants: ['feed with unread', 'empty feed', 'search results', 'no results'], props: ['AnnouncementFeed: items, onMarkRead', 'KnowledgeBaseSearch: articles, onOpen, onNoResults'],
    a11y: 'Filters are a labelled radio group; the article list is aria-live and announces its count; categories are toggle buttons with aria-pressed.', status: 'implemented',
    scenarios: [{ name: 'Feed', note: NOTE, render: () => <AnnouncementFeed items={NEWS} onMarkRead={async () => wait(200)} /> }, { name: 'Empty feed', render: () => <AnnouncementFeed items={[]} onMarkRead={() => {}} /> }, { name: 'Knowledge base', render: () => <KnowledgeBaseSearch articles={KB} onOpen={() => {}} onNoResults={<span className="text-ink3">Open a ticket</span>} /> }],
  }),
  defineStory({
    id: 'usage-overview', title: 'UsageOverview', ...base,
    purpose: 'Usage history for one service: peaks, CPU, memory, network and the monthly bandwidth quota, with a range selector.', source: 'Fortless service Overview charts; needs a metrics backend',
    variants: ['ready', 'loading', 'empty', 'error'], props: ['range, onRangeChange', 'samples, state, onRetry', 'bandwidth?', 'formatMemory'],
    a11y: 'Every chart has a text summary with its peak; range selector is a radio group; quota is a progressbar.', status: 'partial',
    gaps: 'Fortless has no usage-history API, so production needs a metrics store. The data here is deterministic sample data.',
    scenarios: [{ name: 'Ready', note: NOTE, render: () => <Usage state="ready" data={samples(48)} /> }, { name: 'Loading', render: () => <Usage state="loading" data={[]} /> }, { name: 'Empty', render: () => <Usage state="empty" data={[]} /> }, { name: 'Error', render: () => <Usage state="error" data={[]} /> }],
  }),
  defineStory({
    id: 'startup-editor', title: 'StartupEditor (startup variables)', ...base,
    purpose: 'Startup command, Docker image and environment variables of a server, with required and read-only variables.', source: 'Pterodactyl Startup tab',
    variants: ['editable', 'read-only with reason', 'command locked'], props: ['initial', 'images', 'commandEditable', 'onSave', 'disabledReason', 'restartNote'],
    a11y: 'Each variable is a labelled field with its env key and description; read-only state is explained in text.', status: 'implemented',
    scenarios: [
      { name: 'Editable', note: NOTE, render: () => <StartupEditor initial={{ command: 'java -Xms128M -jar {{SERVER_JARFILE}}', dockerImage: 'java_21', variables: [{ key: 'MINECRAFT_VERSION', label: 'Minecraft version', description: 'latest or a version number', value: 'latest', required: true, editable: true }, { key: 'SERVER_JARFILE', label: 'Server jar', value: 'server.jar', editable: true }, { key: 'BUILD_NUMBER', label: 'Build number', value: 'latest', editable: false }] }} images={[{ value: 'java_21', label: 'Java 21' }, { value: 'java_17', label: 'Java 17' }]} onSave={async () => wait()} restartNote="Changes apply after the next restart." /> },
      { name: 'Read-only', render: () => <StartupEditor initial={{ command: './start.sh', dockerImage: 'node_22', variables: [{ key: 'NODE_ENV', label: 'Environment', value: 'production', editable: true }] }} images={[{ value: 'node_22', label: 'Node.js 22' }]} onSave={async () => wait()} disabledReason="Your access level can view startup settings but not change them." /> },
    ],
  }),
  defineStory({
    id: 'network-allocations', title: 'NetworkAllocations', ...base,
    purpose: 'IP and port allocations of a server. The primary one is the address players connect to and cannot be removed.', source: 'Pterodactyl Network tab',
    variants: ['full permissions', 'view only', 'empty'], props: ['allocations', 'permissions', 'onAssign', 'onSaveNotes', 'onSetPrimary', 'onRemove'],
    a11y: 'Each address has a labelled copy button and an action menu named for the row; unavailable actions say why.', status: 'implemented',
    scenarios: [
      { name: 'Full permissions', note: NOTE, render: () => <NetworkAllocations allocations={[{ id: 1, ip: '203.0.113.5', alias: 'survival.fortless.gg', port: 25565, notes: 'Game', primary: true }, { id: 2, ip: '203.0.113.5', alias: null, port: 25566, notes: 'Dynmap', primary: false }]} permissions={{ create: true, update: true, delete: true }} onAssign={async () => wait()} onSaveNotes={async () => wait()} onSetPrimary={async () => wait()} onRemove={async () => wait()} /> },
      { name: 'View only', render: () => <NetworkAllocations allocations={[{ id: 1, ip: '203.0.113.5', alias: null, port: 25565, notes: '', primary: true }]} permissions={{ create: false, update: false, delete: false }} onAssign={async () => wait()} onSaveNotes={async () => wait()} onSetPrimary={async () => wait()} onRemove={async () => wait()} /> },
      { name: 'Empty', render: () => <NetworkAllocations allocations={[]} permissions={{ create: true, update: true, delete: true }} onAssign={async () => wait()} onSaveNotes={async () => wait()} onSetPrimary={async () => wait()} onRemove={async () => wait()} /> },
    ],
  }),
];
