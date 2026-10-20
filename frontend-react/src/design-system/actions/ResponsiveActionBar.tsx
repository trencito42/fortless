import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, type ButtonVariant } from '../primitives/Button';
import { ActionMenu } from './ActionMenu';
import type { IconName } from '../icons/Icon';
import type { MenuEntry } from './menu-types';

export interface BarAction {
  id: string;
  label: string;
  icon?: IconName;
  variant?: ButtonVariant;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

/**
 * Shows as many actions as fit and moves the rest into a "More" menu. Order is priority: the first actions stay visible longest.
 * Widths are measured from a hidden copy, so labels can change without breaking the layout.
 */
export function ResponsiveActionBar({ actions, size = 'sm', moreLabel = 'More actions' }: { actions: BarAction[]; size?: 'sm' | 'md'; moreLabel?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(actions.length);

  useLayoutEffect(() => {
    const el = wrap.current;
    const g = ghost.current;
    if (!el || !g) return;
    const compute = () => {
      const widths = Array.from(g.children).map((c) => (c as HTMLElement).offsetWidth + 8);
      const moreW = 52;
      const avail = el.clientWidth;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= avail) return setFit(actions.length);
      let used = moreW;
      let n = 0;
      for (const w of widths) {
        if (used + w > avail) break;
        used += w;
        n++;
      }
      setFit(n);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [actions]);

  const overflow: MenuEntry[] = useMemo(
    () => actions.slice(fit).map((a) => ({ id: a.id, label: a.label, icon: a.icon, disabled: a.disabled, tone: a.tone, onSelect: a.onSelect })),
    [actions, fit],
  );

  return (
    <div ref={wrap} className="relative flex min-w-0 flex-1 items-center justify-end gap-2">
      {actions.slice(0, fit).map((a) => (
        <Button key={a.id} size={size} variant={a.variant ?? 'secondary'} leadingIcon={a.icon} disabled={a.disabled} onClick={a.onSelect}>
          {a.label}
        </Button>
      ))}
      {overflow.length ? <ActionMenu entries={overflow} label={moreLabel} /> : null}
      <div ref={ghost} aria-hidden="true" inert className="pointer-events-none invisible absolute top-0 left-0 flex h-0 gap-2 overflow-hidden whitespace-nowrap">
        {actions.map((a) => (
          <Button key={a.id} size={size} variant={a.variant ?? 'secondary'} leadingIcon={a.icon} tabIndex={-1}>{a.label}</Button>
        ))}
      </div>
    </div>
  );
}
