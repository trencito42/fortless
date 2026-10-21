import { useState, type ReactNode } from 'react';
import { ActionMenu, Avatar, Badge, Button, Icon, IconButton, Kbd, LogoMark, MobileNavigationSheet, NavTree, Tooltip, filterNav, useCommandPaletteShortcut, useMediaQuery, useTheme, type MenuEntry } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { ADMIN_NAV, ADMIN_TABS, currentNavId } from '../nav';
import { useAdmin } from '../store';
import { useAdminRouter } from '../router';
import { ROLES, useSession, type PreviewState } from '../session';
import { HeaderCrumbs } from '../components/Page';
import { AdminSidebar } from './AdminSidebar';
import { AdminNotifications } from './AdminNotifications';
import { AdminCommandPalette, QUICK_ACTIONS } from './AdminCommandPalette';
import { ROLE_BLURB } from '../lib/roles';

/**
 * Admin frame. Desktop: sidebar with collapsible groups. Tablet: icon rail. Phone: top bar, floating tab bar and a sheet with the full navigation.
 * A "Demo data" pill is always in the header: this application only ever shows the synthetic fixtures in src/admin/fixtures.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { path, navigate } = useAdminRouter();
  const { data, reset } = useAdmin();
  const theme = useTheme();
  const session = useSession();
  const wide = useMediaQuery('(min-width: 1180px)', true);
  const [railOverride, setRailOverride] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  useCommandPaletteShortcut(() => setPalette((o) => !o));
  const collapsed = railOverride ?? !wide;
  const groups = filterNav(ADMIN_NAV, (p) => session.can(p as never));
  const currentId = currentNavId(path);
  const openActions = data.actions.filter((a) => a.status !== 'resolved').length;
  const navGroups = groups.map((g) => ({ ...g, items: g.items.map((i) => (i.id === '/actions' ? { ...i, badge: openActions } : i)) }));

  const quick: MenuEntry[] = QUICK_ACTIONS.filter((a) => !session.live || 'live' in a && a.live).map((a) => ({ id: a.id, label: a.label, icon: a.icon, disabled: !session.can(a.permission), disabledReason: `Requires ${a.permission}`, onSelect: () => navigate(a.to) }));
  const profile: MenuEntry[] = [
    { id: 'who', label: `${session.staffName} · ${session.role}`, disabled: true },
    { id: 'sep0', kind: 'separator' },
    ...(session.live ? [] : [
      { id: 'role', kind: 'radio-group' as const, label: 'View as role (preview)', value: session.role, onValueChange: (v: string) => session.setRole(v as never), options: ROLES.map((r) => ({ value: r, label: `${r[0]}${r.slice(1).toLowerCase()} — ${ROLE_BLURB[r]}` })) },
      { id: 'sep1', kind: 'separator' as const },
      { id: 'state', kind: 'radio-group' as const, label: 'List state (preview)', value: session.previewState, onValueChange: (v: string) => session.setPreviewState(v as PreviewState), options: [{ value: 'normal', label: 'Normal' }, { value: 'loading', label: 'Loading' }, { value: 'error', label: 'Error' }, { value: 'empty', label: 'Empty' }] },
      { id: 'sep2', kind: 'separator' as const },
    ]),
    { id: 'theme', kind: 'radio-group', label: 'Theme', value: theme.preference, onValueChange: (v) => theme.setPreference(v as never), options: [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] },
    { id: 'density', kind: 'radio-group', label: 'Density', value: theme.density, onValueChange: (v) => theme.setDensity(v as never), options: [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }] },
    { id: 'sep3', kind: 'separator' },
    ...(session.live ? [] : [{ id: 'reset', label: 'Reset demo data', icon: 'refresh' as const, onSelect: () => { reset(); } }]),
    { id: 'exit', label: session.live ? 'Leave admin' : 'Leave preview (customer app)', icon: 'logout-01', onSelect: () => window.location.assign('/') },
  ];
  const userRow = (
    <ActionMenu label={`Profile and preview settings for ${session.staffName}`} align="start" side="top" trigger={
      <button type="button" aria-label={`Profile and preview settings for ${session.staffName}`} className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 text-left hover:bg-s2 focus-visible:outline-2 focus-visible:outline-accent', collapsed && 'flex-none')}>
        <Avatar initials="MI" size="sm" />
        {collapsed ? null : <span className="grid min-w-0 flex-1 leading-tight"><b className="truncate font-bold">{session.staffName}</b><small className="truncate font-semibold text-ink3">{session.role}</small></span>}
      </button>
    } entries={profile} />
  );

  return (
    <div className="flex h-dvh min-h-0 bg-bg text-ink print:block print:h-auto">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:rounded-md focus:bg-s1 focus:px-3 focus:py-2">Skip to content</a>
      <aside aria-label="Sidebar" className={cn('m-3 mr-0 hidden shrink-0 flex-col rounded-xl bg-s1 p-3 transition-[width] duration-300 ease-[var(--ease)] md:flex print:hidden', collapsed ? 'w-[72px] px-2.5' : 'w-[272px]')}>
        <div className={cn('flex h-11 items-center gap-2.5 px-1.5', collapsed && 'justify-center px-0')}>
          <LogoMark />
          {collapsed ? null : <><span className="text-[20px] font-extrabold tracking-[-0.04em]">fortless</span><Badge tone="violet">Admin</Badge></>}
        </div>
        <button type="button" onClick={() => setPalette(true)} aria-label="Search everything" className={cn('mt-2 mb-1 flex h-[42px] shrink-0 items-center gap-2.5 rounded-md bg-s2 px-3 font-semibold text-ink3 hover:bg-s3', collapsed && 'justify-center px-0')}>
          <Icon name="search-01" size={18} />{collapsed ? null : <><span>Search</span><Kbd className="ml-auto bg-transparent">Ctrl K</Kbd></>}
        </button>
        <div className={cn('min-h-0 flex-1 overflow-y-auto', collapsed && 'overflow-visible')}>
          <AdminSidebar groups={navGroups} currentId={currentId} onNavigate={navigate} collapsed={collapsed} />
        </div>
        <div className={cn('mt-2 flex shrink-0 items-center pt-3', collapsed ? 'flex-col gap-2' : 'justify-between gap-2')}>
          {userRow}
          <IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} icon="layout-left" size="sm" variant="ghost" onClick={() => setRailOverride(!collapsed)} aria-expanded={!collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 bg-bg px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2.5 md:px-6 md:pt-4 print:hidden">
          <div className="flex items-center gap-2 md:hidden"><LogoMark size={26} /></div>
          <div className="min-w-0 flex-1"><HeaderCrumbs /></div>
          {session.live ? <Badge tone="good" className="gap-1.5"><Icon name="checkmark-circle-02" size={14} />Authenticated staff</Badge> : <Tooltip content="Everything here is synthetic. No live data, no provider calls."><span className="inline-flex"><Badge tone="warn" className="gap-1.5"><Icon name="information-circle" size={14} />Demo data</Badge></span></Tooltip>}
          <Badge tone="neutral" className="hidden lg:inline-flex">{session.live ? 'Environment: live backend' : 'Environment: preview · no backend'}</Badge>
          <IconButton label="Search everything" icon="search-01" variant="secondary" className="md:hidden" onClick={() => setPalette(true)} />
          <ActionMenu label="Quick actions" align="end" entries={quick} trigger={<Button variant="primary" size="sm" leadingIcon="add-01" className="max-sm:hidden">Create</Button>} />
          <AdminNotifications />
          <IconButton label={theme.resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={theme.resolved === 'dark' ? 'sun-03' : 'moon-01'} variant="secondary" onClick={theme.toggle} className="max-sm:hidden" />
          <div className="md:hidden">{userRow}</div>
        </header>
        <main id="admin-main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-[calc(96px+env(safe-area-inset-bottom))] outline-none md:px-6 md:pb-10 print:overflow-visible print:p-0">
          <div className="mx-auto w-full min-w-0 max-w-[1440px]">{children}</div>
        </main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-2.5 bottom-[max(10px,env(safe-area-inset-bottom))] z-[40] flex h-[66px] items-center justify-between rounded-full bg-s1 p-1.5 md:hidden print:hidden">
        {ADMIN_TABS.map((t) => {
          const isMore = t.id === 'more';
          const on = !isMore && currentId === t.id;
          return (
            <button key={t.id} type="button" aria-current={on ? 'page' : undefined} aria-haspopup={isMore ? 'dialog' : undefined} onClick={() => (isMore ? setSheet(true) : navigate(t.id))} className={cn('flex h-[54px] flex-1 flex-col items-center justify-center gap-[3px] rounded-full text-[10.5px] font-bold transition-[color,background,transform] duration-200 active:scale-90', on ? 'bg-s2 text-ink' : 'text-ink3')}>
              <Icon name={t.icon} size={22} />{t.label}
            </button>
          );
        })}
      </nav>
      <MobileNavigationSheet open={sheet} onOpenChange={setSheet} groups={navGroups} currentId={currentId} onNavigate={navigate} footer={<div className="flex items-center gap-2">{userRow}</div>} />
      <AdminCommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
export { NavTree };
