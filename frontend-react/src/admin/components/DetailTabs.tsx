import { Tabs, type TabItem } from '@/design-system';
import { useNav } from '../router';

/** Route-bound tabs for a detail page. The tab is a path segment, so every tab is linkable, back/forward works, and the set never changes with the data. */
export function DetailTabs({ base, tabs, current, label }: { base: string; tabs: TabItem[]; current: string; label: string }) {
  const nav = useNav();
  const value = tabs.some((t) => t.value === current) ? current : tabs[0]!.value;
  return <Tabs label={label} items={tabs} value={value} onValueChange={(v) => nav(v === tabs[0]!.value ? base : `${base}/${v}`)} />;
}
