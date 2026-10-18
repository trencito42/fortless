/**
 * Petal Design System — Command Palette Controller
 * Matches Petal Fortless Views: .mdl.cmd > .bx > .inp + .col > .dh + .li
 */

import { api } from '../../core/api/client.js';
import { esc } from '../../core/utils/dom.js';

export interface CommandItem {
  category: string;
  title: string;
  subtitle?: string;
  icon?: string;
  kbd?: string;
  action: () => void;
}

function spaNavigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
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
    this.renderDefaultNavigation();
  }

  public close(): void {
    const modal = document.getElementById(this.modalId);
    if (modal) modal.hidden = true;
  }

  public isOpen(): boolean {
    const modal = document.getElementById(this.modalId);
    return Boolean(modal && !modal.hidden);
  }

  private getDefaultNavItems(): CommandItem[] {
    const isAdmin = window.location.pathname.startsWith('/admin');
    if (isAdmin) {
      return [
        { category: 'Navigate', title: 'Operations Overview', icon: 'dashboard-square-01', kbd: 'G O', action: () => spaNavigate('/admin') },
        { category: 'Navigate', title: 'Customer Accounts', icon: 'shield-user', kbd: 'G A', action: () => spaNavigate('/admin/accounts') },
        { category: 'Navigate', title: 'Managed Instances', icon: 'server', kbd: 'G S', action: () => spaNavigate('/admin/services') },
        { category: 'Navigate', title: 'Support Helpdesk', icon: 'message-01', kbd: 'G T', action: () => spaNavigate('/admin/tickets') },
        { category: 'Navigate', title: 'Security Audit Trail', icon: 'history', action: () => spaNavigate('/admin/audit') },
        { category: 'Navigate', title: 'Staff Directory', icon: 'user-group', action: () => spaNavigate('/admin/staff') },
        { category: 'Switch', title: 'Back to Client App', icon: 'arrow-right-01', action: () => spaNavigate('/app') },
      ];
    }
    return [
      { category: 'Navigate', title: 'Dashboard', icon: 'dashboard-square-01', kbd: 'G D', action: () => spaNavigate('/app') },
      { category: 'Navigate', title: 'Servers & Instances', icon: 'server', kbd: 'G S', action: () => spaNavigate('/app/services') },
      { category: 'Navigate', title: 'Deploy Instance', icon: 'rocket-01', kbd: 'G R', action: () => spaNavigate('/app/deploy') },
      { category: 'Navigate', title: 'Domains & DNS', icon: 'globe-02', action: () => spaNavigate('/app/domains') },
      { category: 'Navigate', title: 'Invoices & Billing', icon: 'invoice-01', action: () => spaNavigate('/app/billing') },
      { category: 'Navigate', title: 'Support Tickets', icon: 'message-01', action: () => spaNavigate('/app/support') },
      { category: 'Navigate', title: 'Security & Team', icon: 'shield-user', action: () => spaNavigate('/app/settings') },
      { category: 'Navigate', title: 'Audit Trail', icon: 'history', action: () => spaNavigate('/app/activity') },
    ];
  }

  public renderDefaultNavigation(): void {
    const resBox = document.getElementById(this.resultsId);
    if (!resBox) return;

    this.cmdList = this.getDefaultNavItems();
    this.activeIndex = 0;
    this.renderItems(resBox);
  }

  public async search(query: string): Promise<void> {
    const resBox = document.getElementById(this.resultsId);
    if (!resBox) return;

    const q = (query || '').trim();
    if (!q) {
      this.renderDefaultNavigation();
      return;
    }

    try {
      const res = await api<any>(`/api/v1/search?q=${encodeURIComponent(q)}`);
      this.cmdList = [];
      const data = res.results || res;

      if (data.pages) {
        data.pages.forEach((p: any) =>
          this.cmdList.push({
            category: 'Navigation',
            title: p.title,
            icon: 'server',
            action: () => spaNavigate(p.path),
          })
        );
      }

      if (data.adminPages) {
        data.adminPages.forEach((p: any) =>
          this.cmdList.push({
            category: 'Admin Control',
            title: p.title,
            icon: 'shield-user',
            action: () => spaNavigate(p.path),
          })
        );
      }

      if (data.services) {
        data.services.forEach((s: any) =>
          this.cmdList.push({
            category: 'Services',
            title: s.title,
            subtitle: s.subtitle,
            icon: 'server',
            action: () => spaNavigate(`/app/services/${encodeURIComponent(s.id)}`),
          })
        );
      }

      if (data.tickets) {
        data.tickets.forEach((t: any) =>
          this.cmdList.push({
            category: 'Tickets',
            title: t.title,
            subtitle: t.subtitle,
            icon: 'message-01',
            action: () => {
              const url = window.location.pathname.startsWith('/admin') ? `/admin/tickets` : `/app/support`;
              spaNavigate(url);
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
            icon: 'invoice-01',
            action: () => spaNavigate('/app/billing'),
          })
        );
      }

      if (!this.cmdList.length) {
        resBox.innerHTML = `
          <div class="es" data-c="Empty state" style="padding:28px 16px">
            <span class="tile neu md"><svg class="ic" aria-hidden="true"><use href="/assets/petal-icons.svg#i-search-01"/></svg></span>
            <p style="margin:8px 0 0;color:var(--ink2);font-weight:600">No results found for "${esc(q)}"</p>
          </div>
        `;
        return;
      }

      this.activeIndex = 0;
      this.renderItems(resBox);
    } catch {
      resBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--bad);font-weight:600">Search request failed.</div>';
    }
  }

  private renderItems(container: HTMLElement): void {
    let html = '';
    let lastCat = '';

    this.cmdList.slice(0, 20).forEach((item, i) => {
      if (item.category !== lastCat) {
        html += `<div class="dh">${esc(item.category)}</div>`;
        lastCat = item.category;
      }
      const icon = item.icon || 'server';
      html += `
        <button type="button" class="li ${i === this.activeIndex ? 'on' : ''}" data-cmd-idx="${i}" style="padding:11px 12px;cursor:pointer">
          <span class="tile neu sm"><svg class="ic" aria-hidden="true"><use href="/assets/petal-icons.svg#i-${icon}"/></svg></span>
          <span class="tx">
            <b>${esc(item.title)}</b>
            ${item.subtitle ? `<small>${esc(item.subtitle)}</small>` : ''}
          </span>
          ${item.kbd ? `<span class="kbd">${esc(item.kbd)}</span>` : ''}
        </button>
      `;
    });

    container.innerHTML = html;
  }

  public moveSelection(dir: number): void {
    const items = document.querySelectorAll<HTMLElement>(`#${this.resultsId} .li`);
    if (!items.length) return;
    this.activeIndex = (this.activeIndex + dir + items.length) % items.length;
    items.forEach((btn, i) => {
      btn.classList.toggle('on', i === this.activeIndex);
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
      if (target.id === this.modalId || target.matches(`#${this.modalId} .ov`)) {
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
