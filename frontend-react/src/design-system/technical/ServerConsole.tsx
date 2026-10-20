import { forwardRef, lazy, Suspense } from 'react';
import { Skeleton } from '../primitives/Skeleton';
import type { ConsoleHandle, ServerConsoleImplProps } from './ServerConsoleImpl';

export type { ConsoleHandle };
const Impl = lazy(() => import('./ServerConsoleImpl').then((m) => ({ default: m.ServerConsoleImpl })));

export interface ServerConsoleProps extends Omit<ServerConsoleImplProps, 'height' | 'label'> {
  height?: number;
  label?: string;
}

/**
 * Live console for a game server or bot. xterm.js is loaded on demand (about 300 KB), so pages without a console stay light.
 * The component renders whatever you write through the ref; it never invents output. Connection state belongs to the caller:
 * pass `inputDisabledReason` when the server is offline.
 */
export const ServerConsole = forwardRef<ConsoleHandle, ServerConsoleProps>(function ServerConsole({ height = 320, label = 'Server console', ...rest }, ref) {
  return (
    <Suspense fallback={<Skeleton className="w-full" />}>
      <Impl ref={ref} height={height} label={label} {...rest} />
    </Suspense>
  );
});
