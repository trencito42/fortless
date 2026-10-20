import { useState } from 'react';
import { defineStory } from '../types';
import {
  CommandButton, RevealButton, CheckboxCardGroup, ValidationSummary, ChartLegend, ChartFrame, TimeSeriesChart, FilterBuilder, applyFilters, DataTable, TextField, Button,
  type FilterField, type FilterRule, type ColumnDef, type ValidationIssue,
} from '@/design-system';
import { AuditTrail, type AuditEvent } from '@/features';

const wait = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));

function ValidationDemo() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const submit = () => {
    const next: ValidationIssue[] = [];
    if (name.trim().length < 3) next.push({ fieldId: 'vs-name', label: 'Name', message: 'use at least 3 characters.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) next.push({ fieldId: 'vs-email', label: 'Email', message: 'enter a valid address.' });
    setIssues(next);
  };
  return (
    <div className="grid max-w-md gap-3">
      <ValidationSummary issues={issues} />
      <TextField id="vs-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} error={issues.find((i) => i.fieldId === 'vs-name')?.message} />
      <TextField id="vs-email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} error={issues.find((i) => i.fieldId === 'vs-email')?.message} />
      <Button variant="primary" onClick={submit}>Save</Button>
    </div>
  );
}

const LEGEND_DATA = Array.from({ length: 24 }, (_, i) => ({ t: `${String(i).padStart(2, '0')}:00`, cpu: Math.round(40 + Math.sin(i / 3) * 25), ram: Math.round(55 + Math.cos(i / 4) * 15), net: Math.round(20 + Math.sin(i / 2) * 10) }));
function LegendDemo() {
  const series = [{ key: 'cpu', label: 'CPU' }, { key: 'ram', label: 'RAM' }, { key: 'net', label: 'Network' }];
  const [hidden, setHidden] = useState<string[]>([]);
  const last = LEGEND_DATA[LEGEND_DATA.length - 1]!;
  return (
    <ChartFrame title="Resource usage" description="Sample data, not a real server" summary="CPU, RAM and network usage over 24 hours, sample data" actions={<ChartLegend series={series} hidden={hidden} onHiddenChange={setHidden} values={{ cpu: `${last.cpu}%`, ram: `${last.ram}%`, net: `${last.net}%` }} />}>
      <TimeSeriesChart kind="line" data={LEGEND_DATA} xKey="t" series={series} hidden={hidden} formatY={(v) => `${v}%`} domain={[0, 100]} />
    </ChartFrame>
  );
}

interface Svc { id: string; name: string; game: string; ram: number; status: string }
const SVCS: Svc[] = [
  { id: '1', name: 'survival-eu', game: 'Minecraft', ram: 4, status: 'running' }, { id: '2', name: 'creative-hub', game: 'Minecraft', ram: 2, status: 'stopped' },
  { id: '3', name: 'discord-helper', game: 'Node.js bot', ram: 1, status: 'running' }, { id: '4', name: 'rust-wipe', game: 'Rust', ram: 8, status: 'installing' },
  { id: '5', name: 'modded-pack', game: 'Minecraft', ram: 6, status: 'stopped' }, { id: '6', name: 'api-gateway', game: 'Node.js app', ram: 1, status: 'running' },
];
const FIELDS: FilterField[] = [
  { id: 'name', label: 'Name', type: 'text' }, { id: 'ram', label: 'RAM (GB)', type: 'number' },
  { id: 'status', label: 'Status', type: 'select', options: [{ value: 'running', label: 'Running' }, { value: 'stopped', label: 'Stopped' }, { value: 'installing', label: 'Installing' }] },
];
const COLS: ColumnDef<Svc, unknown>[] = [
  { accessorKey: 'name', header: 'Name', meta: { primary: true } }, { accessorKey: 'game', header: 'Product' }, { accessorKey: 'ram', header: 'RAM (GB)', meta: { numeric: true } }, { accessorKey: 'status', header: 'Status' },
];
function FilterDemo() {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const rows = applyFilters(SVCS, rules, FIELDS, (r, f) => r[f as keyof Svc]);
  return (
    <div className="grid gap-4">
      <FilterBuilder fields={FIELDS} rules={rules} onRulesChange={setRules} />
      <p role="status" className="text-[13px] font-semibold text-ink3">{rows.length} of {SVCS.length} services (sample data)</p>
      <DataTable data={rows} columns={COLS} getRowId={(r) => r.id} caption="Filtered services" pageSize={6} empty={{ title: 'No services match', description: 'Remove a filter to see more.' }} />
    </div>
  );
}

const AUDIT: AuditEvent[] = [
  { id: 'evt_1', at: '2026-10-16T09:12:00Z', actor: 'stefan', action: 'Server restarted', target: 'survival-eu', outcome: 'success', ip: '203.0.113.7' },
  { id: 'evt_2', at: '2026-10-16T08:40:00Z', actor: 'stefan', action: 'Password changed', target: 'account', outcome: 'success', ip: '203.0.113.7', details: [{ label: 'Method', value: 'Settings → Security' }] },
  { id: 'evt_3', at: '2026-10-15T21:03:00Z', actor: 'mara', action: 'Login', target: 'account', outcome: 'failed', ip: '198.51.100.20', details: [{ label: 'Reason', value: 'Wrong authenticator code' }] },
  { id: 'evt_4', at: '2026-10-15T18:22:00Z', actor: 'mara', action: 'Backup created', target: 'creative-hub', outcome: 'success' },
  { id: 'evt_5', at: '2026-10-14T12:00:00Z', actor: 'stefan', action: 'API key created', target: 'deploy-bot', outcome: 'success', ip: '203.0.113.7' },
  { id: 'evt_6', at: '2026-10-14T11:41:00Z', actor: 'stefan', action: 'Domain renewed', target: 'example.com', outcome: 'failed', ip: '203.0.113.7', details: [{ label: 'Reason', value: 'Card declined' }] },
];

export const advancedStories = [
  defineStory({
    id: 'command-button', title: 'CommandButton', category: 'Actions', layer: 'A: primitive',
    purpose: 'A shell command that copies itself on click: install snippets, connection strings. Long commands wrap.',
    source: 'new (selective idea from evilbuttons.com: one-click copy with clear confirmation, without the effects)',
    variants: ['default', 'no prompt', 'long command', 'copy blocked'],
    props: ['command', 'label?', 'prompt?', 'onCopied / onError'],
    a11y: 'Real button named "Copy command: <command>". Result is announced through a polite status ("Copied" / "Copy failed"). Focus ring is visible on the dark surface.',
    responsive: 'Full width; long commands wrap inside the button (break-all), so there is no horizontal scroll.',
    status: 'implemented',
    scenarios: [
      { name: 'Install command', render: () => <CommandButton command="curl -fsSL https://example.com/install.sh | sh" /> },
      { name: 'Without prompt', render: () => <CommandButton prompt={false} command="sftp://user.abcd1234@node-fra.example.net:2022" label="Copy SFTP address" /> },
      { name: 'Long command', render: () => <CommandButton command="java -Xms2G -Xmx4G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -jar server.jar nogui --port 25565 --world survival" /> },
    ],
  }),
  defineStory({
    id: 'reveal-button', title: 'RevealButton', category: 'Actions', layer: 'A: primitive',
    purpose: 'Show a value on demand and hide it again after a timeout. Not for credentials (use SecretField).',
    source: 'new',
    variants: ['static value', 'fetched on reveal', 'fetch fails', 'auto-hide'],
    props: ['what', 'value: string | () => Promise<string>', 'autoHideMs', 'placeholder'],
    a11y: 'aria-expanded and aria-controls point at the value output. The value is not in the DOM while hidden. Failure is an alert.',
    responsive: 'Wraps; long values break instead of overflowing.',
    status: 'implemented',
    scenarios: [
      { name: 'Static value', render: () => <RevealButton what="server address" value="203.0.113.42:25565" /> },
      { name: 'Fetched on reveal', render: () => <RevealButton what="billing email" value={async () => { await wait(500); return 'billing@example.com'; }} autoHideMs={5000} /> },
      { name: 'Fetch fails', render: () => <RevealButton what="IP address" value={async () => { await wait(400); throw new Error('Could not load the IP address.'); }} /> },
    ],
  }),
  defineStory({
    id: 'checkbox-card-group', title: 'CheckboxCardGroup', category: 'Forms', layer: 'A: primitive',
    purpose: 'Multi-select cards for addons, channels and modes. Counterpart of RadioCardGroup.',
    source: 'new',
    variants: ['2 columns', 'with icons and prices', 'disabled option', 'error'],
    props: ['legend, description', 'options: {value,label,description,icon,meta,disabled}', 'value / onValueChange', 'columns', 'error'],
    a11y: 'Checkbox group inside a fieldset with a legend. Space toggles; the description is read with the option.',
    responsive: 'One column on phones, then 2-4.',
    status: 'implemented',
    scenarios: [
      { name: 'Addons', render: function Addons() { const [v, setV] = useState<string[]>(['backups']); return <CheckboxCardGroup legend="Addons" description="You can change these later." value={v} onValueChange={setV} options={[{ value: 'backups', label: 'Daily backups', description: 'Kept for 7 days', icon: 'cloud-upload', meta: '€1.00' }, { value: 'ddos', label: 'Extra DDoS filtering', description: 'Layer 7 rules', icon: 'shield-01', meta: '€2.00' }, { value: 'ip', label: 'Dedicated IP', description: 'Not available in this region', icon: 'globe-02', disabled: true }]} />; } },
      { name: 'Error', render: () => <CheckboxCardGroup legend="Notify me by" options={[{ value: 'email', label: 'Email' }, { value: 'discord', label: 'Discord' }]} defaultValue={[]} error="Choose at least one channel." /> },
    ],
  }),
  defineStory({
    id: 'validation-summary', title: 'ValidationSummary', category: 'Forms', layer: 'B: composition',
    purpose: 'List of everything blocking a form, each linking to its field. Focus moves to it when it appears.',
    source: 'new',
    variants: ['one issue', 'many issues', 'issue without field'],
    props: ['issues: {fieldId?, label, message}[]', 'title?', 'autoFocus?'],
    a11y: 'role="alert" container receives focus; each item is a link that focuses the invalid control.',
    responsive: 'Full width of the form.',
    status: 'implemented',
    scenarios: [{ name: 'Submit an empty form', render: () => <ValidationDemo /> }],
  }),
  defineStory({
    id: 'chart-legend', title: 'ChartLegend', category: 'Charts', layer: 'B: composition',
    purpose: 'Interactive legend: toggle series on and off, show latest values. The last visible series cannot be hidden.',
    source: 'new',
    variants: ['toggle series', 'latest values'],
    props: ['series', 'hidden / onHiddenChange', 'values?'],
    a11y: 'Each series is a toggle button (aria-pressed). Color is never the only cue: hidden series are struck through.',
    responsive: 'Wraps under the title.',
    status: 'implemented',
    scenarios: [{ name: 'CPU, RAM, Network (sample)', render: () => <LegendDemo /> }],
  }),
  defineStory({
    id: 'filter-builder', title: 'FilterBuilder', category: 'Data display', layer: 'B: composition',
    purpose: 'Field / operator / value rules combined with AND. applyFilters runs them on loaded rows, or send the rules to an API.',
    source: 'new',
    variants: ['text, number, select fields', 'incomplete rule ignored', 'limit reached'],
    props: ['fields', 'rules / onRulesChange', 'max?', 'applyFilters(rows, rules, fields, getValue)'],
    a11y: 'Every control has a name like "Filter 2 operator". Remove buttons are named per rule. Active count is a status.',
    responsive: 'Rules stack on phones, four columns from sm.',
    status: 'implemented',
    scenarios: [{ name: 'Services (sample data)', render: () => <FilterDemo /> }],
  }),
  defineStory({
    id: 'audit-trail', title: 'AuditTrail', category: 'Hosting compositions', layer: 'C: Fortless',
    purpose: 'Filterable, searchable activity log with expandable details.',
    source: 'Fortless Activity page (screenshot)',
    variants: ['default', 'loading', 'error', 'empty'],
    props: ['events', 'loading', 'error / onRetry'],
    a11y: 'Table with caption; expand buttons carry aria-expanded and name the event; filters are labelled.',
    responsive: 'Cards below md; expanded details sit inside the card.',
    status: 'partial',
    gaps: 'Filtering and search are client-side on the loaded page of events; server-side filtering needs the caller to use FilterBuilder rules itself.',
    scenarios: [
      { name: 'Events (sample)', render: () => <AuditTrail events={AUDIT} /> },
      { name: 'Loading', render: () => <AuditTrail events={[]} loading /> },
      { name: 'Error', render: () => <AuditTrail events={[]} error="The activity service did not respond." onRetry={() => {}} /> },
      { name: 'Empty', render: () => <AuditTrail events={[]} /> },
    ],
  }),
];
