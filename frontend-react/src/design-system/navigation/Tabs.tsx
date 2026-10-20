import type { ReactNode } from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils/cn';

export interface TabItem { value: string; label: string; badge?: string | number; disabled?: boolean }

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Panels keyed by tab value. Omit when tabs only switch a route and the page renders the content. */
  panels?: Record<string, ReactNode>;
  /** Accessible name for the tab list. */
  label: string;
  className?: string;
}

/**
 * Tabs for views of the same object. The list scrolls horizontally on narrow screens instead of wrapping,
 * so ScrollableTabs behavior is the default. Arrow keys move focus and select, Home/End jump.
 */
export function Tabs({ items, value, defaultValue, onValueChange, panels, label, className }: TabsProps) {
  return (
    <BaseTabs.Root value={value} defaultValue={defaultValue ?? items[0]?.value} onValueChange={(v) => onValueChange?.(String(v))} className={cn('min-w-0', className)}>
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <BaseTabs.List activateOnFocus aria-label={label} className="relative inline-flex min-w-full gap-1 rounded-full bg-s2 p-1">
          {items.map((t) => (
            <BaseTabs.Tab
              key={t.value}
              value={t.value}
              disabled={t.disabled}
              className="inline-flex h-ctl-md shrink-0 cursor-pointer items-center gap-2 rounded-full px-5 text-[14.5px] font-bold whitespace-nowrap text-ink2 transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent data-[active]:bg-s1 data-[active]:text-ink data-[disabled]:opacity-50 sm:min-w-0"
            >
              {t.label}
              {t.badge != null ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-bg px-1.5 text-[11px] font-extrabold text-accent">{t.badge}</span> : null}
            </BaseTabs.Tab>
          ))}
        </BaseTabs.List>
      </div>
      {panels
        ? items.map((t) => (
            <BaseTabs.Panel key={t.value} value={t.value} className="pt-5 outline-none">
              {panels[t.value]}
            </BaseTabs.Panel>
          ))
        : null}
    </BaseTabs.Root>
  );
}

/** Alias that documents intent: the list already scrolls. */
export const ScrollableTabs = Tabs;
