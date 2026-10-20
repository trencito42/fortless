import { Icon, Select, type IconName } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { TAB_GROUPS, TAB_ICON, TAB_LABELS, type TabId } from './model';

export interface SectionItem { id: TabId; blocked?: string }

/**
 * Grouped section navigation for the service page. Fifteen sections do not fit a tab bar, so on wide screens they live in a left rail
 * grouped by job (monitor, manage, data, access); below lg the same groups become one labelled picker. Sections the person cannot
 * open stay listed with the reason, so a missing permission is explained rather than silently hidden.
 */
export function SectionNav({ items, active, onSelect, label = 'Service sections' }: { items: SectionItem[]; active: TabId; onSelect: (id: TabId) => void; label?: string }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups = TAB_GROUPS.map((g) => ({ ...g, items: g.tabs.map((t) => byId.get(t)).filter((x): x is SectionItem => !!x) })).filter((g) => g.items.length);
  return (
    <>
      <div className="lg:hidden">
        <Select
          label={label} hideLabel value={active} onValueChange={(v) => v && onSelect(v as TabId)}
          options={groups.flatMap((g) => g.items.map((i) => ({ value: i.id, label: TAB_LABELS[i.id] + (i.blocked ? ' (unavailable)' : ''), group: g.label })))}
        />
      </div>
      <nav aria-label={label} className="hidden lg:block">
        <div className="sticky top-4 grid gap-5">
          {groups.map((g) => (
            <div key={g.id} className="grid gap-1">
              <p className="px-3 text-[12.5px] font-bold text-ink3">{g.label}</p>
              <ul className="grid gap-0.5">
                {g.items.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button" onClick={() => onSelect(i.id)} aria-current={i.id === active ? 'page' : undefined} title={i.blocked}
                      className={cn('flex h-ctl-md w-full items-center gap-2.5 rounded-full px-3 text-left text-[14.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        i.id === active ? 'bg-accent-soft text-accent-ink' : 'text-ink2 hover:bg-s3 hover:text-ink', i.blocked && i.id !== active && 'text-ink3')}
                    >
                      <Icon name={TAB_ICON[i.id] as IconName} size={18} />
                      <span className="min-w-0 flex-1 truncate">{TAB_LABELS[i.id]}</span>
                      {i.blocked ? <Icon name="lock" size={14} /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
