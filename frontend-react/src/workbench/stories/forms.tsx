import { useState } from 'react';
import { defineStory } from '../types';
import {
  TextField, Textarea, SearchField, PasswordField, SecretField, NumberField, NumberStepper, SliderField, Select, SearchableSelect, MultiSelect, Checkbox, CheckboxGroup,
  RadioGroup, RadioCardGroup, Switch, TagInput, KeyValueEditor, EnvironmentVariableEditor, Dropzone, DateField, TimeField, DatePicker, DateRangePicker, DateTimePicker, toIso, type DateRange, FieldGroup, Button, type Option, type KeyValueRow,
} from '@/design-system';
import { Row, Stack, Surface, Cap } from '../layout';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const LOCATIONS: Option[] = [
  { value: 'fra', label: 'Frankfurt', description: 'Germany · 12 ms', group: 'Europe' },
  { value: 'ams', label: 'Amsterdam', description: 'Netherlands · 14 ms', group: 'Europe' },
  { value: 'buc', label: 'Bucharest', description: 'Romania · 6 ms', group: 'Europe' },
  { value: 'lon', label: 'London', description: 'United Kingdom · 18 ms', group: 'Europe' },
  { value: 'nyc', label: 'New York', description: 'United States · 98 ms', group: 'North America' },
  { value: 'chi', label: 'Chicago', description: 'United States · 112 ms', group: 'North America' },
  { value: 'sgp', label: 'Singapore', description: 'Singapore · 190 ms', group: 'Asia' },
];
const VERSIONS: Option[] = ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.19.4', '1.18.2', '1.16.5'].map((v) => ({ value: v, label: v, description: v === '1.21.4' ? 'Latest' : undefined }));
const PEOPLE: Option[] = ['Alex Morgan', 'Mira Costa', 'Dan Ionescu', 'Ana Pop', 'Chris Lee', 'Ioana Marin', 'Tudor Stan'].map((n) => ({ value: n.toLowerCase().replace(' ', '.'), label: n, description: `${n.toLowerCase().replace(' ', '.')}@example.com` }));

export const formStories = [
  defineStory({
    id: 'text-fields',
    title: 'TextField, Textarea, SearchField, PasswordField',
    category: 'Forms',
    layer: 'A: primitive',
    purpose: 'Text entry with label, description, error, prefix/suffix and units, in one consistent control surface.',
    source: 'Fortless Views.html: .inp, .fld, password with eye, search',
    variants: ['default', 'with icon', 'prefix / suffix', 'error', 'disabled', 'readOnly', 'textarea with counter', 'search with clear', 'password with reveal'],
    props: ['label (required)', 'description', 'error', 'prefix / suffix / leadingIcon', 'size', 'hideLabel'],
    a11y: 'Label is always present (hideLabel keeps it for screen readers). Description is read with the control. Error is announced and sets aria-invalid. 16px text on touch widths prevents iOS zoom.',
    responsive: 'Full width; sizes follow control tokens. Prefix and suffix never wrap.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Basics',
        render: function Demo() {
          const [q, setQ] = useState('');
          return (
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Server name" description="Shown in your list. You can rename it later." placeholder="Survival world" />
              <TextField label="Server address" prefix="https://" suffix=".fortless.net" placeholder="my-server" />
              <TextField label="Email address" leadingIcon="mail-01" type="email" error="Enter a valid email address." defaultValue="alex@" />
              <TextField label="Region" disabled defaultValue="Frankfurt" />
              <TextField label="Server ID" readOnly defaultValue="srv_8f2a91c4" />
              <SearchField value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Search servers" />
              <PasswordField label="New password" autoComplete="new-password" description="At least 12 characters." />
              <Textarea label="MOTD" counter maxLength={120} defaultValue="Welcome to the survival server" description="Shown in the multiplayer list." />
            </div>
          );
        },
      },
    ],
  }),
  defineStory({
    id: 'secret-field',
    title: 'SecretField',
    category: 'Forms',
    layer: 'A: primitive',
    purpose: 'A secret the user can reveal, copy or replace. The plain value is not in the DOM until revealed and is masked again after a timeout.',
    source: 'new, from the prompt (5.2: copy/reveal for secrets)',
    variants: ['server-side only (fetch on reveal)', 'client-held', 'replace', 'reveal fails'],
    props: ['value?', 'onReveal?: () => Promise<string>', 'onReplace?', 'autoHideMs'],
    a11y: 'Reveal is a toggle button with aria-pressed. Copy result is announced. Failures are shown inline, not swallowed.',
    responsive: 'Actions stay on one row; the value truncates.',
    status: 'implemented',
    scenarios: [
      { name: 'Fetched on reveal', render: () => <div className="max-w-xl"><SecretField label="Discord bot token" description="Stored encrypted on the server." onReveal={async () => { await wait(500); return 'MTIzNDU2.Gx9aBc.fake-token-for-demo'; }} onReplace={async () => wait(400)} /></div> },
      { name: 'Not retrievable', note: 'No value and no onReveal (for example a key shown once): Reveal and Copy are removed.', render: () => <div className="max-w-xl"><SecretField label="Deploy key" unavailableReason="Shown once when it was created." /></div> },
      { name: 'Slow reveal', note: 'Takes 3 s. Click the button again to cancel; a late answer is dropped.', render: () => <div className="max-w-xl"><SecretField label="Webhook secret" onReveal={async () => { await wait(3000); return 'whsec_sample_value'; }} /></div> },
      { name: 'Reveal fails', render: () => <div className="max-w-xl"><SecretField label="API key" onReveal={async () => { await wait(300); throw new Error('Could not decrypt this value. Try again.'); }} /></div> },
    ],
  }),
  defineStory({
    id: 'number-fields',
    title: 'NumberField and NumberStepper',
    category: 'Forms',
    layer: 'A: primitive',
    purpose: 'Numbers with bounds, units and safe stepping. Max players, memory, TTL.',
    source: 'new, from the prompt (5.2: Minecraft max players)',
    variants: ['inline steppers', 'split stepper', 'unit suffix', 'formatted', 'error', 'disabled'],
    props: ['value / defaultValue / onValueChange', 'min / max / step / largeStep', 'unit', 'format', 'steppers: none | inline | split'],
    a11y: 'Native input semantics with spinbutton behavior: arrows step, Shift steps by largeStep, Home and End jump to bounds. Values are clamped on blur; buttons have names.',
    responsive: 'Split stepper has 44px buttons for touch. Input text is 16px on phones.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Minecraft settings',
        render: function Demo() {
          const [max, setMax] = useState<number | null>(20);
          return (
            <div className="grid gap-4 md:grid-cols-2">
              <NumberStepper label="Max players" min={1} max={100} step={1} largeStep={10} value={max} onValueChange={setMax} description={`Plan limit is 100. Current: ${max ?? 'not set'}`} />
              <NumberField label="View distance" unit="chunks" min={2} max={32} defaultValue={10} />
              <NumberField label="Memory" unit="MB" min={512} max={8192} step={256} defaultValue={2048} format={{ useGrouping: true }} />
              <NumberField label="TTL" unit="seconds" min={60} max={86400} defaultValue={3600} error="TTL must be between 60 and 86400." />
              <NumberField label="Locked value" defaultValue={42} disabled />
              <NumberField label="No steppers" steppers="none" defaultValue={5} />
            </div>
          );
        },
      },
    ],
  }),
  defineStory({
    id: 'slider-field',
    title: 'SliderField',
    category: 'Forms',
    layer: 'A: primitive',
    purpose: 'A value where relative position matters more than the exact number.',
    source: 'new, from the prompt (5.2)',
    variants: ['default', 'formatted value', 'disabled'],
    props: ['value / defaultValue / onValueChange', 'min / max / step', 'formatValue'],
    a11y: 'Thumb is a slider with value and range announced; arrow keys, Home, End, PageUp and PageDown work.',
    responsive: 'Track height is the touch target (44px).',
    status: 'implemented',
    scenarios: [{ name: 'Slider', render: () => <div className="grid max-w-md gap-4"><SliderField label="Simulation distance" min={2} max={32} defaultValue={8} formatValue={(v) => `${v} chunks`} /><SliderField label="Locked" defaultValue={40} disabled /></div> }],
  }),
  defineStory({
    id: 'select',
    title: 'Select (and GroupedSelect)',
    category: 'Forms',
    layer: 'A: primitive',
    purpose: 'Pick one from a known list of up to about 15 options. Options with a group render under headings.',
    source: 'Fortless Views.html: .sel',
    variants: ['flat', 'grouped', 'placeholder', 'error', 'disabled', 'with descriptions'],
    props: ['options: Option[]', 'value / defaultValue / onValueChange', 'placeholder', 'size'],
    a11y: 'Base UI select: Enter/Space/ArrowDown opens, arrows move, typeahead jumps, Escape closes and restores focus.',
    responsive: 'Popup matches trigger width and collides with the viewport.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Select',
        render: () => (
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Billing cycle" options={[{ value: 'm', label: 'Monthly' }, { value: 'q', label: 'Quarterly' }, { value: 'y', label: 'Yearly', description: 'Save 15%' }]} defaultValue="m" />
            <Select label="Location (grouped)" options={LOCATIONS} placeholder="Choose a location" />
            <Select label="Record type" error="Choose a record type." options={['A', 'AAAA', 'CNAME', 'MX', 'TXT'].map((v) => ({ value: v, label: v }))} />
            <Select label="Locked" disabled defaultValue="a" options={[{ value: 'a', label: 'Not editable' }]} />
          </div>
        ),
      },
    ],
  }),
  defineStory({
    id: 'combobox',
    title: 'SearchableSelect, MultiSelect, AsyncSelect, Creatable',
    category: 'Forms',
    layer: 'B: composition',
    purpose: 'Type-to-filter pickers: single and multiple, server-side search, and creating a missing option. For long lists such as locations, versions, users and domains.',
    source: 'new, from the prompt (5.2)',
    variants: ['single', 'multiple with chips', 'grouped', 'async with loading / error / no results', 'creatable', 'max selections', 'clearable'],
    props: ['options', 'value / onValueChange', 'loadOptions(query, signal)', 'onCreate(label)', 'max (multi)', 'clearable', 'emptyText'],
    a11y: 'Combobox semantics from Base UI: arrows move through the list, Enter selects, Escape closes, chips are focusable and removable with Backspace/Delete. Loading and errors are announced via the status region.',
    responsive: 'Popup width follows the input and scrolls when taller than the space available. 16px input on phones.',
    status: 'implemented',
    gaps: 'Virtualization for lists over a few thousand options is not wired in yet.',
    scenarios: [
      {
        name: 'Single and grouped',
        render: function Demo() {
          const [v, setV] = useState<string | null>('1.21.4');
          const [l, setL] = useState<string | null>(null);
          return (
            <div className="grid gap-4 md:grid-cols-2">
              <SearchableSelect label="Minecraft version" options={VERSIONS} value={v} onValueChange={(x) => setV(x)} />
              <SearchableSelect label="Location (grouped)" options={LOCATIONS} value={l} onValueChange={(x) => setL(x)} placeholder="Search locations" />
            </div>
          );
        },
      },
      {
        name: 'Multiple',
        render: function Demo() {
          const [v, setV] = useState<string[]>(['alex.morgan']);
          return <div className="max-w-xl"><MultiSelect label="Team members" description="Up to 3 people" options={PEOPLE} value={v} onValueChange={(x) => setV(x)} max={3} placeholder="Add people" /></div>;
        },
      },
      {
        name: 'Async search',
        note: 'Simulated server: 400 ms delay, and searching "error" fails.',
        render: function Demo() {
          const [v, setV] = useState<string | null>(null);
          return (
            <div className="max-w-xl">
              <SearchableSelect
                label="Domain"
                placeholder="Search your domains"
                value={v}
                onValueChange={(x) => setV(x)}
                loadOptions={async (q, signal) => {
                  await wait(400);
                  if (signal.aborted) return [];
                  if (q === 'error') throw new Error('Search failed. Try again.');
                  return ['fortless.net', 'morganhosting.dev', 'play.example.com', 'bots.example.org'].filter((d) => d.includes(q.toLowerCase())).map((d) => ({ value: d, label: d }));
                }}
              />
            </div>
          );
        },
      },
      {
        name: 'Creatable',
        render: function Demo() {
          const [opts, setOpts] = useState<Option[]>([{ value: 'survival', label: 'survival' }, { value: 'creative', label: 'creative' }]);
          const [v, setV] = useState<string[]>([]);
          return <div className="max-w-xl"><MultiSelect label="Labels" options={opts} value={v} onValueChange={(x) => setV(x)} onCreate={(label) => { const o = { value: label, label }; setOpts((p) => [...p, o]); return o; }} /></div>;
        },
      },
    ],
  }),
  defineStory({
    id: 'choice-controls',
    title: 'Checkbox, RadioGroup, RadioCardGroup, Switch',
    category: 'Forms',
    layer: 'A: primitive',
    purpose: 'Boolean and one-of-few choices. Cards for choices that need explanation (software, plan, region).',
    source: 'Fortless Views.html: .sw, checkboxes, plan and software cards',
    variants: ['checkbox / indeterminate / group', 'radio inline / stacked', 'radio cards (1 to 4 columns)', 'switch with description', 'disabled', 'error'],
    props: ['label / description', 'options: ChoiceOption[]', 'value / onValueChange', 'error'],
    a11y: 'Real checkbox, radio and switch semantics. Groups are fieldsets with legends. Radio cards use radiogroup keyboard behavior. 44px hit areas.',
    responsive: 'Cards stack to one column on phones.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Checkbox and switch',
        render: () => (
          <div className="grid gap-4 md:grid-cols-2">
            <Surface><CheckboxGroup legend="Notify me about" options={[{ value: 'tickets', label: 'Ticket replies' }, { value: 'invoices', label: 'New invoices', description: 'Sent by email' }, { value: 'status', label: 'Status incidents', disabled: true }]} defaultValue={['tickets']} /></Surface>
            <Surface><Switch label="Auto-restart on crash" description="Restart the server if it stops unexpectedly." defaultChecked /><Switch label="Maintenance mode" description="Blocks new connections." /><Switch label="Locked setting" disabled /><Checkbox label="I accept the terms" error="You need to accept to continue." /></Surface>
          </div>
        ),
      },
      {
        name: 'Radio and radio cards',
        render: function Demo() {
          const [soft, setSoft] = useState('paper');
          return (
            <Stack gap={6}>
              <RadioGroup legend="Difficulty" options={[{ value: 'peaceful', label: 'Peaceful' }, { value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }]} defaultValue="normal" inline />
              <RadioCardGroup legend="Server software" columns={3} value={soft} onValueChange={setSoft} options={[
                { value: 'paper', label: 'Paper', description: 'Fast, plugin support', icon: 'flash', meta: 'Recommended' },
                { value: 'vanilla', label: 'Vanilla', description: 'Official, no plugins', icon: 'cpu' },
                { value: 'fabric', label: 'Fabric', description: 'Lightweight mods', icon: 'layers-01' },
              ]} />
              <Cap>Selected: {soft}</Cap>
            </Stack>
          );
        },
      },
    ],
  }),
  defineStory({
    id: 'tag-input',
    title: 'TagInput',
    category: 'Forms',
    layer: 'A: primitive',
    purpose: 'Free-form list of short values: allowed IPs, whitelisted players.',
    source: 'new, from the prompt (5.2)',
    variants: ['default', 'validated', 'max items', 'paste multiple'],
    props: ['value / onValueChange', 'validate(tag, current)', 'max', 'separators'],
    a11y: 'Add and remove are announced in a polite live region. Chips have named remove buttons; Backspace on an empty input removes the last chip.',
    responsive: 'Chips wrap; the input keeps a 28px minimum width.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Allowed IPs',
        render: function Demo() {
          const [v, setV] = useState<string[]>(['203.0.113.7']);
          return <div className="max-w-xl"><TagInput label="Allowed IP addresses" description="Paste a comma-separated list to add several." value={v} onValueChange={setV} max={8} validate={(t) => (/^(\d{1,3}\.){3}\d{1,3}$/.test(t) ? null : `"${t}" is not a valid IPv4 address.`)} /></div>;
        },
      },
    ],
  }),
  defineStory({
    id: 'key-value',
    title: 'KeyValueEditor and EnvironmentVariableEditor',
    category: 'Forms',
    layer: 'B: composition',
    purpose: 'Structured editable rows. Environment variables get name rules, duplicate and reserved-name checks, secret masking and .env paste.',
    source: 'new, from the prompt (5.2: environment variables)',
    variants: ['key/value', 'environment variables', 'secret rows', 'reserved keys', 'paste .env'],
    props: ['rows / onRowsChange', 'validateKey / validateValue', 'allowSecret', 'reservedKeys', 'pasteLines', 'maxRows'],
    a11y: 'Every input has an indexed accessible name. Errors are linked with aria-describedby. On narrow screens each row becomes a card instead of squeezing two inputs.',
    responsive: 'Two columns plus actions from md; stacked cards below.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Environment variables',
        note: 'Try pasting "NODE_ENV=production" lines into a name field.',
        render: function Demo() {
          const [rows, setRows] = useState<KeyValueRow[]>([
            { id: 'a', key: 'DISCORD_TOKEN', value: 'abc123secret', secret: true },
            { id: 'b', key: 'NODE_ENV', value: 'production' },
            { id: 'c', key: 'PORT', value: '3000' },
          ]);
          return <div className="max-w-3xl"><EnvironmentVariableEditor legend="Environment variables" description="Available to your app at runtime." rows={rows} onRowsChange={setRows} reservedKeys={['PORT']} /></div>;
        },
      },
      {
        name: 'Plain key/value',
        render: function Demo() {
          const [rows, setRows] = useState<KeyValueRow[]>([{ id: 'x', key: 'motd', value: 'Welcome' }]);
          return <div className="max-w-3xl"><KeyValueEditor legend="Server properties" rows={rows} onRowsChange={setRows} /></div>;
        },
      },
    ],
  }),
  defineStory({
    id: 'dropzone-date',
    title: 'Dropzone, DateField, TimeField, FieldGroup',
    category: 'Forms',
    layer: 'A: primitive',
    purpose: 'File input with drag and drop plus a real button, native date and time controls, a calendar picker with date ranges and presets, and fieldset grouping.',
    source: 'new, from the prompt (5.2)',
    variants: ['dropzone single / multiple', 'type and size rejection', 'date', 'time', 'calendar date picker', 'date range with presets'],
    props: ['Dropzone: accept, maxSizeBytes, multiple, onFiles, onReject', 'DateField / TimeField: label, error', 'DatePicker: value (YYYY-MM-DD), onValueChange, min, max', 'DateRangePicker: value {start,end}, presets'],
    a11y: 'Dropzone is operable without drag: the button opens the file picker. Rejections appear as an alert list. DateField and TimeField use native pickers; DatePicker is a dialog-less popover with a role=grid calendar, full spoken dates, roving focus and min/max.',
    responsive: 'Full width; the button is 34px+ and keeps a 44px hit area through padding on touch.',
    status: 'partial',
    gaps: 'TimePicker is 24-hour only; TimeField stays native for simple forms. Calendar is Gregorian only, week starts Monday unless set, and has no multi-month view. Not yet checked on a real touch device.',
    scenarios: [
      {
        name: 'Dropzone',
        render: function Demo() {
          const [names, setNames] = useState<string[]>([]);
          return <div className="max-w-xl"><Dropzone label="Upload a plugin" description="Accepted: .jar, up to 5 MB." accept=".jar" maxSizeBytes={5 * 1024 * 1024} multiple onFiles={(f) => setNames(f.map((x) => x.name))} />{names.length ? <p className="mt-2 text-ink2">Added: {names.join(', ')}</p> : null}</div>;
        },
      },
      {
        name: 'Calendar date picker',
        note: 'Arrows move by day and week, PageUp/PageDown by month, Shift for a year. Past days are disabled here.',
        render: function Demo() {
          const [d, setD] = useState<string | null>(null);
          return <div className="max-w-xs"><DatePicker label="Start date" value={d} onValueChange={setD} min={toIso(new Date())} /></div>;
        },
      },
      {
        name: 'Date range with presets',
        render: function Demo() {
          const [r, setR] = useState<DateRange>({ start: null, end: null });
          return <div className="max-w-sm"><DateRangePicker label="Report period" value={r} onValueChange={setR} /></div>;
        },
      },
      {
        name: 'Date and time picker',
        note: 'One value (YYYY-MM-DDTHH:mm) with the time zone stated.',
        render: function Demo() {
          const [v, setV] = useState<string | null>(null);
          return <div className="max-w-md grid gap-4"><DateTimePicker legend="Schedule" value={v} onValueChange={setV} min={toIso(new Date())} /><Row><Button variant="primary" disabled={!v}>Save schedule</Button></Row></div>;
        },
      },
      { name: 'Native date and time', note: 'The platform controls, for simple forms.', render: () => <FieldGroup legend="Schedule" description="Runs in your timezone."><div className="grid gap-4 md:grid-cols-2"><DateField label="Date" /><TimeField label="Time" /></div><Row><Button variant="primary">Save schedule</Button></Row></FieldGroup> },
    ],
  }),
];
