import { useState } from 'react';
import { Icon, NavTree, type NavGroup } from '@/design-system';
import { cn } from '@/lib/utils/cn';

const KEY = 'fl-admin-nav-groups';
const read = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; } };

/** Sidebar navigation: collapsible groups (state remembered per browser) with the shared NavTree inside each; icon rail when `collapsed`. */
export function AdminSidebar({ groups, currentId, onNavigate, collapsed }: { groups: NavGroup[]; currentId: string; onNavigate: (id: string) => void; collapsed: boolean }) {
  const [closed, setClosed] = useState<Record<string, boolean>>(read);
  const toggle = (id: string) => setClosed((c) => { const n = { ...c, [id]: !c[id] }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* remembered for this tab only */ } return n; });
  if (collapsed) return <NavTree groups={groups} currentId={currentId} onNavigate={onNavigate} collapsed label="Admin navigation" />;
  return (
    <div className="grid gap-0.5" role="presentation">
      {groups.map((g) => {
        const open = !closed[g.id];
        const hasCurrent = g.items.some((i) => i.id === currentId || i.children?.some((c) => c.id === currentId));
        return (
          <div key={g.id} className="grid">
            <button type="button" aria-expanded={open} aria-controls={`nav-grp-${g.id}`} onClick={() => toggle(g.id)} className={cn('mt-2 flex h-9 items-center gap-1.5 rounded-sm px-3 text-left text-xs font-bold tracking-wide text-ink3 uppercase hover:text-ink', hasCurrent && !open && 'text-accent')}>
              <Icon name="arrow-right-01" size={14} className={cn('transition-transform duration-200', open && 'rotate-90')} />
              <span className="flex-1">{g.label}</span>
            </button>
            <div id={`nav-grp-${g.id}`} className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease)]', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} inert={!open}>
              <div className="min-h-0 overflow-hidden"><NavTree groups={[{ ...g, label: undefined }]} currentId={currentId} onNavigate={onNavigate} label={`${g.label} navigation`} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
