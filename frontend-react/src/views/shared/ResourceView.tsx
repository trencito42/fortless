import type { ReactNode } from 'react';
import { Button, Notice, Skeleton } from '@/design-system';
import { ServiceApiError } from '../service-detail/ports';
import type { ResourceState } from './useResource';

/**
 * One consistent loading / error / ready rendering for view data.
 * A terminal error (no permission, provider off, service suspended) is explained without a retry button because retrying cannot help;
 * everything else offers Retry.
 */
export function ResourceView<T>({ res, reload, children, label = 'Loading', skeleton }: { res: ResourceState<T>; reload: () => void; children: (data: T) => ReactNode; label?: string; skeleton?: ReactNode }) {
  if (res.status === 'loading') return <div role="status" aria-label={label} aria-busy="true" className="grid gap-3">{skeleton ?? <><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></>}</div>;
  if (res.status === 'error') {
    const terminal = res.cause instanceof ServiceApiError && res.cause.terminal;
    return <Notice tone={terminal ? 'warn' : 'bad'} title={terminal ? 'Not available right now' : 'Could not load this'} action={terminal ? undefined : <Button size="sm" variant="secondary" onClick={reload}>Retry</Button>}>{res.error}</Notice>;
  }
  return <>{children(res.data)}</>;
}
