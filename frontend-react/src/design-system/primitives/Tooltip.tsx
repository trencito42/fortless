import type { ReactElement, ReactNode } from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';

export const TooltipProvider = BaseTooltip.Provider;

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

/**
 * Hover and keyboard-focus hint for icon buttons and truncated text. Never the only place critical information lives:
 * touch users cannot hover. The trigger is the child element itself, so no wrapper is added to the DOM.
 */
export function Tooltip({ content, children, side = 'top', delay = 350 }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} delay={delay} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={8} className="z-[70]">
          <BaseTooltip.Popup className="max-w-[260px] rounded-sm bg-ink px-3 py-2 text-[12.5px] leading-snug font-semibold text-on-ink origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
