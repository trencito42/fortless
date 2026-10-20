import { lazy, Suspense } from 'react';
import { Skeleton } from '../primitives/Skeleton';
import type { CodeEditorImplProps } from './CodeEditorImpl';

export type { EditorLanguage } from './CodeEditorImpl';
const Impl = lazy(() => import('./CodeEditorImpl').then((m) => ({ default: m.CodeEditorImpl })));

export interface CodeEditorProps extends Omit<CodeEditorImplProps, 'height'> {
  height?: number | string;
}

/** Config and script editor (server.properties, JSON, YAML, JS). CodeMirror loads on demand. Unsaved-change handling belongs to the caller. */
export function CodeEditor({ height = 360, ...rest }: CodeEditorProps) {
  return (
    <Suspense fallback={<Skeleton className="w-full" />}>
      <Impl height={height} {...rest} />
    </Suspense>
  );
}
