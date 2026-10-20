import type { NavGroup, NavItem, NavChild } from './nav-types';

export interface NavMatch { group: NavGroup; item: NavItem; child?: NavChild }

/** Drops items and children the user may not see, and groups left empty. */
export function filterNav(groups: NavGroup[], can: (permission: string) => boolean = () => true): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => !i.permission || can(i.permission))
        .map((i) => (i.children ? { ...i, children: i.children.filter((c) => !c.permission || can(c.permission)) } : i))
        .filter((i) => !i.children || i.children.length > 0),
    }))
    .filter((g) => g.items.length > 0);
}

/** The route id a nav item navigates to when it is clicked as a link. */
export function itemTarget(item: NavItem): string {
  return item.children?.[0]?.id ?? item.id;
}

export function findNav(groups: NavGroup[], id: string): NavMatch | undefined {
  for (const group of groups) {
    for (const item of group.items) {
      const child = item.children?.find((c) => c.id === id);
      if (child) return { group, item, child };
      if (item.id === id && !item.children) return { group, item };
    }
  }
  return undefined;
}

export interface Crumb { id: string; label: string; current: boolean }

export function breadcrumbsFor(groups: NavGroup[], id: string): Crumb[] {
  const m = findNav(groups, id);
  if (!m) return [];
  if (m.child && (m.item.children?.length ?? 0) > 1) {
    return [
      { id: itemTarget(m.item), label: m.item.label, current: false },
      { id: m.child.id, label: m.child.label, current: true },
    ];
  }
  return [{ id: m.child?.id ?? m.item.id, label: m.child?.label ?? m.item.label, current: true }];
}

export interface PaletteEntry { id: string; label: string; section: string; icon: NavItem['icon']; keywords: string[] }

/** Flattens nav into jump targets for the command palette. */
export function paletteEntries(groups: NavGroup[]): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      if (!item.children || item.children.length <= 1) {
        out.push({ id: itemTarget(item), label: item.label, section: g.label || 'Go to', icon: item.icon, keywords: item.keywords ?? [] });
      } else {
        for (const c of item.children) out.push({ id: c.id, label: c.label, section: item.label, icon: item.icon, keywords: [...(c.keywords ?? []), item.label] });
      }
    }
  }
  return out;
}
