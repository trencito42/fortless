/**
 * UI-06: segmented filters are radio groups made of a hidden native input and a styled label. The hidden input cannot
 * take focus, so the group was unreachable by keyboard. This makes the styled control the single tab stop of the group
 * (roving tabindex), moves the selection with the arrow keys, and keeps aria-checked in step with the native input.
 */
export function initRadioGroups(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.seg[role="radiogroup"]').forEach((group) => {
    if (group.dataset['rg'] === '1') return;
    const items = (): HTMLElement[] => [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    const inputOf = (item: HTMLElement) => item.closest('label')?.querySelector<HTMLInputElement>('input[type="radio"]') ?? null;
    if (!items().length || !items().every((i) => inputOf(i))) return;
    group.dataset['rg'] = '1';

    const sync = () => {
      const all = items();
      const active = all.find((i) => inputOf(i)?.checked) ?? all[0];
      for (const item of all) {
        item.setAttribute('aria-checked', String(item === active));
        item.tabIndex = item === active ? 0 : -1;
      }
    };
    sync();
    group.addEventListener('change', sync);

    group.addEventListener('keydown', (event) => {
      const all = items();
      const current = all.indexOf(document.activeElement as HTMLElement);
      if (current === -1) return;
      let next = current;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % all.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + all.length) % all.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = all.length - 1;
      else if (event.key === ' ' || event.key === 'Enter') next = current;
      else return;
      event.preventDefault();
      const target = all[next]!;
      inputOf(target)?.click();
      sync();
      target.focus();
    });
  });
}
