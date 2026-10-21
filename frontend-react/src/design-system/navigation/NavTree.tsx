import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';
import { Tooltip } from '../primitives/Tooltip';
import { popupSurface, positionerStyles, menuItemStyles } from '../overlays/popup-styles';
import type { NavGroup, NavItem } from './nav-types';
import { findNav, itemTarget } from './nav-utils';

export interface NavTreeProps {
  groups: NavGroup[];
  currentId: string;
  onNavigate: (id: string) => void;
  /** Icon-only rail. Groups open as menus instead of expanding in place. */
  collapsed?: boolean;
  /** Larger touch rows, used inside the mobile sheet. */
  touch?: boolean;
  /** Accessible name of the navigation landmark. Give each instance its own when several are on screen. */
  label?: string;
}

const row = (active: boolean, current: boolean, touch?: boolean) =>
  cn(
    'relative flex w-full items-center gap-3 rounded-md px-3 text-left font-semibold whitespace-nowrap transition-colors duration-200',
    touch ? 'h-12.5 text-[15.5px]' : 'h-11 text-[14.5px]',
    active ? 'bg-accent-bg text-accent' : current ? 'text-ink hover:bg-s2' : 'text-ink2 hover:bg-s2 hover:text-ink',
  );

function Badge({ value, dot }: { value: string | number; dot?: boolean }) {
  if (dot) return <span aria-hidden="true" className="absolute top-2 right-2.5 size-2 rounded-full bg-warn" />;
  return <span className="grid h-5 min-w-5 place-items-center rounded-full bg-warn-bg px-1.5 text-[11px] font-extrabold text-warn">{value}</span>;
}

/**
 * Grouped navigation. Expanding groups use aria-expanded buttons; the current page gets aria-current="page".
 * In collapsed mode, grouped items open a menu so every destination stays reachable without hover.
 */
export function NavTree({ groups, currentId, onNavigate, collapsed, touch, label = 'Main navigation' }: NavTreeProps) {
  const currentItem = findNav(groups, currentId)?.item;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (currentItem ? { [currentItem.id]: true } : {}));

  const renderItem = (item: NavItem) => {
    const kids = item.children ?? [];
    const isCurrentItem = currentItem?.id === item.id;

    if (kids.length <= 1) {
      const target = itemTarget(item);
      const active = target === currentId;
      const link = (
        <button type="button" className={cn(row(active, false, touch), collapsed && 'justify-center px-0')} aria-current={active ? 'page' : undefined} aria-label={collapsed ? item.label : undefined} onClick={() => onNavigate(target)}>
          <Icon name={item.icon} size={20} className={active ? 'text-accent' : 'text-ink3'} />
          {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
          {item.badge != null ? <Badge value={item.badge} dot={collapsed} /> : null}
        </button>
      );
      return collapsed ? <Tooltip content={item.label} side="right">{link}</Tooltip> : link;
    }

    if (collapsed) {
      return (
        <Menu.Root>
          <Menu.Trigger className={cn(row(false, isCurrentItem), 'justify-center px-0')} aria-label={item.label}>
            <Icon name={item.icon} size={20} className={isCurrentItem ? 'text-accent' : 'text-ink3'} />
            {item.badge != null ? <Badge value={item.badge} dot /> : null}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="right" align="start" sideOffset={10} collisionPadding={8} className={positionerStyles}>
              <Menu.Popup className={cn(popupSurface, 'min-w-[200px]')}>
                <div className="px-3 pt-2 pb-1 text-xs font-bold text-ink3">{item.label}</div>
                {kids.map((k) => (
                  <Menu.Item key={k.id} className={cn(menuItemStyles, k.id === currentId && 'text-accent')} onClick={() => onNavigate(k.id)}>
                    {k.label}
                    {k.isNew ? <span className="ml-auto rounded-full bg-violet-bg px-2 py-0.5 text-[10.5px] font-extrabold text-violet">New</span> : null}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      );
    }

    const expanded = !!open[item.id];
    const panelId = `nav-sub-${item.id}`;
    return (
      <div>
        <button type="button" className={row(false, isCurrentItem, touch)} aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen((o) => ({ ...o, [item.id]: !o[item.id] }))}>
          <Icon name={item.icon} size={20} className={isCurrentItem ? 'text-accent' : 'text-ink3'} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge != null ? <Badge value={item.badge} /> : null}
          <Icon name="arrow-right-01" size={16} className={cn('text-ink3 transition-transform duration-300', expanded && 'rotate-90')} />
        </button>
        <div id={panelId} className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease)]', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} inert={!expanded}>
          <div className="flex min-h-0 flex-col gap-px overflow-hidden">
            {kids.map((k) => {
              const active = k.id === currentId;
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(k.id)}
                  className={cn('flex w-full items-center gap-2 rounded-sm pr-3 pl-11.5 text-left font-semibold whitespace-nowrap transition-colors duration-200', touch ? 'h-11 text-[15px]' : 'h-9.5 text-[14px]', active ? 'bg-accent-bg text-accent' : 'text-ink2 hover:bg-s2 hover:text-ink')}
                >
                  {k.label}
                  {k.isNew ? <span className="rounded-full bg-violet-bg px-2 py-0.5 text-[10.5px] font-extrabold text-violet">New</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <nav aria-label={label} className="flex flex-col">
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-px">
          {g.label ? (collapsed ? <div className="mx-3 my-3 h-px bg-ink/10" /> : <div className="px-3 pt-4.5 pb-2 text-xs font-bold text-ink3">{g.label}</div>) : <div className="h-1" />}
          {g.items.map((it) => <div key={it.id}>{renderItem(it)}</div>)}
        </div>
      ))}
    </nav>
  );
}
