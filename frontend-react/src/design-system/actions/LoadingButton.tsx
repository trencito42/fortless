import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from '../primitives/Button';

export interface LoadingButtonProps extends Omit<ButtonProps, 'loading' | 'onClick'> {
  /** May return a promise. The button shows its loading state until it settles. */
  onClick: (event: React.MouseEvent<HTMLElement>) => void | Promise<void>;
  /** Called when the handler rejects. Without it the error is rethrown so it reaches the global error handler instead of vanishing. */
  onError?: (error: unknown) => void;
}

/** A Button that manages its own pending state from an async handler. Prevents double submits. */
export function LoadingButton({ onClick, onError, ...props }: LoadingButtonProps) {
  const [pending, setPending] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const handle = useCallback(
    async (e: React.MouseEvent<HTMLElement>) => {
      setPending(true);
      try {
        await onClick(e);
      } catch (err) {
        if (onError) onError(err);
        else queueMicrotask(() => { throw err; });
      } finally {
        if (alive.current) setPending(false);
      }
    },
    [onClick, onError],
  );
  return <Button {...props} loading={pending} onClick={handle} />;
}
