/**
 * Petal Design System — Empty State (.z-es) Component
 * Source: blueprint/fortless-blueprint/design/parts/z5.css:55
 */

import { hero } from './icons.js';
import { esc } from '../../core/utils/dom.js';

export interface EmptyStateOptions {
  icon?: string;
  title: string;
  message: string;
  actionHtml?: string;
}

export function renderEmptyState(options: EmptyStateOptions): string {
  const iconHtml = hero(options.icon || 'cube', 'l');
  return `
    <div class="z-es">
      <div class="z-art">
        <i class="a"></i>
        <i class="b"></i>
        <i class="c"></i>
        ${iconHtml}
      </div>
      <h4>${esc(options.title)}</h4>
      <p>${esc(options.message)}</p>
      ${options.actionHtml || ''}
    </div>
  `;
}
