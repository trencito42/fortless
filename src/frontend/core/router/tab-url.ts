/**
 * Gives a tab strip real URLs: selecting a tab updates the address (/base/slug), opening or reloading such an address
 * selects that tab, and back/forward switch tabs without rebuilding the page.
 */
export interface TabUrlOptions {
  tabs: HTMLElement;
  /** Address of the page without the tab, for example /app/settings */
  base: string;
  /** Tab button key to slug, for example { c: 'console' } */
  slugs: Record<string, string>;
  keyOf: (button: HTMLElement) => string | undefined;
  select: (key: string) => void;
  /** Slug from the address the page was opened with, if any */
  initial?: string | null;
  fallbackKey: string;
}

export function bindTabUrls(o: TabUrlOptions): void {
  const slugToKey = new Map(Object.entries(o.slugs).map(([k, s]) => [s, k]));
  let restoring = false;
  const choose = (key: string) => { restoring = true; try { o.select(key); } finally { restoring = false; } };

  const initialKey = o.initial ? slugToKey.get(o.initial) : undefined;
  if (initialKey) choose(initialKey);
  const activeKey = initialKey ?? o.fallbackKey;
  const slug = o.slugs[activeKey];
  if (slug && window.location.pathname !== `${o.base}/${slug}`) window.history.replaceState(null, '', `${o.base}/${slug}`);

  o.tabs.addEventListener('click', (e) => {
    if (restoring) return;
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    const key = btn ? o.keyOf(btn) : undefined;
    const s = key ? o.slugs[key] : undefined;
    if (s && window.location.pathname !== `${o.base}/${s}`) window.history.pushState(null, '', `${o.base}/${s}`);
  });

  const onTab = (e: Event) => {
    if (!document.body.contains(o.tabs)) { window.removeEventListener('fortless:tab', onTab); return; }
    const wanted = String((e as CustomEvent).detail?.tab ?? '');
    const key = slugToKey.get(wanted) ?? o.fallbackKey;
    choose(key);
    if (!slugToKey.has(wanted) && o.slugs[key]) window.history.replaceState(null, '', `${o.base}/${o.slugs[key]}`);
  };
  window.addEventListener('fortless:tab', onTab);
}
