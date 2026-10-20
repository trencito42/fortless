import { cn } from '@/lib/utils/cn';

/** Placeholder block for loading states. Pair with aria-busy on the loading region. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block rounded-md bg-s3 animate-[fl-shimmer_1.4s_ease-in-out_infinite]', className)} />;
}
