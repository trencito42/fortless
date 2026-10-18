/**
 * Petal Design System — Modal & Dialog Management
 * Source: blueprint/fortless-blueprint/design/parts/z5.js
 */

const BASE_MODAL_Z = 900;
const PRIORITY_MODAL_Z = 1200;
const openModalStack: HTMLElement[] = [];

function isPriorityModal(el: HTMLElement): boolean {
  return (
    el.id === 'modalStepUp' ||
    el.classList.contains('stepup') ||
    el.getAttribute('data-priority') === 'high'
  );
}

export function updateModalStacking(modal: HTMLElement, isOpen: boolean): void {
  if (isOpen) {
    if (!openModalStack.includes(modal)) {
      openModalStack.push(modal);
    }
  } else {
    const idx = openModalStack.indexOf(modal);
    if (idx !== -1) {
      openModalStack.splice(idx, 1);
    }
    modal.style.removeProperty('z-index');
    const ov = modal.querySelector<HTMLElement>('.ov');
    const bx = modal.querySelector<HTMLElement>('.bx');
    if (ov) ov.style.removeProperty('z-index');
    if (bx) bx.style.removeProperty('z-index');
    return;
  }

  // Recalculate z-index for all open modals according to order & priority
  let standardCount = 0;
  let priorityCount = 0;

  openModalStack.forEach((el) => {
    const isPri = isPriorityModal(el);
    const z = isPri
      ? PRIORITY_MODAL_Z + priorityCount * 20
      : BASE_MODAL_Z + standardCount * 20;

    if (isPri) priorityCount++;
    else standardCount++;

    el.style.zIndex = String(z);
    const ov = el.querySelector<HTMLElement>('.ov');
    const bx = el.querySelector<HTMLElement>('.bx');
    if (ov) ov.style.zIndex = String(z);
    if (bx) bx.style.zIndex = String(z + 1);
  });
}

/**
 * Initializes global observer so ANY modal toggled via .hidden or style.display
 * automatically participates in clean layered stacking without DOM race conditions.
 */
let stackerInitialized = false;
export function initModalStacker(): void {
  if (stackerInitialized || typeof window === 'undefined') return;
  stackerInitialized = true;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const target = mutation.target as HTMLElement;
        if (target.classList?.contains('mdl')) {
          const isVisible = !target.hidden && target.style.display !== 'none';
          updateModalStacking(target, isVisible);
        }
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['hidden', 'style', 'class'],
  });

  // Check currently visible modals on page init
  document.querySelectorAll<HTMLElement>('.mdl').forEach((el) => {
    const isVisible = !el.hidden && el.style.display !== 'none';
    if (isVisible) updateModalStacking(el, true);
  });
}

export function openModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.hidden = false;
  updateModalStacking(modal, true);

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
    updateModalStacking(modal, false);
  }
}

export function setupModalBackdrop(modalId: string, onClose?: () => void): () => void {
  const modal = document.getElementById(modalId);
  if (!modal) return () => {};

  const handleClick = (e: MouseEvent) => {
    if (e.target === modal || (e.target as HTMLElement).classList.contains('ov')) {
      closeModal(modalId);
      if (onClose) onClose();
    }
  };

  modal.addEventListener('click', handleClick);
  return () => modal.removeEventListener('click', handleClick);
}
