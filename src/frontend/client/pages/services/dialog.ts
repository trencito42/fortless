/** Petal modal dialogs created on demand (prompt and confirm), so pages never fall back to window.prompt or window.confirm. */
import { esc } from '../../../core/utils/dom.js';

interface Options { title: string; message?: string; confirmLabel?: string; danger?: boolean }
interface PromptOptions extends Options { label?: string; value?: string; placeholder?: string; inputMode?: string; maxLength?: number }

function open<T>(build: (box: HTMLElement, done: (v: T | null) => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'mdl';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<div class="ov"></div><div class="bx" style="max-width:440px"></div>';
    const box = modal.querySelector<HTMLElement>('.bx')!;
    const previous = document.activeElement as HTMLElement | null;
    let finished = false;
    const done = (v: T | null) => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey, true);
      modal.remove();
      previous?.focus?.();
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    modal.querySelector('.ov')!.addEventListener('click', () => done(null));
    build(box, done);
    document.body.appendChild(modal);
    modal.hidden = false;
    (box.querySelector<HTMLElement>('input, button.pri, button.bad') ?? box).focus();
  });
}

const header = (o: Options) => `<h3 style="margin:0">${esc(o.title)}</h3>${o.message ? `<p class="muted" style="font-weight:560;margin:0">${esc(o.message)}</p>` : ''}`;
const footer = (o: Options) => `<div class="row" style="justify-content:flex-end;gap:8px"><button class="btn s" type="button" data-cancel>Cancel</button><button class="btn s ${o.danger ? 'bad' : 'pri'}" type="submit">${esc(o.confirmLabel ?? 'Confirm')}</button></div>`;

export async function confirmDialog(o: Options): Promise<boolean> {
  const res = await open<boolean>((box, done) => {
    box.innerHTML = `<form class="col" style="gap:14px">${header(o)}${footer(o)}</form>`;
    box.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); done(true); });
    box.querySelector('[data-cancel]')!.addEventListener('click', () => done(null));
  });
  return res === true;
}

export async function promptDialog(o: PromptOptions): Promise<string | null> {
  return open<string>((box, done) => {
    box.innerHTML = `<form class="col" style="gap:14px">${header(o)}
      <div class="fld">${o.label ? `<label for="dlgInput">${esc(o.label)}</label>` : ''}<div class="inp"><input id="dlgInput" autocomplete="off" spellcheck="false" ${o.inputMode ? `inputmode="${esc(o.inputMode)}"` : ''} maxlength="${o.maxLength ?? 1024}" placeholder="${esc(o.placeholder ?? '')}"></div></div>
      ${footer(o)}</form>`;
    const input = box.querySelector<HTMLInputElement>('#dlgInput')!;
    input.value = o.value ?? '';
    box.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim(); done(v || null); });
    box.querySelector('[data-cancel]')!.addEventListener('click', () => done(null));
    window.setTimeout(() => input.select(), 0);
  });
}

export interface FormField { key: string; label: string; value?: string; type?: 'text' | 'number' | 'select' | 'checkbox'; options?: Array<[string, string]>; min?: number; max?: number; placeholder?: string }

/** A small multi-field form in a Petal modal. Resolves with the entered values, or null when cancelled. */
export async function formDialog(o: Options & { fields: FormField[] }): Promise<Record<string, string | boolean> | null> {
  return open<Record<string, string | boolean>>((box, done) => {
    const field = (f: FormField) => {
      const id = `dlg_${f.key}`;
      if (f.type === 'checkbox') return `<label class="row nw" style="gap:8px"><input type="checkbox" id="${id}" ${f.value === 'true' ? 'checked' : ''}> ${esc(f.label)}</label>`;
      const control = f.type === 'select'
        ? `<div class="inp sel"><select id="${id}">${(f.options ?? []).map(([v, l]) => `<option value="${esc(v)}" ${v === f.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`
        : `<div class="inp"><input id="${id}" autocomplete="off" ${f.type === 'number' ? `type="number" min="${f.min ?? 0}" max="${f.max ?? 99999}"` : ''} value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder ?? '')}"></div>`;
      return `<div class="fld"><label for="${id}">${esc(f.label)}</label>${control}</div>`;
    };
    box.innerHTML = `<form class="col" style="gap:14px">${header(o)}${o.fields.map(field).join('')}${footer(o)}</form>`;
    box.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const out: Record<string, string | boolean> = {};
      for (const f of o.fields) {
        const el = box.querySelector<HTMLInputElement | HTMLSelectElement>(`#dlg_${f.key}`)!;
        out[f.key] = f.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value;
      }
      done(out);
    });
    box.querySelector('[data-cancel]')!.addEventListener('click', () => done(null));
  });
}
