/** Original Petal custom select behavior, lifecycle-adapted for dynamic route data. */
import { esc } from '../../core/utils/dom.js';

type EnhancedSelect = HTMLSelectElement & { __petalEnhanced?: boolean; __petalObserver?: MutationObserver };

function closeSelects(except?: HTMLElement): void {
  document.querySelectorAll<HTMLElement>('.inp.sel .dd').forEach((drop) => {
    if (drop !== except) drop.hidden = true;
  });
  document.querySelectorAll<HTMLElement>('.inp.sel .selbtn').forEach((button) => {
    if (!except || button.parentElement?.querySelector('.dd') !== except) button.setAttribute('aria-expanded', 'false');
  });
}

function enhance(select: EnhancedSelect): void {
  if (select.__petalEnhanced) return;
  select.__petalEnhanced = true;
  const wrapper = select.parentElement;
  if (!wrapper) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'selbtn'; button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
  const drop = document.createElement('div'); drop.className = 'dd'; drop.hidden = true;
  wrapper.append(button, drop);
  const draw = () => {
    button.textContent = select.options[select.selectedIndex]?.text || '';
    button.disabled = select.disabled;
    drop.innerHTML = `<div class="menu" role="listbox">${Array.from(select.options).map((option, index) => `<button type="button" role="option" data-petal-option="${index}" aria-selected="${option.selected}">${esc(option.text)}<svg class="ic s ck" aria-hidden="true"><use href="#i-tick-02"/></svg></button>`).join('')}</div>`;
  };
  draw();
  select.__petalObserver = new MutationObserver(draw);
  select.__petalObserver.observe(select, { childList: true, subtree: true, attributes: true });
  button.addEventListener('click', () => {
    const opening = drop.hidden;
    closeSelects(drop);
    drop.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) drop.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  });
  drop.addEventListener('click', (event) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[data-petal-option]');
    if (!option) return;
    select.selectedIndex = Number(option.dataset.petalOption);
    draw(); closeSelects();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    button.focus();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + delta));
      draw(); select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

export function installCustomSelects(root: ParentNode = document): () => void {
  const scan = () => root.querySelectorAll<EnhancedSelect>('.inp.sel select').forEach(enhance);
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  const outside = (event: Event) => { if (!(event.target as HTMLElement).closest('.inp.sel')) closeSelects(); };
  const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeSelects(); };
  document.addEventListener('click', outside);
  document.addEventListener('keydown', keydown);
  return () => { observer.disconnect(); document.removeEventListener('click', outside); document.removeEventListener('keydown', keydown); };
}
