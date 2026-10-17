/**
 * Petal Design System — Global Toast Notifications
 * Source: blueprint/fortless-blueprint/design/parts/z5.js
 */

import { hero } from './icons.js';
import { esc } from '../../core/utils/dom.js';

export type ToastType = 'info' | 'good' | 'warn' | 'bad';

export function toast(message: string, type: ToastType = 'info'): void {
  const host = document.getElementById('toasts') || createToastHost();
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.setAttribute('role', type === 'bad' ? 'alert' : 'status');
  
  const iconName = type === 'bad' || type === 'warn' ? 'warning' : 'check';
  item.innerHTML = `${hero(iconName, 's')}<span>${esc(message)}</span>`;
  
  host.appendChild(item);
  
  window.setTimeout(() => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(6px)';
    window.setTimeout(() => item.remove(), 220);
  }, 4200);
}

function createToastHost(): HTMLElement {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.className = 'toasts';
    document.body.appendChild(host);
  }
  return host;
}
