import type { ReactNode } from 'react';
import type { IconName } from '../icons/Icon';

export type MenuEntry =
  | { kind?: 'item'; id: string; label: string; icon?: IconName; shortcut?: string; tone?: 'default' | 'danger'; disabled?: boolean; disabledReason?: string; onSelect?: () => void; href?: string }
  | { kind: 'checkbox'; id: string; label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }
  | { kind: 'radio-group'; id: string; label?: string; value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[] }
  | { kind: 'group'; id: string; label: string; items: MenuEntry[] }
  | { kind: 'submenu'; id: string; label: string; icon?: IconName; items: MenuEntry[] }
  | { kind: 'separator'; id: string };

export interface MenuTriggerProps {
  label?: ReactNode;
}
