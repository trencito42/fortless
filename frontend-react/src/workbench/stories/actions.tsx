import { useState } from 'react';
import { defineStory } from '../types';
import {
  Button, IconButton, ButtonGroup, SegmentedControl, ToggleButtonGroup, SplitButton, ActionMenu, DropdownButton, ContextMenu, Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarButton,
  ResponsiveActionBar, BulkActionBar, CopyButton, LoadingButton, DestructiveAction, Card, type MenuEntry,
} from '@/design-system';
import { Row, Stack, Cap, Surface } from '../layout';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function PowerDemo({ fail, perm }: { fail?: boolean; perm?: boolean }) {
  const [state, setState] = useState<'offline' | 'running' | 'starting'>('offline');
  const [err, setErr] = useState<string | null>(null);
  const run = async (next: 'offline' | 'running') => {
    setErr(null);
    setState('starting');
    await wait(900);
    if (fail) {
      setState('offline');
      throw new Error('The node did not respond. The server state was not changed.');
    }
    setState(next);
  };
  const busy = state === 'starting';
  return (
    <Stack gap={3}>
      <p className="text-[13px] font-semibold text-ink2" role="status">State: {state}</p>
      <Row>
        <ButtonGroup aria-label="Power actions">
          <LoadingButton variant="primary" leadingIcon="play" disabled={perm || state === 'running'} onClick={() => run('running')} onError={(e) => setErr(String((e as Error).message))}>Start</LoadingButton>
          <LoadingButton variant="secondary" leadingIcon="refresh" disabled={perm || state !== 'running' || busy} onClick={() => run('running')} onError={(e) => setErr(String((e as Error).message))}>Restart</LoadingButton>
          <DestructiveAction variant="danger-subtle" leadingIcon="stop" disabled={perm || state !== 'running' || busy} title="Stop this server?" description="Players are disconnected. The world is saved first." confirmLabel="Stop server" onConfirm={() => run('offline')}>Stop</DestructiveAction>
        </ButtonGroup>
        {perm ? <span className="text-[13px] font-semibold text-ink3">You don't have permission to control power.</span> : null}
      </Row>
      {err ? <p role="alert" className="rounded-md bg-bad-bg px-4 py-3 font-semibold text-bad">{err}</p> : null}
    </Stack>
  );
}

const rowEntries: MenuEntry[] = [
  { id: 'open', label: 'Open', icon: 'arrow-up-right-01', shortcut: 'O' },
  { id: 'rename', label: 'Rename', icon: 'edit-02' },
  { id: 'copy', label: 'Copy address', icon: 'copy-01' },
  { id: 'sep', kind: 'separator' },
  { id: 'sub', kind: 'submenu', label: 'Move to', icon: 'folder-01', items: [{ id: 'a', label: 'Production' }, { id: 'b', label: 'Staging' }] },
  { id: 'sep2', kind: 'separator' },
  { id: 'delete', label: 'Delete', icon: 'delete-02', tone: 'danger' },
];

export const actionStories = [
  defineStory({
    id: 'button-group',
    title: 'ButtonGroup',
    category: 'Actions',
    layer: 'A: primitive',
    purpose: 'Independent, related actions joined into one object. Server power actions are the canonical case. Not a selection control.',
    source: 'Fortless Views.html: service page power buttons, regrouped',
    variants: ['horizontal', 'vertical', 'mixed variants per child'],
    props: ['aria-label (required)', 'orientation'],
    a11y: 'role=group with a required accessible name. Each child is a real button; Tab visits each.',
    responsive: 'Allow the group to wrap into a vertical stack with orientation="vertical" below the breakpoint you choose.',
    status: 'implemented',
    scenarios: [
      { name: 'Power actions: normal', note: 'Stop asks for confirmation. Start and Restart show loading while the request runs.', render: () => <Surface><PowerDemo /></Surface> },
      { name: 'Power actions: request fails', note: 'The failure is shown and the state is not changed.', render: () => <Surface><PowerDemo fail /></Surface> },
      { name: 'Power actions: no permission', render: () => <Surface><PowerDemo perm /></Surface> },
    ],
  }),
  defineStory({
    id: 'segmented-control',
    title: 'SegmentedControl',
    category: 'Actions',
    layer: 'A: primitive',
    purpose: 'Choose exactly one option from a small set (2 to 5). Time ranges, view modes, Quick vs Custom. Not interchangeable with ButtonGroup.',
    source: 'Fortless Views.html: .seg and .vseg; App Nav.html: Desktop/Phone and nav mode switch',
    variants: ['sm / md', 'block', 'with icons', 'icon-only on mobile', 'disabled option'],
    props: ['aria-label (required)', 'options: {value,label,icon?,disabled?}[]', 'value / defaultValue / onValueChange', 'size', 'block'],
    a11y: 'role=radiogroup. Arrow keys move and select, Tab leaves the group, selected option exposed as checked.',
    responsive: 'Use block on phones. iconOnlyOnMobile keeps the label for screen readers.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Time range',
        render: function Demo() {
          const [v, setV] = useState('24h');
          return <Stack gap={3}><SegmentedControl aria-label="Time range" value={v} onValueChange={setV} options={[{ value: '1h', label: '1h' }, { value: '24h', label: '24h' }, { value: '7d', label: '7d' }, { value: '30d', label: '30d' }]} /><Cap>Selected: {v}</Cap></Stack>;
        },
      },
      { name: 'Block with icons', render: () => <div className="max-w-sm"><SegmentedControl block aria-label="Setup mode" defaultValue="quick" options={[{ value: 'quick', label: 'Quick', icon: 'flash' }, { value: 'custom', label: 'Custom', icon: 'sliders-horizontal' }]} /></div> },
      { name: 'Disabled option', render: () => <SegmentedControl aria-label="Billing cycle" defaultValue="m" options={[{ value: 'm', label: 'Monthly' }, { value: 'q', label: 'Quarterly', disabled: true }, { value: 'y', label: 'Yearly' }]} /> },
    ],
  }),
  defineStory({
    id: 'toggle-button-group',
    title: 'ToggleButtonGroup',
    category: 'Actions',
    layer: 'A: primitive',
    purpose: 'Independent on/off toggles that belong together (chart series, formatting).',
    source: 'new, from the prompt (5.1)',
    variants: ['multiple', 'icon only'],
    props: ['aria-label', 'options', 'value / onValueChange', 'multiple'],
    a11y: 'Each toggle is a button with aria-pressed. Group has an accessible name.',
    responsive: 'Icon-only toggles keep 44px touch targets.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Chart series',
        render: function Demo() {
          const [v, setV] = useState(['cpu', 'ram']);
          return <Stack gap={3}><ToggleButtonGroup aria-label="Series" value={v} onValueChange={setV} options={[{ value: 'cpu', label: 'CPU', icon: 'cpu' }, { value: 'ram', label: 'RAM', icon: 'layers-01' }, { value: 'net', label: 'Network', icon: 'activity-01' }]} /><Cap>Visible: {v.join(', ') || 'none'}</Cap></Stack>;
        },
      },
    ],
  }),
  defineStory({
    id: 'split-button',
    title: 'SplitButton',
    category: 'Actions',
    layer: 'A: primitive',
    purpose: 'One primary action with related alternatives behind a chevron.',
    source: 'new, from the prompt (5.1)',
    variants: ['primary / secondary', 'sm / md / lg', 'disabled'],
    props: ['children (primary label)', 'entries: MenuEntry[]', 'menuLabel (required)', '...ButtonProps'],
    a11y: 'Two buttons. The chevron has its own accessible name and opens a menu (arrow keys, typeahead, Escape returns focus).',
    responsive: 'Menu collides with the viewport edge and stays on screen.',
    status: 'implemented',
    scenarios: [
      { name: 'Restart options', render: () => <Row><SplitButton menuLabel="More restart options" entries={[{ id: 'c', label: 'Restart and clear console' }, { id: 'u', label: 'Restart after updates' }]} leadingIcon="refresh">Restart</SplitButton><SplitButton variant="secondary" size="sm" menuLabel="More payment options" entries={[{ id: 'a', label: 'Pay another way' }]}>Pay now</SplitButton></Row> },
    ],
  }),
  defineStory({
    id: 'action-menu',
    title: 'ActionMenu, DropdownButton, ContextMenu',
    category: 'Actions',
    layer: 'A: primitive',
    purpose: 'Menus of related actions: row overflow, secondary operations, and right-click or long-press shortcuts that always mirror a visible control.',
    source: 'Fortless Views.html: row actions and menus',
    variants: ['items', 'separators', 'groups', 'checkbox items', 'radio items', 'submenu', 'danger tone', 'disabled with reason'],
    props: ['entries: MenuEntry[]', 'trigger?', 'align / side'],
    a11y: 'Base UI menu: Enter, Space or ArrowDown opens, arrows move, Home/End, typeahead, Escape closes and restores focus to the trigger.',
    responsive: 'Items are 44px tall on touch. Popups collide with the viewport and scroll when taller than the space available.',
    status: 'implemented',
    scenarios: [
      { name: 'Row menu', render: () => <Row><ActionMenu entries={rowEntries} label="Row actions" /><DropdownButton variant="secondary" leadingIcon="add-01" entries={[{ id: 'g', kind: 'group', label: 'Create', items: [{ id: 's', label: 'Server' }, { id: 'b', label: 'Bot' }, { id: 'a', label: 'App' }] }]}>Add</DropdownButton></Row> },
      {
        name: 'Checkbox and radio items',
        render: function Demo() {
          const [grid, setGrid] = useState(true);
          const [density, setDensity] = useState('comfortable');
          return <ActionMenu label="View options" trigger={<Button variant="secondary" leadingIcon="sliders-horizontal">View</Button>} entries={[{ id: 'cb', kind: 'checkbox', label: 'Show grid', checked: grid, onCheckedChange: setGrid }, { id: 'sep', kind: 'separator' }, { id: 'rg', kind: 'radio-group', label: 'Density', value: density, onValueChange: setDensity, options: [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }] }]} />;
        },
      },
      { name: 'Disabled with reason', render: () => <ActionMenu label="Actions" entries={[{ id: 'a', label: 'Restore backup', disabled: true, disabledReason: 'Stop the server first' }, { id: 'b', label: 'Download' }]} /> },
      { name: 'Context menu (right-click or long-press)', render: () => <ContextMenu entries={rowEntries} className="grid h-32 place-items-center rounded-lg bg-s2 text-ink2"><span className="font-semibold">Right-click or long-press here</span></ContextMenu> },
    ],
  }),
  defineStory({
    id: 'toolbar',
    title: 'Toolbar and ResponsiveActionBar',
    category: 'Actions',
    layer: 'B: composition',
    purpose: 'A single tab stop for a row of controls, and an action bar that moves what does not fit into a More menu. File manager toolbars are the target use.',
    source: 'new, from the prompt (5.1, file manager toolbar)',
    variants: ['toolbar with groups and separators', 'responsive overflow'],
    props: ['Toolbar: aria-label', 'ResponsiveActionBar: actions: BarAction[] (ordered by priority)'],
    a11y: 'Toolbar uses roving focus: one Tab stop, arrow keys between controls. Overflow actions are reachable through the More menu.',
    responsive: 'ResponsiveActionBar measures a hidden copy and recomputes on resize. Resize the viewport to see actions move into More.',
    status: 'implemented',
    scenarios: [
      { name: 'Toolbar', render: () => <Surface><Toolbar aria-label="Editor actions"><ToolbarGroup><ToolbarButton render={<IconButton label="Undo" icon="backward-01" variant="secondary" />} /><ToolbarButton render={<IconButton label="Redo" icon="forward-01" variant="secondary" />} /></ToolbarGroup><ToolbarSeparator /><ToolbarGroup><ToolbarButton render={<Button variant="secondary" size="sm">Save</Button>} /><ToolbarButton render={<Button variant="secondary" size="sm">Download</Button>} /></ToolbarGroup></Toolbar></Surface> },
      {
        name: 'File actions (resize to see overflow)',
        render: () => (
          <Surface className="flex items-center gap-3">
            <span className="shrink-0 font-bold">/plugins</span>
            <ResponsiveActionBar actions={[
              { id: 'up', label: 'Upload', icon: 'upload-01', variant: 'primary', onSelect: () => undefined },
              { id: 'new', label: 'New file', icon: 'file-add', onSelect: () => undefined },
              { id: 'folder', label: 'New folder', icon: 'folder-01', onSelect: () => undefined },
              { id: 'dl', label: 'Download', icon: 'download-01', onSelect: () => undefined },
              { id: 'del', label: 'Delete', icon: 'delete-02', tone: 'danger', onSelect: () => undefined },
            ]} />
          </Surface>
        ),
      },
    ],
  }),
  defineStory({
    id: 'bulk-action-bar',
    title: 'BulkActionBar and FloatingActionBar',
    category: 'Actions',
    layer: 'B: composition',
    purpose: 'Contextual bar that appears when rows are selected, pinned above the mobile tab bar.',
    source: 'new, from the prompt (5.1)',
    variants: ['visible / hidden', 'above tab bar'],
    props: ['count', 'noun', 'onClear', 'children (actions)', 'aboveTabBar'],
    a11y: 'region with a name. Selection count is announced politely. Hidden state is inert, so it takes no focus.',
    responsive: 'Clears the home indicator via safe-area insets and sits above the tab bar on phones.',
    status: 'implemented',
    scenarios: [
      {
        name: 'Selection',
        render: function Demo() {
          const [n, setN] = useState(2);
          return (
            <Surface className="grid gap-3">
              <Row><Button size="sm" onClick={() => setN((x) => x + 1)}>Select another</Button><Button size="sm" variant="ghost" onClick={() => setN(0)}>Clear</Button></Row>
              <BulkActionBar count={n} noun="selected" onClear={() => setN(0)}>
                <Button size="sm" variant="secondary">Download</Button>
                <Button size="sm" variant="danger">Delete</Button>
              </BulkActionBar>
              <p className="text-ink3">The bar is pinned to the bottom of the viewport.</p>
            </Surface>
          );
        },
      },
    ],
  }),
  defineStory({
    id: 'copy-loading-destructive',
    title: 'CopyButton, LoadingButton, DestructiveAction',
    category: 'Actions',
    layer: 'A: primitive',
    purpose: 'Actions with consequences: copy with confirmation, async buttons that prevent double submits, and confirmed destructive operations.',
    source: 'Fortless Views.html: copy field, confirm modals',
    variants: ['copy icon / with text', 'loading async', 'error surfaced', 'destructive with typed confirmation'],
    props: ['CopyButton: value (string or async getter), label, text', 'LoadingButton: onClick (async), onError', 'DestructiveAction: title, description, confirmLabel, requireText, onConfirm'],
    a11y: 'Copy result is announced (role=status). LoadingButton sets aria-busy. The destructive dialog is an alertdialog; the typed phrase gates the confirm button and errors appear inside the dialog.',
    responsive: 'The confirmation becomes a bottom sheet below md.',
    status: 'implemented',
    scenarios: [
      { name: 'Copy', render: () => <Row><CopyButton label="Copy address" value="play.fortless.net:25565" /><CopyButton label="Copy address" text="Copy address" value="play.fortless.net:25565" /></Row> },
      { name: 'Async button', render: () => <Row><LoadingButton variant="primary" onClick={() => wait(1200)}>Save changes</LoadingButton><LoadingButton variant="secondary" onClick={async () => { await wait(500); throw new Error('Nope'); }} onError={() => undefined}>Fails quietly in this demo</LoadingButton></Row> },
      { name: 'Destructive', render: () => <Row><DestructiveAction title="Delete Bot Standard?" description="This removes the service and its files. This cannot be undone." confirmLabel="Delete service" requireText="Bot Standard" onConfirm={() => wait(800)}>Delete service</DestructiveAction><DestructiveAction variant="danger" title="Kill server?" description="Force stop. Unsaved world data can be lost." confirmLabel="Kill" onConfirm={async () => { await wait(500); throw new Error('The node refused the request.'); }}>Kill (fails)</DestructiveAction></Row> },
      { name: 'Card with actions', render: () => <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-extrabold">Survival world</p><p className="text-ink2">Last backup 2 hours ago</p></div><Button variant="subtle" size="sm">Back up now</Button></div></Card> },
    ],
  }),
];
