import type { ReactNode } from 'react';
import { Dialog } from '../overlays/Dialog';
import { DescriptionList, type DescriptionItem } from './DescriptionList';

export interface DetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  items?: DescriptionItem[];
  children?: ReactNode;
  footer?: ReactNode;
}

/** Side drawer (bottom sheet on phones) for inspecting one row without leaving the list. */
export function DetailPanel({ open, onOpenChange, title, description, items, children, footer }: DetailPanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} placement="drawer" footer={footer}>
      <div className="grid gap-5">
        {items ? <DescriptionList items={items} /> : null}
        {children}
      </div>
    </Dialog>
  );
}
