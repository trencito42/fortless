import { cn } from '@/lib/utils/cn';

/** Indeterminate spinner. Announce loading state on the parent (aria-busy) rather than on the spinner. */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn('shrink-0 animate-[fl-spin_0.8s_linear_infinite]', className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
