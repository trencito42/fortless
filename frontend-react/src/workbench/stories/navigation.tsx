import { useMemo, useState } from 'react';
import { defineStory } from '../types';
import { AppShell, CommandPalette, useCommandPaletteShortcut, Tabs, Breadcrumbs, IconButton, Card, EmptyState, useTheme, filterNav, paletteEntries, type NavGroup, type MobileTab } from '@/design-system';

/** Navigation structure proposed in "Fortless App Nav". Items marked isNew have no mockup yet. */
export const FORTLESS_NAV: NavGroup[] = [
  { id: 'overview', items: [{ id: 'home', label: 'Dashboard', icon: 'dashboard-square-01' }] },
  {
    id: 'infra',
    label: 'Infrastructure',
    items: [
      { id: 'services', label: 'Services', icon: 'server', children: [{ id: 'services', label: 'All services' }, { id: 'deploy', label: 'Deploy new' }, { id: 'backups', label: 'Backups', isNew: true }, { id: 'usage', label: 'Usage', isNew: true }] },
      { id: 'domains', label: 'Domains', icon: 'globe-02', children: [{ id: 'domains', label: 'My domains' }, { id: 'dns', label: 'DNS records', isNew: true }, { id: 'register', label: 'Register a domain', isNew: true }] },
    ],
  },
  {
    id: 'account',
    label: 'Account and billing',
    items: [
      { id: 'billing', label: 'Billing', icon: 'invoice-01', children: [{ id: 'billing', label: 'Invoices' }, { id: 'methods', label: 'Payment methods', isNew: true }, { id: 'plans', label: 'Plans', isNew: true }] },
      { id: 'support', label: 'Support', icon: 'message-01', badge: '2', children: [{ id: 'support', label: 'Tickets' }, { id: 'newticket', label: 'New ticket', isNew: true }, { id: 'status', label: 'System status' }] },
      { id: 'account', label: 'Account', icon: 'shield-user', children: [{ id: 'settings', label: 'Security' }, { id: 'team', label: 'Team', isNew: true, permission: 'team.read' }, { id: 'activity', label: 'Audit trail' }, { id: 'keys', label: 'API keys', isNew: true }] },
    ],
  },
];

export const TABS: MobileTab[] = [
  { id: 'home', label: 'Home', icon: 'home-01' },
  { id: 'services', label: 'Services', icon: 'server' },
  { id: 'deploy', label: 'Deploy', icon: 'add-01', primary: true },
  { id: 'support', label: 'Tickets', icon: 'message-01' },
  { id: 'more', label: 'More', icon: 'menu-02' },
];

function ShellDemo({ collapsed, noTeam }: { collapsed?: boolean; noTeam?: boolean }) {
  const [id, setId] = useState('services');
  const [pal, setPal] = useState(false);
  const { toggle } = useTheme();
  const can = (p: string) => !(noTeam && p === 'team.read');
  useCommandPaletteShortcut(() => setPal((o) => !o));
  const cmds = useMemo(() => paletteEntries(filterNav(FORTLESS_NAV, can)).map((e) => ({ ...e, run: () => setId(e.id) })), [noTeam]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <AppShell
        nav={FORTLESS_NAV}
        currentId={id}
        onNavigate={setId}
        can={can}
        tabs={TABS}
        defaultCollapsed={collapsed}
        user={{ name: 'Alex Morgan', initials: 'AM', role: 'Owner' }}
        onOpenSearch={() => setPal(true)}
        userActions={<IconButton label="Toggle theme" icon="sun-03" size="sm" variant="ghost" onClick={toggle} />}
      >
        <div className="grid max-w-[720px] gap-4">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.045em]">{id}</h1>
          <Card><EmptyState icon="layout-grid" title="Page content goes here" description="The shell only supplies the frame." /></Card>
        </div>
      </AppShell>
      <CommandPalette commands={cmds} open={pal} onOpenChange={setPal} footer="↑ ↓ to move · Enter to open" />
    </>
  );
}

export const navigationStories = [
  defineStory({
    id: 'app-shell',
    title: 'AppShell, NavTree and CommandPalette',
    category: 'Navigation',
    layer: 'B: composition',
    purpose: 'Application frame with grouped navigation, collapsible rail, mobile tab bar plus sheet, breadcrumbs, permissions and ⌘K.',
    source: 'Fortless App Nav.html (submenus), Fortless Views.html (sidebar and tab bar)',
    variants: ['Expanded sidebar', 'Icon rail with menu flyouts', 'Phone tab bar and sheet', 'Permission-filtered items'],
    props: ['nav: NavGroup[] (data, no router)', 'currentId / onNavigate(id)', 'can?(permission)', 'tabs: MobileTab[]', 'user', 'actions?, userActions?', 'onOpenSearch?'],
    a11y: 'Landmarks: nav "Main navigation", nav "Primary", breadcrumb. Groups are aria-expanded buttons, current page is aria-current="page", the collapsed rail opens real menus, the palette is a combobox with aria-activedescendant.',
    responsive: 'md and up: sidebar. Below md: sticky top bar, floating tab bar, bottom sheet. Safe-area insets respected. Resize the workbench viewport to 390 to see it.',
    status: 'partial',
    gaps: 'Router integration is left to the app. Sidebar collapse state is not persisted. Mobile sheet has no swipe-to-dismiss. Not yet tested on a real touch device.',
    scenarios: [
      { name: 'Grouped navigation', fullBleed: true, render: () => <ShellDemo /> },
      { name: 'Collapsed rail', fullBleed: true, render: () => <ShellDemo collapsed /> },
      { name: 'Without the team permission', fullBleed: true, render: () => <ShellDemo noTeam /> },
    ],
  }),
  defineStory({
    id: 'tabs-breadcrumbs',
    title: 'Tabs and Breadcrumbs',
    category: 'Navigation',
    layer: 'A: primitive',
    purpose: 'Switch between views of one object; show where the current page sits.',
    source: 'Fortless Views.html: service tabs and page header',
    variants: ['Tabs with panels', 'Tabs with badge', 'Breadcrumbs'],
    props: ['Tabs: items, value / defaultValue, onValueChange, panels?, label', 'Breadcrumbs: crumbs, onNavigate'],
    a11y: 'Tablist semantics from Base UI: arrows move focus and select (automatic activation), Home/End jump, panels are labelled by their tab.',
    responsive: 'The tab list scrolls horizontally instead of wrapping.',
    status: 'implemented',
    gaps: 'Not yet tested on a real touch device.',
    scenarios: [
      {
        name: 'Tabs',
        render: () => (
          <Tabs label="Service sections" items={[{ value: 'overview', label: 'Overview' }, { value: 'console', label: 'Console' }, { value: 'files', label: 'Files' }, { value: 'backups', label: 'Backups', badge: 3 }, { value: 'settings', label: 'Settings' }]} panels={{ overview: <p className="text-ink2">Overview panel</p>, console: <p className="text-ink2">Console panel</p>, files: <p className="text-ink2">Files panel</p>, backups: <p className="text-ink2">Backups panel</p>, settings: <p className="text-ink2">Settings panel</p> }} />
        ),
      },
      { name: 'Breadcrumbs', render: () => <Breadcrumbs crumbs={[{ id: 'services', label: 'Services', current: false }, { id: 'a', label: 'survival-eu', current: true }]} onNavigate={() => {}} /> },
    ],
  }),
];
