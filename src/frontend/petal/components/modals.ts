/**
 * Petal Design System — Modal & Dialog Management
 * Source: blueprint/fortless-blueprint/design/parts/z5.js
 */

export function openModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.hidden = false;
  
  // Focus first interactive element or input
  const focusable = modal.querySelector<HTMLElement>(
    'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
  );
  if (focusable) {
    setTimeout(() => focusable.focus(), 50);
  }
}

export function closeModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.hidden = true;
  }
}

export function setupModalBackdrop(modalId: string, onClose?: () => void): () => void {
  const modal = document.getElementById(modalId);
  if (!modal) return () => {};

  const handleClick = (e: MouseEvent) => {
    if (e.target === modal) {
      closeModal(modalId);
      if (onClose) onClose();
    }
  };

  modal.addEventListener('click', handleClick);
  return () => modal.removeEventListener('click', handleClick);
}
