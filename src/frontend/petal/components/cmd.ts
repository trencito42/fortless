/**
 * Petal Design System — Command Palette Controller
 * Source: blueprint/fortless-blueprint/design/parts/z5.js & panel.html
 */

import { api } from '../../core/api/client.js';
import { esc } from '../../core/utils/dom.js';
import { hero } from './icons.js';

export interface CommandItem {
  category: string;
  title: string;
  subtitle?: string;
  icon?: string;
  action: () => void;
}

export class CommandPaletteController {
  private cmdList: CommandItem[] = [];
  private activeIndex = 0;
  private debounceTimer: number | null = null;
  private modalId: string;
  private inputId: string;
  private resultsId: string;

  constructor(modalId = 'cmd', inputId = 'cmd-in', resultsId = 'cmd-res') {
    this.modalId = modalId;
    this.inputId = inputId;
    this.resultsId = resultsId;
  }

  public open(): void {
    const modal = document.getElementById(this.modalId);
    if (!modal) return;
    modal.hidden = false;
    const inp = document.getElementById(this.inputId) as HTMLInputElement | null;
    if (inp) {
      inp.value = '';
      inp.focus();
    }
    this.search('');
  }

  public close(): void {
    const modal = document.getElementById(this.modalId);
    if (modal) modal.hidden = true;
  }

  public isOpen(): boolean {
    const modal = document.getElementById(this.modalId);
    return Boolean(modal && !modal.hidden);
  }

  public async search(query: string): Promise<void> {
    const resBox = document.getElementById(this.resultsId);
    if (!resBox) return;

    try {
      const q = (query || '').trim();
      const res = await api<any>(`/api/v1/search?q=${encodeURIComponent(q)}`);
      this.cmdList = [];

      // Unified parser for both customer and admin payloads
      const data = res.results || res;

      if (data.pages) {
        data.pages.forEach((p: any) =>
          this.cmdList.push({
            category: 'Navigation',
            title: p.title,
            icon: 'servers',
            action: () => {
              window.location.href = p.path;
            },
          })
        );
      }

      if (data.adminPages) {
        data.adminPages.forEach((p: any) =>
          this.cmdList.push({
            category: 'Admin Control',
            title: p.title,
            icon: 'shield',
            action: () => {
              window.location.href = p.path;
            },
          })
        );
      }

      if (data.services) {
        data.services.forEach((s: any) =>
          this.cmdList.push({
            category: 'Services',
            title: s.title,
            subtitle: s.subtitle,
            icon: 'servers',
            action: () => {
              window.location.href = `/app/services/${encodeURIComponent(s.id)}`;
            },
          })
        );
      }

      if (data.tickets) {
        data.tickets.forEach((t: any) =>
          this.cmdList.push({
            category: 'Tickets',
            title: t.title,
            subtitle: t.subtitle,
            icon: 'support',
            action: () => {
              const url = window.location.pathname.startsWith('/admin') ? `/admin/tickets` : `/app/support`;
              window.location.href = url;
            },
          })
        );
      }

      if (data.invoices) {
        data.invoices.forEach((inv: any) =>
          this.cmdList.push({
            category: 'Billing',
            title: inv.title,
            subtitle: inv.subtitle,
            icon: 'credit',
            action: () => {
              window.location.href = '/app/billing';
            },
          })
        );
      }

      if (!this.cmdList.length) {
        resBox.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px">
            No matching resources found for "${esc(q)}"
          </div>
        `;
        return;
      }

      this.activeIndex = 0;
      let html = '';
      let lastCat = '';

      this.cmdList.slice(0, 15).forEach((item, i) => {
        if (item.category !== lastCat) {
          html += `<div class="hd">${esc(item.category)}</div>`;
          lastCat = item.category;
        }
        html += `
          <button type="button" class="it ${i === 0 ? 'act' : ''}" data-cmd-idx="${i}">
            ${hero(item.icon || 'cube', 's')}
            <span style="display:flex;flex-direction:column;gap:1px;min-width:0;flex:1">
              <span style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.title)}</span>
              ${item.subtitle ? `<span style="font-size:11px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.subtitle)}</span>` : ''}
            </span>
          </button>
        `;
      });

      resBox.innerHTML = html;
    } catch {
      resBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--bad)">Search request failed.</div>';
    }
  }

  public moveSelection(dir: number): void {
    const items = document.querySelectorAll(`#${this.resultsId} .it`);
    if (!items.length) return;
    this.activeIndex = (this.activeIndex + dir + items.length) % items.length;
    items.forEach((btn, i) => {
      btn.classList.toggle('act', i === this.activeIndex);
      if (i === this.activeIndex) btn.scrollIntoView({ block: 'nearest' });
    });
  }

  public execute(idx = this.activeIndex): void {
    const item = this.cmdList[idx];
    if (item && item.action) {
      this.close();
      item.action();
    }
  }

  public bindKeyboard(): () => void {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (this.isOpen()) this.close();
        else this.open();
        return;
      }

      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
        return;
      }

      if (this.isOpen()) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveSelection(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveSelection(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.execute();
        }
      }
    };

    const handleInput = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.id === this.inputId) {
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => {
          this.search((target as HTMLInputElement).value);
        }, 180);
      }
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cmdItem = target.closest<HTMLElement>('[data-cmd-idx]');
      if (cmdItem) {
        this.execute(Number(cmdItem.dataset.cmdIdx));
        return;
      }
      if (target.id === this.modalId) {
        this.close();
      }
    };

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('input', handleInput);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('input', handleInput);
      document.removeEventListener('click', handleClick);
    };
  }
}
