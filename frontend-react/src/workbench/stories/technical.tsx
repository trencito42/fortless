import { useEffect, useRef, useState } from 'react';
import { defineStory } from '../types';
import { ServerConsole, CodeEditor, DiffViewer, LogViewer, TaskProgress, DeploymentLog, FileUploadQueue, FileExplorer, FormWizard, TextField, Select, Dropzone, type ConsoleHandle, type UploadItem, type FileEntry, type LogLine } from '@/design-system';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const PROPS = `# Minecraft server properties (sample)
motd=Welcome to the server
max-players=20
difficulty=normal
online-mode=true
`;

function ConsoleDemo() {
  const ref = useRef<ConsoleHandle>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.writeln('[workbench] Simulated console. Commands are echoed locally; no server is connected.'), 400);
    return () => clearTimeout(t);
  }, []);
  return <ServerConsole ref={ref} onCommand={(c) => { ref.current?.writeln(`> ${c}`); ref.current?.writeln(`\x1b[33m[workbench] "${c}" was not sent anywhere.\x1b[0m`); }} />;
}

function EditorDemo() {
  const [v, setV] = useState(PROPS);
  return (
    <div className="grid gap-3">
      <CodeEditor value={v} onChange={setV} language="properties" label="server.properties" height={220} />
      <p className="text-[13px] text-ink3">{v === PROPS ? 'No changes' : 'Unsaved changes'}</p>
      {v !== PROPS ? <DiffViewer original={PROPS} modified={v} height={180} /> : null}
    </div>
  );
}

const LOG: LogLine[] = [
  { id: 1, time: '12:00:01', text: 'Starting build 42', level: 'info' }, { id: 2, time: '12:00:03', text: 'Installing dependencies', level: 'info' },
  { id: 3, time: '12:00:09', text: 'npm WARN deprecated left-pad@1.3.0', level: 'warn' }, { id: 4, time: '12:00:14', text: 'Compiling TypeScript', level: 'debug' },
  { id: 5, time: '12:00:20', text: 'Error: Cannot find module "./config"', level: 'error' },
];

function UploadDemo() {
  const [items, setItems] = useState<UploadItem[]>([
    { id: '1', name: 'EssentialsX.jar', size: 2200000, progress: 64, state: 'uploading' },
    { id: '2', name: 'world.zip', size: 88000000, progress: 0, state: 'queued' },
    { id: '3', name: 'notes.txt', size: 1200, progress: 100, state: 'done' },
    { id: '4', name: 'huge.bin', size: 900000000, progress: 12, state: 'failed', error: 'Connection lost' },
  ]);
  return <FileUploadQueue items={items} onCancel={(id) => setItems((l) => l.filter((i) => i.id !== id))} onRetry={(id) => setItems((l) => l.map((i) => (i.id === id ? { ...i, state: 'uploading', error: undefined } : i)))} onClearDone={() => setItems((l) => l.filter((i) => i.state !== 'done'))} />;
}

const TREE: Record<string, FileEntry[]> = {
  '': [{ name: 'plugins', kind: 'folder' }, { name: 'world', kind: 'folder' }, { name: 'server.properties', kind: 'file', size: 2048, modified: 'Today 10:42' }, { name: 'eula.txt', kind: 'file', size: 180, modified: 'Mar 2' }],
  plugins: [{ name: 'EssentialsX.jar', kind: 'file', size: 2200000, modified: 'Mar 4' }],
  world: [],
};
function ExplorerDemo() {
  const [path, setPath] = useState<string[]>([]);
  const [opened, setOpened] = useState('');
  return (
    <div className="grid gap-2">
      <FileExplorer path={path} entries={TREE[path.join('/')] ?? []} onNavigate={setPath} onOpenFile={(e) => setOpened(e.name)} actionsFor={(e) => [{ id: 'dl', label: `Download ${e.name}` }, { id: 'rn', label: 'Rename' }, { kind: 'separator', id: 's' }, { id: 'rm', label: 'Delete', tone: 'danger' }]} />
      {opened ? <p className="text-[13px] text-ink3">Would open: {opened}</p> : null}
    </div>
  );
}

interface Deploy { name: string; region: string; plan: string }
function WizardDemo({ failSubmit, persistKey }: { failSubmit?: boolean; persistKey?: string }) {
  const [v, setV] = useState<Deploy>({ name: '', region: 'fra', plan: '' });
  const [done, setDone] = useState(false);
  if (done) return <p className="rounded-lg bg-good-bg p-4 font-bold text-good">Submitted (sample, nothing was created).</p>;
  return (
    <FormWizard<Deploy>
      persistKey={persistKey}
      values={v}
      onChange={setV}
      submitLabel="Deploy"
      onCancel={() => setV({ name: '', region: 'fra', plan: '' })}
      onSubmit={async () => { await new Promise((r) => setTimeout(r, 600)); if (failSubmit) throw new Error('No capacity in Frankfurt right now. Pick another region.'); setDone(true); }}
      aside={(x) => <><p className="font-extrabold">Summary</p><dl className="grid gap-1 text-[14px]"><div className="flex justify-between"><dt className="text-ink3">Name</dt><dd className="font-bold">{x.name || '—'}</dd></div><div className="flex justify-between"><dt className="text-ink3">Region</dt><dd className="font-bold">{x.region}</dd></div><div className="flex justify-between"><dt className="text-ink3">Plan</dt><dd className="font-bold">{x.plan || '—'}</dd></div></dl></>}
      steps={[
        { id: 'name', title: 'Name your server', description: 'Only visible to you.', label: 'Name', validate: (x) => (x.name.trim().length < 3 ? { name: 'Use at least 3 characters.' } : undefined), content: ({ values, set, errors }) => <TextField label="Server name" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} /> },
        { id: 'region', title: 'Pick a region', label: 'Region', content: ({ values, set }) => <Select label="Region" value={values.region} onValueChange={(r) => set('region', r ?? 'fra')} options={[{ value: 'fra', label: 'Frankfurt' }, { value: 'ams', label: 'Amsterdam' }, { value: 'hel', label: 'Helsinki' }]} /> },
        { id: 'plan', title: 'Choose a plan', label: 'Plan', validate: (x) => (x.plan ? undefined : { plan: 'Choose a plan to continue.' }), content: ({ values, set, errors }) => <Select label="Plan" value={values.plan} onValueChange={(p) => set('plan', p ?? '')} error={errors.plan} placeholder="Choose a plan" options={[{ value: 'Starter 2 GB', label: 'Starter 2 GB' }, { value: 'Standard 4 GB', label: 'Standard 4 GB' }]} /> },
      ]}
    />
  );
}

interface Bot { name: string; token: string }
function SecretWizardDemo() {
  const [v, setV] = useState<Bot>({ name: '', token: '' });
  return (
    <FormWizard<Bot>
      persistKey="workbench-bot" persistExclude={['token']} values={v} onChange={setV} submitLabel="Connect"
      onSubmit={async () => { await new Promise((r) => setTimeout(r, 400)); }}
      steps={[
        { id: 'name', title: 'Name your bot', label: 'Name', validate: (x) => (x.name.trim() ? undefined : { name: 'Enter a name.' }), content: ({ values, set, errors }) => <TextField label="Bot name" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} /> },
        { id: 'token', title: 'Paste the bot token', description: 'Never saved in the draft: after a reload you type it again.', label: 'Token', validate: (x) => (x.token ? undefined : { token: 'Paste the token.' }), content: ({ values, set, errors }) => <TextField label="Bot token" type="password" autoComplete="off" value={values.token} onChange={(e) => set('token', e.target.value)} error={errors.token} /> },
      ]}
    />
  );
}

export const technicalStories = [
  defineStory({
    id: 'form-wizard',
    title: 'FormWizard',
    category: 'Forms',
    layer: 'B: composition',
    purpose: 'Multi-step flow with per-step validation, summary aside and async submit. Base for Deploy (Quick vs Custom).',
    source: 'Fortless Views.html: deploy flow; Fortless Installer.html',
    variants: ['stepper (desktop) / progress bar (phone)', 'validation blocks Next', 'summary aside', 'async submit with error'],
    props: ['steps: {id, title, content(ctx), validate?}', 'values / onChange (caller owns state)', 'onSubmit (async ok)', 'aside?(values)', 'onCancel?'],
    a11y: 'Progress is a nav; current step has aria-current="step". Heading receives focus on each step change. Errors are announced by an alert and shown on fields.',
    responsive: 'Below sm the stepper becomes "Step x of y" with a bar; actions stack with the primary on top.',
    status: 'partial',
    gaps: 'Draft persistence is opt-in (persistKey, sessionStorage). No branching steps. Stepper allows jumping back only. Not covered by an automated keyboard test.',
    scenarios: [
      { name: 'Deploy (sample)', render: () => <WizardDemo persistKey="workbench-deploy" /> },
      { name: 'Draft without secrets', note: 'The token is excluded with persistExclude; reload to see the name restored and the token empty.', render: () => <SecretWizardDemo /> },
      { name: 'Submit fails', note: 'The final step fails after 600 ms and shows the error.', render: () => <WizardDemo failSubmit /> },
    ],
  }),
  defineStory({
    id: 'server-console',
    title: 'ServerConsole',
    category: 'Technical',
    layer: 'B: composition',
    purpose: 'Live console for servers and bots using xterm.js, with a real input and command history.',
    source: 'Fortless Views.html: console tab',
    variants: ['output + input', 'input disabled with reason'],
    props: ['ref: write / writeln / clear / getText', 'onCommand(cmd)', 'inputDisabledReason?', 'scrollback, height'],
    a11y: 'Output is role=log (not live-announced, to avoid flooding screen readers), focusable for keyboard scrolling. Input is a native text field.',
    responsive: 'Fits its container with ResizeObserver; input uses 16px text on phones to avoid zoom.',
    status: 'partial',
    gaps: 'The WebSocket to Pterodactyl is not part of this library: the app wires `write` and `onCommand`. No ANSI search, no tab completion. Loaded lazily (xterm chunk).',
    scenarios: [
      { name: 'Simulated session', note: 'Workbench only: commands are echoed, not sent.', render: () => <ConsoleDemo /> },
      { name: 'Command fails', note: 'Every command is rejected after 400 ms. The error appears under the input and the command stays for retry.', render: () => <ServerConsole onCommand={async () => { await wait(400); throw new Error('The panel did not accept the command (HTTP 502).'); }} height={160} /> },
      { name: 'No command handler', note: 'Output only: without onCommand the input is disabled instead of pretending to send.', render: () => <ServerConsole height={160} /> },
      { name: 'Offline', render: () => <ServerConsole inputDisabledReason="Server is offline. Start it to send commands." height={160} /> },
    ],
  }),
  defineStory({
    id: 'code-editor',
    title: 'CodeEditor and DiffViewer',
    category: 'Technical',
    layer: 'B: composition',
    purpose: 'Edit server.properties, JSON, YAML and scripts with CodeMirror; review changes before saving.',
    source: 'new',
    variants: ['properties / json / yaml / javascript', 'readOnly', 'unified diff'],
    props: ['value, onChange, language, readOnly, label, height', 'DiffViewer: original, modified'],
    a11y: 'CodeMirror exposes the content as a labelled multiline textbox; Tab inserts indentation (Escape then Tab leaves the editor is NOT configured yet).',
    responsive: 'Line wrapping on by default; 14px mono.',
    status: 'partial',
    gaps: 'No keyboard trap escape hatch, no autocomplete, no linting. Diff is unified only. Loaded lazily.',
    scenarios: [{ name: 'Edit and diff', render: () => <EditorDemo /> }],
  }),
  defineStory({
    id: 'log-viewer',
    title: 'LogViewer, TaskProgress and DeploymentLog',
    category: 'Technical',
    layer: 'B: composition',
    purpose: 'Read build and deploy output with filters, follow mode and per-step state.',
    source: 'new (Fortless Views.html: deploy progress)',
    variants: ['filter by level and text', 'follow / jump to latest', 'steps with states'],
    props: ['LogViewer: lines, label, height, follow', 'TaskProgress: steps {state, detail}', 'DeploymentLog: steps + lines'],
    a11y: 'role=log with label; steps are an ordered list with state text, not only icons.',
    responsive: 'Fluid width; log scrolls inside its own box.',
    status: 'implemented',
    gaps: 'Renders up to 2000 lines without virtualization.',
    scenarios: [
      { name: 'Deployment (sample)', render: () => <DeploymentLog label="Build 42" lines={LOG} steps={[{ id: '1', label: 'Fetch source', state: 'done' }, { id: '2', label: 'Install dependencies', state: 'done', detail: '112 packages' }, { id: '3', label: 'Build', state: 'failed', detail: 'Cannot find module "./config"' }, { id: '4', label: 'Start', state: 'skipped' }]} /> },
      { name: 'Running', render: () => <TaskProgress label="Backup" steps={[{ id: 'a', label: 'Create snapshot', state: 'done' }, { id: 'b', label: 'Upload', state: 'running', detail: '62%' }, { id: 'c', label: 'Verify', state: 'pending' }]} /> },
      { name: 'Empty log', render: () => <LogViewer lines={[]} label="Empty" height={120} /> },
    ],
  }),
  defineStory({
    id: 'files',
    title: 'FileExplorer, FileUploadQueue and Dropzone',
    category: 'Technical',
    layer: 'B: composition',
    purpose: 'Browse and manage server files: navigate folders, row actions, upload with progress.',
    source: 'new (Fortless Views.html has no file manager yet)',
    variants: ['folders first', 'row actions', 'upload states'],
    props: ['FileExplorer: path, entries, onNavigate, onOpenFile, actionsFor', 'FileUploadQueue: items, onCancel, onRetry'],
    a11y: 'Real table with sortable headers; folder and file names are buttons; breadcrumb navigates up.',
    responsive: 'Cards on phones via DataTable (row actions hidden there: add them to a detail sheet).',
    status: 'partial',
    gaps: 'No multi-file move/copy, drag between folders or rename-in-place. File data comes from the Pterodactyl client API, wired by the app.',
    scenarios: [
      { name: 'Explorer (sample)', render: () => <ExplorerDemo /> },
      { name: 'Uploads', render: () => <div className="grid gap-3"><Dropzone label="Upload files" description="Drag files here or choose them" onFiles={() => {}} multiple /><UploadDemo /></div> },
    ],
  }),
];
