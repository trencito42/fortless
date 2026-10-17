/**
 * Petal Design System — Tabs & Segment Controls
 * Handles click activation and ArrowLeft/Right/Home/End keyboard navigation.
 */

export function initTabs(container: Element | string): () => void {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return () => {};

  const buttons = (): HTMLButtonElement[] =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

  function activate(btn: HTMLButtonElement, focus = false): void {
    buttons().forEach((b) => {
      const panel = document.getElementById(b.getAttribute('aria-controls') || '');
      const isActive = b === btn;
      b.setAttribute('aria-selected', String(isActive));
      b.tabIndex = isActive ? 0 : -1;
      if (panel) {
        panel.hidden = !isActive;
        panel.classList.toggle('on', isActive);
      }
    });
    if (focus) btn.focus();
  }

  const handleClick = (e: Event) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (btn && el.contains(btn)) activate(btn);
  };

  const handleKeydown = (e: Event) => {
    const ke = e as KeyboardEvent;
    const current = (ke.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (!current || !el.contains(current)) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ke.key)) return;
    const tabs = buttons();
    const idx = tabs.indexOf(current);
    const next =
      ke.key === 'Home' ? 0
      : ke.key === 'End' ? tabs.length - 1
      : (idx + (ke.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    ke.preventDefault();
    const nextBtn = tabs[next];
    if (nextBtn) activate(nextBtn, true);
  };

  el.addEventListener('click', handleClick);
  el.addEventListener('keydown', handleKeydown);

  return () => {
    el.removeEventListener('click', handleClick);
    el.removeEventListener('keydown', handleKeydown);
  };
}

export function initTabsById(containerId: string): () => void {
  const el = document.getElementById(containerId);
  return el ? initTabs(el) : () => {};
}
