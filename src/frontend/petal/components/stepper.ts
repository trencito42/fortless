/**
 * Petal Design System — Step Indicator (horizontal + vertical)
 */

import { esc } from '../../core/utils/dom.js';

export interface StepDef {
  label: string;
}

export function renderStepper(steps: StepDef[], activeIndex: number): string {
  return (
    '<div class="steps">' +
    steps
      .map((s, i) => {
        const cls = i < activeIndex ? 'done' : i === activeIndex ? 'cur' : '';
        return (
          (i > 0 ? '<span class="step-conn" style="flex:1;height:3px;border-radius:3px;background:var(--s3);margin:0 4px;min-width:14px"></span>' : '') +
          `<span class="step ${cls}"><i>${i + 1}</i>${esc(s.label)}</span>`
        );
      })
      .join('') +
    '</div>'
  );
}

export function updateStepper(container: Element | string, activeIndex: number): void {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return;
  el.querySelectorAll<HTMLElement>('.step').forEach((step, i) => {
    step.classList.remove('done', 'cur');
    if (i < activeIndex) step.classList.add('done');
    else if (i === activeIndex) step.classList.add('cur');
  });
}
