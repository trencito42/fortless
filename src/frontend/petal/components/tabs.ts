/**
 * Petal Design System — Tabs & Segment Controls
 */

export function initTabs(container: Element | string): () => void {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return () => {};

  const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

  function activate(btn: HTMLButtonElement): void {
    buttons.forEach((b) => {
      const panel = document.getElementById(b.getAttribute('aria-controls') || '');
      const isActive = b === btn;
      b.setAttribute('aria-selected', String(isActive));
      if (panel) {
        panel.hidden = !isActive;
        panel.classList.toggle('on', isActive);
      }
    });
  }

  const handleClick = (e: Event) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (btn && el.contains(btn)) activate(btn);
  };

  el.addEventListener('click', handleClick);
  return () => el.removeEventListener('click', handleClick);
}

export function initTabsById(containerId: string): () => void {
  const el = document.getElementById(containerId);
  return el ? initTabs(el) : () => {};
}
