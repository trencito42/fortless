import { lazy, Suspense } from 'react';
import { Skeleton } from '../primitives/Skeleton';

const Impl = lazy(() => import('./DiffViewerImpl').then((m) => ({ default: m.DiffViewerImpl })));

/** Read-only unified diff between two texts (before saving a config, comparing backups). Loads CodeMirror on demand. */
export function DiffViewer({ original, modified, label = 'Changes', height = 300 }: { original: string; modified: string; label?: string; height?: number | string }) {
  return (
    <Suspense fallback={<Skeleton className="w-full" />}>
      <Impl original={original} modified={modified} label={label} height={height} />
    </Suspense>
  );
}
