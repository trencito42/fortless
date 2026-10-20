import { useState } from 'react';
import { defineStory } from '../types';
import { StatusBadge } from '@/design-system';
import { ServerPowerToolbar, ServerMetricsPanel, GameConfigurationForm, PlayerManagerTable, DeployConfigurator, DNSRecordEditor, InvoiceSummary, SubscriptionActions, TicketConversation, DiscordBotSetup, serverStatus, invoiceStatus, domainStatus, ticketStatus, jobStatus, type ServerState, type DnsRecord, type Player } from '@/features';

const wait = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));
const SAMPLE_NOTE = 'All data on this page is sample data defined in the story file.';

function Power() {
  const [state, setState] = useState<ServerState>('offline');
  const [log, setLog] = useState('');
  return (
    <div className="grid gap-3">
      <ServerPowerToolbar state={state} serverName="survival-eu" onPower={async (a) => { setLog(`Sent: ${a}`); if (a === 'start') { setState('starting'); await wait(900); setState('running'); } else if (a === 'stop' || a === 'kill') { setState('stopping'); await wait(700); setState('offline'); } else { setState('stopping'); await wait(500); setState('starting'); await wait(700); setState('running'); } }} />
      <p className="text-[13px] text-ink3">{log || 'Press a button. State changes are simulated.'}</p>
    </div>
  );
}

const PLAYERS: Player[] = [
  { id: '1', name: 'Steve_Builder', online: true, op: true, banned: false, lastSeen: 'Now' },
  { id: '2', name: 'AlexMiner', online: false, op: false, banned: false, lastSeen: 'Yesterday' },
  { id: '3', name: 'GrieferX', online: false, op: false, banned: true, lastSeen: '3 days ago' },
];

function Dns() {
  const [rows, setRows] = useState<DnsRecord[]>([{ id: '1', type: 'A', name: '@', value: '203.0.113.10', ttl: 3600, propagated: true }, { id: '2', type: 'CNAME', name: 'www', value: 'example.com', ttl: 3600, propagated: false }]);
  return <DNSRecordEditor domain="example.com" records={rows} onSave={async (r) => { await wait(300); setRows((l) => (r.id ? l.map((x) => (x.id === r.id ? { ...x, ...r, id: x.id } : x)) : [...l, { ...r, id: String(Date.now()) }])); }} onDelete={async (r) => setRows((l) => l.filter((x) => x.id !== r.id))} />;
}

export const featureStories = [
  defineStory({
    id: 'server-power',
    title: 'ServerPowerToolbar',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'Start, restart, stop and kill with state-dependent availability and a confirmation for kill.',
    source: 'Fortless Views.html: service overview power buttons',
    variants: ['offline', 'running', 'transitional', 'locked with reason'],
    props: ['state: ServerState', 'serverName', 'onPower(action)', 'onError?', 'disabledReason?', 'allowed?: per-action authorisation', 'hideStatus?'],
    a11y: 'ButtonGroup labelled per server; disabled reasons are text. Kill is an AlertDialog with a safe default focus.',
    responsive: 'Wraps; buttons keep 44px touch height.',
    status: 'partial',
    gaps: 'Does not talk to Pterodactyl: the app maps onPower to the client API. Power-state polling and websocket updates are the app\'s job.',
    scenarios: [{ name: 'Interactive (simulated)', note: SAMPLE_NOTE, render: () => <Power /> }, { name: 'Locked', render: () => <ServerPowerToolbar state="suspended" serverName="survival-eu" onPower={() => {}} /> }, { name: 'Per-action authorisation (can start and restart, cannot stop or kill)', render: () => <ServerPowerToolbar state="running" serverName="survival-eu" onPower={() => {}} allowed={{ stop: false, kill: false }} /> }],
  }),
  defineStory({
    id: 'server-metrics',
    title: 'ServerMetricsPanel',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'Live CPU, memory, disk and uptime, with an optional history chart. Missing data stays missing.',
    source: 'Fortless Views.html: CPU/RAM counters on the service page',
    variants: ['running', 'offline', 'loading', 'history recorded / not recorded'],
    props: ['state', 'resources?', 'loading?', 'history?', 'range / onRangeChange'],
    a11y: 'See MetricCard and ChartFrame.',
    responsive: '2 columns on phones, 4 from lg.',
    status: 'partial',
    gaps: 'Pterodactyl only exposes live stats, so history needs Fortless to store samples (not built). The empty history state says so.',
    scenarios: [
      { name: 'Running', note: SAMPLE_NOTE, render: () => <ServerMetricsPanel state="running" resources={{ cpuPercent: 37, memoryBytes: 2254857830, memoryLimitBytes: 4294967296, diskBytes: 6442450944, diskLimitBytes: 21474836480, uptimeSeconds: 93000 }} /> },
      { name: 'Offline', render: () => <ServerMetricsPanel state="offline" resources={{ diskBytes: 6442450944, diskLimitBytes: 21474836480 }} /> },
      { name: 'Loading', render: () => <ServerMetricsPanel state="running" loading /> },
    ],
  }),
  defineStory({
    id: 'game-config',
    title: 'GameConfigurationForm (Minecraft)',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'Edit Minecraft settings with validation against plan limits, dirty tracking and async save.',
    source: 'new (derived from Fortless Views.html settings tab)',
    variants: ['clean', 'dirty', 'validation errors', 'save fails'],
    props: ['initial, versions, maxMemoryMb', 'onSave(config)', 'restartNote?'],
    a11y: 'Native form with Enter-to-save, labelled controls, errors tied to fields, save errors announced as an alert.',
    responsive: 'Two columns from md.',
    status: 'partial',
    gaps: 'Minecraft only. Mapping to server.properties/startup variables is the app\'s job. No per-field "requires restart" markers.',
    scenarios: [{ name: 'Minecraft', render: () => <GameConfigurationForm initial={{ version: '1.21.4', memoryMb: 2048, maxPlayers: 20, difficulty: 'normal', gamemode: 'survival', motd: 'Welcome', onlineMode: true, pvp: true }} versions={['1.21.4', '1.20.6', '1.19.4']} maxMemoryMb={4096} onSave={async () => { await wait(); }} /> }, { name: 'Save fails', render: () => <GameConfigurationForm initial={{ version: '1.21.4', memoryMb: 2048, maxPlayers: 20, difficulty: 'hard', gamemode: 'survival', motd: '', onlineMode: true, pvp: false }} versions={['1.21.4']} maxMemoryMb={4096} onSave={async () => { await wait(); throw new Error('The panel rejected the update.'); }} /> }],
  }),
  defineStory({
    id: 'player-manager',
    title: 'PlayerManagerTable',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'See players and run op, kick and ban actions.',
    source: 'new',
    variants: ['list', 'empty / unavailable'],
    props: ['players', 'onAction(action, player)', 'unavailableReason?'],
    a11y: 'See DataTable. Action menu is labelled per player.',
    responsive: 'Cards on phones.',
    status: 'partial',
    gaps: 'No whitelist editing, no bulk actions. Player data source (query, RCON or log parsing) is not defined yet.',
    scenarios: [{ name: 'Players (sample)', render: () => <PlayerManagerTable players={PLAYERS} onAction={async () => { await wait(300); }} /> }, { name: 'Players (sample, actions fail)', note: 'Every action is rejected, to show the error contract.', render: () => <PlayerManagerTable players={PLAYERS} onAction={async () => { await wait(300); throw new Error('RCON is not reachable.'); }} /> }, { name: 'Server offline', render: () => <PlayerManagerTable players={[]} onAction={() => {}} unavailableReason="Start the server to see who is online." /> }],
  }),
  defineStory({
    id: 'deploy-configurator',
    title: 'DeployConfigurator',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'Quick vs Custom deploy form with plan cards, region and summary. Dedicated capacity only.',
    source: 'Fortless Views.html and Fortless Installer.html: deploy flow',
    variants: ['quick', 'custom (env vars)', 'disabled plan with reason', 'submit fails'],
    props: ['product', 'plans (price pre-formatted)', 'regions', 'onDeploy(value)'],
    a11y: 'Plans are a radio group; errors attach to fields; submit failure is an alert.',
    responsive: 'Summary moves under the form on phones.',
    status: 'partial',
    gaps: 'Single-page, not the full installer flow. Prices and availability come from the app; none are computed here.',
    scenarios: [{ name: 'Minecraft', render: () => <DeployConfigurator product={{ id: 'mc', name: 'Minecraft' }} plans={[{ id: 's', name: 'Starter', specs: '2 GB RAM · 10 GB disk', price: '€6.00 / month' }, { id: 'p', name: 'Standard', specs: '4 GB RAM · 20 GB disk', price: '€11.00 / month' }, { id: 'x', name: 'Large', specs: '8 GB RAM', price: '€20.00 / month', disabled: true, disabledReason: 'Not available in this region' }]} regions={[{ id: 'fra', name: 'Frankfurt' }, { id: 'ams', name: 'Amsterdam' }, { id: 'hel', name: 'Helsinki', unavailable: true }]} onDeploy={async () => { await wait(); throw new Error('No capacity right now. Pick another region.'); }} /> }],
  }),
  defineStory({
    id: 'dns-editor',
    title: 'DNSRecordEditor',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'List, add, edit and delete DNS records with type-aware validation.',
    source: 'Fortless App Nav.html: proposed "DNS records" view (not mocked)',
    variants: ['list', 'add/edit dialog', 'propagation state'],
    props: ['domain, records', 'onSave(record)', 'onDelete(record)'],
    a11y: 'Dialog focus management from Dialog; errors tied to fields.',
    responsive: 'Cards on phones.',
    status: 'partial',
    gaps: 'Validation is client-side only; the provider stays the source of truth. No CAA/NS record types.',
    scenarios: [{ name: 'example.com (sample)', render: () => <Dns /> }],
  }),
  defineStory({
    id: 'billing',
    title: 'InvoiceSummary and SubscriptionActions',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'Invoice detail with pay and download; plan summary with change, update payment and cancel.',
    source: 'Fortless Views.html: billing list; invoice detail is new',
    variants: ['paid', 'due', 'past due', 'cancel scheduled'],
    props: ['InvoiceSummary: invoice, onPay, onDownload', 'SubscriptionActions: subscription, handlers'],
    a11y: 'Invoice lines are a real table with caption. Cancel uses AlertDialog.',
    responsive: 'Actions wrap under the title.',
    status: 'partial',
    gaps: 'No payment form (the app opens the payment provider). Amounts must arrive formatted.',
    scenarios: [
      { name: 'Invoice due', note: SAMPLE_NOTE, render: () => <InvoiceSummary invoice={{ number: 'INV-1042', state: 'open', issued: 'Mar 1, 2025', due: 'Mar 15, 2025', total: '€11.00', lines: [{ id: '1', description: 'Standard 4 GB, March', amount: '€11.00' }] }} onPay={() => {}} onDownload={() => {}} /> },
      { name: 'Past-due subscription', render: () => <SubscriptionActions subscription={{ id: 's', planName: 'Standard 4 GB', price: '€11.00 / month', renewsOn: 'Apr 1', state: 'past-due', paymentMethod: 'Visa ending 4242' }} onChangePlan={() => {}} onUpdatePayment={() => {}} onCancel={async () => wait()} onResume={async () => wait()} /> },
      { name: 'Cancel scheduled', render: () => <SubscriptionActions subscription={{ id: 's', planName: 'Standard 4 GB', price: '€11.00 / month', endsOn: 'Apr 1', state: 'cancel-scheduled' }} onChangePlan={() => {}} onUpdatePayment={() => {}} onCancel={async () => wait()} onResume={async () => wait()} /> },
    ],
  }),
  defineStory({
    id: 'ticket-conversation',
    title: 'TicketConversation',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'Support thread with reply and attachments.',
    source: 'Fortless Views.html: ticket view',
    variants: ['open', 'closed'],
    props: ['subject, state, messages', 'onReply(body, files)', 'onClose?'],
    a11y: 'Messages are an ordered list; reply errors attach to the field.',
    responsive: 'Bubbles cap at 92% width.',
    status: 'partial',
    gaps: 'Attachments are selected but upload progress is not wired. Messages are plain text only.',
    scenarios: [{ name: 'Open ticket (sample)', render: () => <TicketConversation subject="Server will not start" state="answered" onReply={async () => wait()} onClose={async () => wait()} messages={[{ id: '1', author: 'Alex', fromStaff: false, time: '10:02', body: 'My server stops right after starting.' }, { id: '2', author: 'Sam', fromStaff: true, time: '10:20', body: 'Thanks. Could you share the last lines of the console?' }]} /> }, { name: 'Closed', render: () => <TicketConversation subject="Old question" state="closed" onReply={async () => {}} messages={[]} /> }],
  }),
  defineStory({
    id: 'discord-bot-setup',
    title: 'DiscordBotSetup',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'Write-only token and gateway intents for a hosted bot.',
    source: 'new',
    variants: ['no token', 'token saved', 'connected'],
    props: ['hasToken, connected', 'config', 'onReplaceToken, onSaveConfig'],
    a11y: 'See SecretField and Checkbox.',
    responsive: 'Single column.',
    status: 'partial',
    gaps: 'No invite-link generator or slash command list.',
    scenarios: [{ name: 'Token saved', render: () => <DiscordBotSetup hasToken config={{ intents: { guildMembers: true, messageContent: false, presence: false } }} onReplaceToken={async () => wait()} onSaveConfig={async () => wait()} /> }],
  }),
  defineStory({
    id: 'status-map',
    title: 'Domain status mapping',
    category: 'Hosting compositions',
    layer: 'C: Fortless',
    purpose: 'One place where server, invoice, domain, ticket and job states become badge tone and label.',
    source: 'features/status.ts',
    variants: ['server', 'invoice', 'domain', 'ticket', 'job'],
    props: ['serverStatus, invoiceStatus, domainStatus, ticketStatus, jobStatus'],
    a11y: 'Every state has a text label; color is never the only signal.',
    responsive: 'n/a',
    status: 'implemented',
    scenarios: [{ name: 'All states', render: () => <div className="grid gap-4">{([['Server', serverStatus], ['Invoice', invoiceStatus], ['Domain', domainStatus], ['Ticket', ticketStatus], ['Job', jobStatus]] as const).map(([n, m]) => <div key={n} className="flex flex-wrap items-center gap-2"><b className="w-20">{n}</b>{Object.entries(m).map(([k, v]) => <StatusBadge key={k} tone={v.tone} live={'live' in v ? v.live : false}>{v.label}</StatusBadge>)}</div>)}</div> }],
  }),
];
