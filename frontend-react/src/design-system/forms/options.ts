export interface Option {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Group heading. Options with the same group are listed together. */
  group?: string;
  /** Extra text matched by search (aliases, ids). */
  keywords?: string;
}

export interface OptionGroup {
  value: string;
  items: Option[];
}

/** Turns a flat list into Base UI groups when any option has a group. Order of first appearance is kept. */
export function toGroups(options: Option[]): Option[] | OptionGroup[] {
  if (!options.some((o) => o.group)) return options;
  const map = new Map<string, Option[]>();
  for (const o of options) {
    const key = o.group ?? 'Other';
    const arr = map.get(key) ?? [];
    arr.push(o);
    map.set(key, arr);
  }
  return Array.from(map, ([value, items]) => ({ value, items }));
}
