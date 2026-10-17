/**
 * Petal Design System — Alert & Error Banners
 */

import { hero } from './icons.js';
import { esc } from '../../core/utils/dom.js';

export type AlertVariant = 'info' | 'good' | 'warn' | 'bad';

const ICON_MAP: Record<AlertVariant, string> = {
  info: 'warning',
  good: 'check',
  warn: 'warning',
  bad: 'warning',
};

export function renderAlert(
  variant: AlertVariant,
  title: string,
  body?: string,
  icon?: string
): string {
  const ic = icon || ICON_MAP[variant];
  return `
    <div class="alert ${variant}" role="${variant === 'bad' ? 'alert' : 'status'}">
      ${hero(ic, 's')}
      <div>
        ${title ? `<b>${esc(title)}</b>` : ''}
        ${body ? `<span>${esc(body)}</span>` : ''}
      </div>
    </div>
  `;
}

export function renderError(message: string): string {
  return `
    <div class="empty">
      <div class="ico-b bad" style="width:64px;height:64px;border-radius:22px">${hero('warning', 'l')}</div>
      <h4>Something went wrong</h4>
      <p>${esc(message)}</p>
    </div>
  `;
}
