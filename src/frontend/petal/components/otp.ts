/**
 * Petal Design System — OTP Input Component
 * Auto-advance on digit entry, paste a full code, backspace to previous.
 */

function resolveEl(container: Element | string): HTMLElement | null {
  if (typeof container === 'string') return document.querySelector<HTMLElement>(container);
  return container as HTMLElement;
}

export function initOtp(container: Element | string): () => void {
  const el = resolveEl(container);
  if (!el) return () => {};

  const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input'));

  const handleKeydown = (e: Event) => {
    const ke = e as KeyboardEvent;
    const inp = ke.target as HTMLInputElement;
    const idx = inputs.indexOf(inp);
    if (idx === -1) return;

    if (ke.key === 'Backspace' && !inp.value && idx > 0) {
      inputs[idx - 1]?.focus();
      inputs[idx - 1]?.select();
    }
    if (ke.key === 'ArrowLeft' && idx > 0) inputs[idx - 1]?.focus();
    if (ke.key === 'ArrowRight' && idx < inputs.length - 1) inputs[idx + 1]?.focus();
  };

  const handleInput = (e: Event) => {
    const inp = e.target as HTMLInputElement;
    const idx = inputs.indexOf(inp);
    if (idx === -1) return;

    const val = inp.value.replace(/\D/g, '');
    inp.value = val.slice(-1);

    if (val && idx < inputs.length - 1) {
      const next = inputs[idx + 1];
      if (next) { next.focus(); next.select(); }
    }
  };

  const handlePaste = (e: Event) => {
    e.preventDefault();
    const ce = e as ClipboardEvent;
    const text = (ce.clipboardData?.getData('text') || '').replace(/\D/g, '');
    const start = inputs.indexOf(ce.target as HTMLInputElement);
    if (start === -1) return;
    text.split('').forEach((ch, i) => {
      const inp = inputs[start + i];
      if (inp) inp.value = ch;
    });
    const last = Math.min(start + text.length, inputs.length - 1);
    inputs[last]?.focus();
  };

  el.addEventListener('keydown', handleKeydown);
  el.addEventListener('input', handleInput);
  el.addEventListener('paste', handlePaste);

  return () => {
    el.removeEventListener('keydown', handleKeydown);
    el.removeEventListener('input', handleInput);
    el.removeEventListener('paste', handlePaste);
  };
}

export function getOtpValue(container: Element | string): string {
  const el = resolveEl(container);
  if (!el) return '';
  return Array.from(el.querySelectorAll<HTMLInputElement>('input'))
    .map((i) => i.value)
    .join('');
}

export function clearOtp(container: Element | string): void {
  const el = resolveEl(container);
  if (!el) return;
  el.querySelectorAll<HTMLInputElement>('input').forEach((i) => (i.value = ''));
}

export function shakeOtp(container: Element | string): void {
  const el = resolveEl(container);
  if (!el) return;
  el.classList.add('bad');
  setTimeout(() => el.classList.remove('bad'), 500);
}
