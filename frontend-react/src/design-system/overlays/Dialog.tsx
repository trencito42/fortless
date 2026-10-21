import { useRef, type ReactElement, type ReactNode } from 'react';
import { useSheetDrag } from './useSheetDrag';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';
import { IconButton } from '../primitives/IconButton';

const panel = cva(
  [
    'fixed flex max-h-[92dvh] flex-col bg-s1 text-ink outline-none',
    'transition-[transform,opacity] duration-300 ease-petal',
  ],
  {
    variants: {
      /** "dialog" is centered from md up and a bottom sheet below. "sheet" is always a bottom sheet. "drawer" slides in from the right. */
      placement: {
        dialog: 'inset-x-0 bottom-0 rounded-t-xl pb-safe data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full md:inset-auto md:top-1/2 md:left-1/2 md:w-[calc(100%-32px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:pb-0 md:data-[starting-style]:translate-y-[calc(-50%+12px)] md:data-[starting-style]:opacity-0 md:data-[ending-style]:translate-y-[calc(-50%+12px)] md:data-[ending-style]:opacity-0',
        sheet: 'inset-x-0 bottom-0 rounded-t-xl pb-safe data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full md:inset-x-auto md:left-1/2 md:w-[min(560px,100%)] md:-translate-x-1/2',
        drawer: 'inset-y-0 right-0 h-dvh max-h-none w-[min(440px,100%)] rounded-l-xl data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:h-auto max-md:max-h-[92dvh] max-md:w-full max-md:rounded-l-none max-md:rounded-t-xl max-md:data-[starting-style]:translate-x-0 max-md:data-[starting-style]:translate-y-full max-md:data-[ending-style]:translate-x-0 max-md:data-[ending-style]:translate-y-full',
      },
      size: { sm: 'md:max-w-[420px]', md: 'md:max-w-[520px]', lg: 'md:max-w-[720px]', xl: 'md:max-w-[960px]' },
    },
    compoundVariants: [{ placement: 'drawer', className: 'md:max-w-none' }],
    defaultVariants: { placement: 'dialog', size: 'md' },
  },
);

export interface DialogProps extends VariantProps<typeof panel> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog. Optional: dialogs can be driven by `open`. */
  trigger?: ReactElement<Record<string, unknown>>;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions. Primary action last. */
  footer?: ReactNode;
  /** Hide the close button (use only when the footer offers an explicit way out). */
  hideClose?: boolean;
  className?: string;
}

/**
 * Modal surface. Focus is trapped and returned to the trigger on close, Escape and outside press dismiss,
 * page scroll is locked. Below md it becomes a bottom sheet so thumbs can reach the actions.
 */
export function Dialog({ open, defaultOpen, onOpenChange, trigger, title, description, children, footer, placement, size, hideClose, className }: DialogProps) {
  const closer = useRef<HTMLButtonElement>(null);
  const drag = useSheetDrag(() => closer.current?.click());
  return (
    <BaseDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <BaseDialog.Trigger render={trigger} /> : null}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[60] bg-overlay transition-opacity duration-300 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseDialog.Popup ref={drag.popup as never} className={cn(panel({ placement, size }), 'z-[61] max-md:overscroll-contain', className)}>
          <BaseDialog.Close ref={closer} tabIndex={-1} aria-hidden="true" className="hidden" />
          <div aria-hidden="true" {...drag.handleProps} className="mx-auto mt-2 h-6 w-full shrink-0 cursor-grab md:hidden"><div className="mx-auto mt-1.5 h-1.25 w-10 rounded-full bg-s4" /></div>
          <div {...drag.handleProps} className="flex items-start justify-between gap-4 px-6 pt-6 pb-3 max-md:pt-1">
            <div className="grid min-w-0 gap-1">
              <BaseDialog.Title className="text-[22px] leading-tight font-extrabold tracking-[-0.04em]">{title}</BaseDialog.Title>
              {description ? <BaseDialog.Description className="text-ink2">{description}</BaseDialog.Description> : null}
            </div>
            {hideClose ? null : <BaseDialog.Close render={<IconButton label="Close" icon="cancel-01" size="sm" variant="secondary" />} />}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-6 py-2">{children}</div>
          {footer ? <div className="flex flex-col-reverse gap-2 px-6 pt-4 pb-6 sm:flex-row sm:justify-end">{footer}</div> : <div className="h-4" />}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export const DialogClose = BaseDialog.Close;
