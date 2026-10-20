import type { ComponentPropsWithoutRef } from 'react';
import { Toolbar as BaseToolbar } from '@base-ui/react/toolbar';
import { closeGroupGap } from './group-shape';
import { cn } from '@/lib/utils/cn';

/**
 * A single tab stop for a row of controls with arrow-key navigation between them (roving focus).
 * Compose with ToolbarGroup and ToolbarSeparator.
 */
export function Toolbar({ className, ...rest }: ComponentPropsWithoutRef<typeof BaseToolbar.Root> & { 'aria-label': string }) {
  return <BaseToolbar.Root className={cn('flex min-w-0 flex-wrap items-center gap-2', className)} {...rest} />;
}
export function ToolbarGroup({ className, ...rest }: ComponentPropsWithoutRef<typeof BaseToolbar.Group>) {
  return <BaseToolbar.Group className={cn('flex items-center', closeGroupGap, className)} {...rest} />;
}
export function ToolbarSeparator({ className }: { className?: string }) {
  return <BaseToolbar.Separator className={cn('mx-1 h-6 w-px bg-ink/15', className)} />;
}
export const ToolbarButton = BaseToolbar.Button;
