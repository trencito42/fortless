/**
 * Shared surface recipes for floating layers (menus, popovers, listboxes, tooltips).
 * Floating layers get a hairline ring: it is the only edge in the system, because a flat popup
 * on a flat card of the same tone would otherwise disappear.
 */
export const popupSurface =
  'rounded-lg bg-s1 p-1.5 ring-1 ring-ink/10 outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0';

export const menuItemStyles =
  'flex min-h-11 md:min-h-9 w-full cursor-default items-center gap-3 rounded-sm px-3 py-2 text-[14px] leading-tight font-semibold text-ink2 outline-none select-none data-[highlighted]:bg-s2 data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

export const menuLabelStyles = 'px-3 pt-2 pb-1 text-xs font-bold text-ink3';
export const menuSeparatorStyles = 'my-1 h-px bg-ink/10';
export const positionerStyles = 'z-[70] outline-none';
