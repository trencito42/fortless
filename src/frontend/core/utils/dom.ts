export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[ch] || ch));
}

export function qs<T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document): T | null {
  return parent.querySelector<T>(selector);
}

export function qsa<T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

export function bindDelegated<E extends Event = Event>(
  root: HTMLElement | Document,
  eventType: string,
  selector: string,
  handler: (event: E, target: HTMLElement) => void
): () => void {
  const listener = (event: Event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(selector);
    if (target && (root === document || root.contains(target))) {
      handler(event as E, target);
    }
  };
  root.addEventListener(eventType, listener);
  return () => root.removeEventListener(eventType, listener);
}
