import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '../primitives/Button';
import { AlertDialog } from '../overlays/AlertDialog';

export interface DestructiveActionProps extends Omit<ButtonProps, 'onClick' | 'variant'> {
  /** Label on the opening button. */
  children: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Typed confirmation for irreversible actions on named resources. */
  requireText?: string;
  onConfirm: () => void | Promise<void>;
  variant?: 'danger' | 'danger-subtle';
}

/** Button plus confirmation. The action never runs from the first click, and errors surface inside the confirmation. */
export function DestructiveAction({ children, title, description, confirmLabel, requireText, onConfirm, variant = 'danger-subtle', ...button }: DestructiveActionProps) {
  return (
    <AlertDialog
      tone="danger"
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      requireText={requireText}
      onConfirm={onConfirm}
      trigger={<Button {...button} variant={variant}>{children}</Button>}
    />
  );
}
