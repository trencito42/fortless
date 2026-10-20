import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';
import { Avatar } from '../primitives/Avatar';
import { IconButton } from '../primitives/IconButton';
import { Kbd } from '../primitives/Kbd';
import { Breadcrumbs } from './Breadcrumbs';
import { MobileNavigationSheet } from './MobileNavigationSheet';
import { NavTree } from './NavTree';
import type { MobileTab, NavGroup, NavUser } from './nav-types';
import { breadcrumbsFor, filterNav, findNav } from './nav-utils';

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect x="3" y="5" width="26" height="6.5" rx="3.25" className="fill-accent" />
      <rect x="3" y="13" width="26" height="6.5" rx="3.25" className="fill-accent" opacity=".62" />
      <rect x="3" y="21" width="17" height="6.5" rx="3.25" className="fill-accent" opacity=".34" />
    </svg>
  );
}

export interface AppShellProps {
  nav: NavGroup[];
  currentId: string;
  onNavigate: (id: string) => void;
  user: NavUser;
  /** Permission check. Items the user cannot see are removed. Default: everything visible. */
  can?: (permission: string) => boolean;
  /** Bottom bar on phones. The tab with id "more" (or none matching) opens the full sheet. */
  tabs: MobileTab[];
  /** Right side of the top bar: notifications, theme toggle, etc. */
  actions?: ReactNode;
  onOpenSearch?: () => void;
  /** Page title area under the top bar is the page's job; the shell only supplies the frame. */
  children: ReactNode;
  defaultCollapsed?: boolean;
  /** Shown in the sidebar footer, next to the user (theme toggle slot). */
  userActions?: ReactNode;
  className?: string;
}

/**
 * Application frame. Desktop (md and up): sidebar with expandable groups, collapsible to an icon rail.
 * Phone: sticky top bar, floating bottom tab bar, and a bottom sheet with the full navigation.
 * Navigation is data: pass groups, ids and permissions; the shell never imports a router.
 */
export function AppShell({ nav, currentId, onNavigate, user, can, tabs, actions, onOpenSearch, children, defaultCollapsed = false, userActions, className }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [sheet, setSheet] = useState(false);
  const groups = filterNav(nav, can);
  const crumbs = breadcrumbsFor(groups, currentId);
  const currentItem = findNav(groups, currentId)?.item;

  const userRow = (
    <div className="flex items-center gap-2.5">
      <Avatar initials={user.initials} size="sm" />
      <span className="grid min-w-0 flex-1 leading-tight">
        <b className="truncate font-bold">{user.name}</b>
        {user.role ? <small className="truncate font-semibold text-ink3">{user.role}</small> : null}
      </span>
      {userActions}
    </div>
  );

  return (
    <div className={cn('flex h-dvh min-h-0 bg-bg text-ink', className)}>
      <aside
        aria-label="Sidebar"
        className={cn('hidden shrink-0 flex-col rounded-xl bg-s1 p-3 m-3 mr-0 transition-[width] duration-300 ease-[var(--ease)] md:flex', collapsed ? 'w-[72px] px-2.5' : 'w-[264px]')}
      >
        <div className={cn('flex h-11 items-center gap-2.5 px-1.5', collapsed && 'justify-center px-0')}>
          <LogoMark />
          {collapsed ? null : <span className="text-[20px] font-extrabold tracking-[-0.04em]">fortless</span>}
        </div>
        {onOpenSearch ? (
          <button type="button" onClick={onOpenSearch} aria-label="Search" className={cn('mt-2 mb-1 flex h-[42px] shrink-0 items-center gap-2.5 rounded-md bg-s2 px-3 font-semibold text-ink3 hover:bg-s3', collapsed && 'justify-center px-0')}>
            <Icon name="search-01" size={18} />
            {collapsed ? null : <><span>Search</span><Kbd className="ml-auto bg-transparent">⌘K</Kbd></>}
          </button>
        ) : null}
        <div className={cn('min-h-0 flex-1 overflow-y-auto', collapsed && 'overflow-visible')}>
          <NavTree groups={groups} currentId={currentId} onNavigate={onNavigate} collapsed={collapsed} />
        </div>
        <div className={cn('mt-2 flex shrink-0 items-center pt-3', collapsed ? 'flex-col gap-2' : 'justify-between gap-2')}>
          {collapsed ? <Avatar initials={user.initials} size="sm" /> : <div className="min-w-0 flex-1">{userRow}</div>}
          <IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} icon="layout-left" size="sm" variant="ghost" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 bg-bg px-4 pt-[max(14px,env(safe-area-inset-top))] pb-2.5 md:px-6 md:pt-4">
          <div className="flex items-center gap-2 md:hidden"><LogoMark size={26} /></div>
          <div className="min-w-0 flex-1">
            <Breadcrumbs crumbs={crumbs} onNavigate={onNavigate} />
          </div>
          {onOpenSearch ? <IconButton label="Search" icon="search-01" variant="secondary" className="md:hidden" onClick={onOpenSearch} /> : null}
          {actions}
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-6 md:pb-8">{children}</main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-2.5 bottom-[max(10px,env(safe-area-inset-bottom))] z-[40] flex h-[66px] items-center justify-between rounded-full bg-s1 p-1.5 md:hidden">
        {tabs.map((t) => {
          const isMore = t.id === 'more';
          const on = !isMore && (t.id === currentId || currentItem?.id === t.id || findNav(groups, t.id)?.item.id === currentItem?.id && !!currentItem);
          if (t.primary) {
            return (
              <button key={t.id} type="button" aria-label={t.label} onClick={() => onNavigate(t.id)} className="grid h-[54px] w-[58px] shrink-0 place-items-center rounded-full bg-accent text-on-accent active:scale-90">
                <Icon name={t.icon} size={24} />
              </button>
            );
          }
          return (
            <button
              key={t.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              aria-haspopup={isMore ? 'dialog' : undefined}
              onClick={() => (isMore ? setSheet(true) : onNavigate(t.id))}
              className={cn('flex h-[54px] flex-1 flex-col items-center justify-center gap-[3px] rounded-full text-[10.5px] font-bold transition-[color,background,transform] duration-200 active:scale-90', on ? 'bg-s2 text-ink' : 'text-ink3')}
            >
              <Icon name={t.icon} size={22} />
              {t.label}
            </button>
          );
        })}
      </nav>
      <MobileNavigationSheet open={sheet} onOpenChange={setSheet} groups={groups} currentId={currentId} onNavigate={onNavigate} footer={userRow} />
    </div>
  );
}
