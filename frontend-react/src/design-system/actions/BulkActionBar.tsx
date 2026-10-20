import type { ReactNode } from 'react';
import { Button } from '../primitives/Button';
import { FloatingActionBar } from './FloatingActionBar';

export interface BulkActionBarProps {
  count: number;
  noun?: string;
  onClear: () => void;
  children: ReactNode;
  aboveTabBar?: boolean;
}

/** Appears when rows are selected. The count is announced politely so keyboard and screen reader users know selection changed. */
export function BulkActionBar({ count, noun = 'selected', onClear, children, aboveTabBar }: BulkActionBarProps) {
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">{count > 0 ? `${count} ${noun}` : 'Selection cleared'}</span>
      <FloatingActionBar label="Bulk actions" visible={count > 0} aboveTabBar={aboveTabBar}>
        <span className="px-3 text-[14px] font-bold whitespace-nowrap">{count} {noun}</span>
        {children}
        <Button size="sm" variant="ghost" className="text-on-ink hover:bg-white/10 hover:text-on-ink" onClick={onClear}>Clear</Button>
      </FloatingActionBar>
    </>
  );
}
