import { useState } from 'react';
import { defineStory } from '../types';
import { DataTable, SkeletonTable, Pagination, DescriptionList, Timeline, ActivityFeed, TreeView, DetailPanel, StatusBadge, Button, ActionMenu, type ColumnDef, type TreeNode } from '@/design-system';

interface Row { id: string; name: string; game: string; region: string; status: 'running' | 'stopped' | 'installing'; ram: number }
/** Sample rows for the workbench only. Clearly not customer data. */
const SAMPLE: Row[] = [
  ['survival-eu', 'Minecraft', 'Frankfurt', 'running', 4], ['creative-hub', 'Minecraft', 'Frankfurt', 'stopped', 2], ['discord-helper', 'Node.js bot', 'Amsterdam', 'running', 1],
  ['rust-wipe', 'Rust', 'Helsinki', 'installing', 8], ['lobby', 'Minecraft', 'Frankfurt', 'running', 2], ['api-gateway', 'Node.js app', 'Amsterdam', 'running', 1],
  ['modded-pack', 'Minecraft', 'Frankfurt', 'stopped', 6], ['pvp-arena', 'Minecraft', 'Helsinki', 'running', 4], ['staging-bot', 'Node.js bot', 'Amsterdam', 'stopped', 1],
  ['hub-two', 'Minecraft', 'Frankfurt', 'running', 2], ['skyblock', 'Minecraft', 'Frankfurt', 'running', 4], ['test-box', 'Node.js app', 'Helsinki', 'stopped', 1],
].map(([name, game, region, status, ram], i) => ({ id: `srv-${i + 1}`, name: name as string, game: game as string, region: region as string, status: status as Row['status'], ram: ram as number }));

const tone = { running: 'good', stopped: 'neutral', installing: 'warn' } as const;
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name', meta: { primary: true }, cell: (c) => <b>{c.getValue() as string}</b> },
  { accessorKey: 'game', header: 'Product' },
  { accessorKey: 'region', header: 'Region' },
  { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge tone={tone[c.getValue() as Row['status']]}>{c.getValue() as string}</StatusBadge> },
  { accessorKey: 'ram', header: 'RAM (GB)', meta: { numeric: true } },
  { id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, meta: { actions: true }, cell: (c) => <ActionMenu label={`Actions for ${c.row.original.name}`} entries={[{ id: 'open', label: 'Open' }, { id: 'restart', label: 'Restart' }]} /> },
];

function TableDemo() {
  const [open, setOpen] = useState<Row | null>(null);
  return (
    <>
      <DataTable data={SAMPLE} columns={columns} getRowId={(r) => r.id} caption="Services" rowLabel={(r) => r.name} searchable searchPlaceholder="Search services" columnPicker selectable pageSize={6} onRowClick={setOpen} bulkActions={(sel) => <Button size="sm" variant="ink">Restart {sel.length}</Button>} />
      <DetailPanel open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.name ?? ''} description="Sample service" items={open ? [{ label: 'Product', value: open.game }, { label: 'Region', value: open.region }, { label: 'RAM', value: `${open.ram} GB` }, { label: 'ID', value: open.id, copy: open.id, mono: true }] : []} />
    </>
  );
}

const TREE: TreeNode[] = [
  { id: 'plugins', label: 'plugins', children: [{ id: 'ess', label: 'EssentialsX.jar', meta: '2.1 MB' }, { id: 'cfg', label: 'config', children: [{ id: 'c1', label: 'config.yml', meta: '4 KB' }] }] },
  { id: 'world', label: 'world', children: [{ id: 'lvl', label: 'level.dat', meta: '1 KB' }] },
  { id: 'props', label: 'server.properties', meta: '2 KB' },
];

export const dataStories = [
  defineStory({
    id: 'data-table',
    title: 'DataTable',
    category: 'Data display',
    layer: 'B: composition',
    purpose: 'Sortable, searchable, selectable list with pagination. Cards on phones. Used for services, domains, invoices, tickets, players.',
    source: 'Fortless Views.html: services, invoices and tickets lists',
    variants: ['sort', 'global search', 'column picker', 'row selection with bulk bar', 'row click', 'loading', 'error', 'empty', 'no matches'],
    props: ['data, columns (TanStack ColumnDef + meta), getRowId, caption', 'loading / error / onRetry / empty', 'selectable + bulkActions(selected)', 'searchable, columnPicker, pageSize', 'onRowClick, mobileCard?', 'renderExpanded?(row), rowLabel?(row)'],
    a11y: 'Real table with caption, scope=col and aria-sort on sortable headers. Select-all and per-row checkboxes are labelled. Selection count is announced. Below md the list is a labelled ul.',
    responsive: 'Below md: cards (primary column as title, label/value pairs). Column picker is desktop-only.',
    status: 'partial',
    gaps: 'Client-side sort/filter/pagination only; no server-driven mode. No column resize or virtualization. Sticky header needs the `maxHeight` prop. Row click is keyboard-operable (rows are focusable, Enter/Space) but a real link in a cell is still the better pattern for navigation.',
    scenarios: [
      { name: 'Services (sample data)', render: () => <TableDemo /> },
      { name: 'Expandable rows', note: 'Each row has a disclosure button; the panel opens under the row (inside the card on phones).', render: () => <DataTable data={SAMPLE} columns={columns} getRowId={(r) => r.id} rowLabel={(r) => r.name} caption="Services with details" pageSize={5} renderExpanded={(r) => <DescriptionList items={[{ label: 'Product', value: r.game }, { label: 'Region', value: r.region }, { label: 'Memory', value: `${r.ram} GB` }]} />} /> },
      { name: 'Loading', render: () => <DataTable data={SAMPLE} columns={columns} getRowId={(r) => r.id} caption="Services" loading /> },
      { name: 'Error', render: () => <DataTable data={[]} columns={columns} getRowId={(r: Row) => r.id} caption="Services" error="The API did not respond." onRetry={() => {}} /> },
      { name: 'Empty', render: () => <DataTable data={[]} columns={columns} getRowId={(r: Row) => r.id} caption="Services" empty={{ title: 'No services yet', description: 'Deploy your first server or bot.', action: <Button variant="primary" leadingIcon="rocket-01">Deploy new</Button> }} /> },
      { name: 'SkeletonTable', render: () => <SkeletonTable columns={4} rows={3} /> },
    ],
  }),
  defineStory({
    id: 'pagination',
    title: 'Pagination',
    category: 'Data display',
    layer: 'A: primitive',
    purpose: 'Page controls with range summary.',
    source: 'new',
    variants: ['numbered with gaps', 'compact on phones'],
    props: ['page (0-based), pageCount, onPageChange', 'total?, pageSize?'],
    a11y: 'nav landmark, current page marked aria-current, summary is a polite live region.',
    responsive: 'Numbered buttons from sm; previous/next with "x / y" below.',
    status: 'implemented',
    gaps: 'Not yet tested on a real touch device.',
    scenarios: [{ name: 'Many pages', render: function P() { const [p, setP] = useState(4); return <Pagination page={p} pageCount={20} onPageChange={setP} total={200} pageSize={10} />; } }],
  }),
  defineStory({
    id: 'description-timeline',
    title: 'DescriptionList, Timeline and ActivityFeed',
    category: 'Data display',
    layer: 'A: primitive',
    purpose: 'Detail pages: facts as label/value, history as a vertical timeline, short audit feed.',
    source: 'Fortless Views.html: service overview, invoice and ticket detail',
    variants: ['DescriptionList with copy', 'Timeline tones', 'ActivityFeed'],
    props: ['DescriptionList: items {label, value, copy?, mono?}', 'Timeline: events {id, title, time, tone?, icon?}', 'ActivityFeed: items {actor, action, target?, time}'],
    a11y: 'Semantic dl and ol, time elements carry dateTime when provided.',
    responsive: 'Label stacks above value on phones.',
    status: 'implemented',
    scenarios: [
      { name: 'DescriptionList', render: () => <DescriptionList items={[{ label: 'Address', value: 'play.example.com:25565', copy: 'play.example.com:25565', mono: true }, { label: 'Region', value: 'Frankfurt' }, { label: 'Plan', value: 'Standard 4 GB' }]} /> },
      { name: 'Timeline', render: () => <Timeline label="Deploy history" events={[{ id: '1', title: 'Deployment finished', time: '2 min ago', tone: 'good', icon: 'tick-02', description: 'Build 42 is live.' }, { id: '2', title: 'Building image', time: '5 min ago', tone: 'accent', icon: 'package' }, { id: '3', title: 'Deployment queued', time: '6 min ago' }]} /> },
      { name: 'ActivityFeed', render: () => <ActivityFeed label="Recent activity" items={[{ id: '1', actor: 'Alex Morgan', action: 'restarted', target: 'survival-eu', time: '1h ago' }, { id: '2', actor: 'Sam Lee', action: 'added a domain', time: '3h ago' }]} /> },
    ],
  }),
  defineStory({
    id: 'tree-view',
    title: 'TreeView / FileTree',
    category: 'Data display',
    layer: 'B: composition',
    purpose: 'Hierarchy with keyboard navigation: file browsers, settings groups.',
    source: 'new (Fortless file manager is not in the prototypes yet)',
    variants: ['expandable folders', 'file meta'],
    props: ['nodes: TreeNode[]', 'label', 'selectedId?, onSelect?', 'defaultExpanded?'],
    a11y: 'role=tree with roving tabindex, aria-level, aria-expanded. Arrows, Home, End, Enter work as in the ARIA tree pattern.',
    responsive: '40px rows for touch.',
    status: 'partial',
    gaps: 'No drag and drop and no lazy loading of children. Type-ahead, `*` and aria-setsize/posinset are in.',
    scenarios: [{ name: 'File tree (sample)', render: function T() { const [s, setS] = useState('cfg'); return <div className="max-w-sm rounded-lg bg-s1 p-2"><TreeView label="Server files" nodes={TREE} selectedId={s} onSelect={(n) => setS(n.id)} defaultExpanded={['plugins']} /></div>; } }],
  }),
];
