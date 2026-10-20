import type { IconName } from '../icons/Icon';

/** A destination. `id` is the route key; the app decides how ids map to URLs. */
export interface NavChild {
  id: string;
  label: string;
  /** Hides the item unless the user holds this permission. */
  permission?: string;
  /** Marks a destination that is proposed but not built. Shown as a "New" tag. */
  isNew?: boolean;
  keywords?: string[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  /** Items with a single child (or none) render as a plain link to `id`. */
  children?: NavChild[];
  badge?: string | number;
  permission?: string;
  keywords?: string[];
}

export interface NavGroup {
  id: string;
  /** Empty label renders as a spacer. */
  label?: string;
  items: NavItem[];
}

export interface NavUser {
  name: string;
  initials: string;
  role?: string;
}

export interface MobileTab {
  id: string;
  label: string;
  icon: IconName;
  /** The center action, drawn as the accent button (e.g. Deploy). */
  primary?: boolean;
}
