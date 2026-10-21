import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';
import { Kbd } from '../primitives/Kbd';

export interface PaletteCommand {
  id: string;
  label: string;
  section: string;
  icon?: IconName;
  keywords?: string[];
  hint?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  commands: PaletteCommand[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  footer?: ReactNode;
  /** Caps rendered results (large entity indexes). The status line tells the user to keep typing. */
  maxResults?: number;
  /** With an empty query only commands passing this filter are listed (e.g. navigation, not every record). */
  idleFilter?: (command: PaletteCommand) => boolean;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Jump-to and quick-actions palette. Combobox pattern: focus stays in the input, arrows move aria-activedescendant,
 * Enter runs, Escape closes. The global shortcut lives in useCommandPaletteShortcut so there is exactly one listener.
 */
export function CommandPalette({ commands, open, onOpenChange, placeholder = 'Search pages and actions', footer, maxResults, idleFilter }: CommandPaletteProps) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return idleFilter ? commands.filter(idleFilter) : commands;
    const hits = commands.filter((c) => [c.label, c.section, ...(c.keywords ?? [])].some((s) => norm(s).includes(t)));
    return maxResults ? hits.slice(0, maxResults) : hits;
  }, [commands, q, maxResults, idleFilter]);

  useEffect(() => { setActive(0); }, [q, open]);
  useEffect(() => { if (!open) setQ(''); }, [open]);
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const run = (c: PaletteCommand | undefined) => {
    if (!c) return;
    onOpenChange(false);
    c.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(results.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
  };

  let lastSection = '';
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[60] bg-overlay transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseDialog.Popup className="fixed inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-[61] mx-auto flex max-h-[min(560px,calc(100dvh-24px))] max-w-[600px] flex-col rounded-xl bg-s1 outline-none transition-[opacity,transform] duration-200 data-[starting-style]:-translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 md:top-[12vh]">
          <BaseDialog.Title className="sr-only">Command palette</BaseDialog.Title>
          <div className="flex items-center gap-3 px-5 pt-4 pb-2">
            <Icon name="search-01" className="text-ink3" />
            <input
              // The palette is opened on purpose; focus must land in the search input immediately.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
              aria-autocomplete="list"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              className="h-11 min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-ink outline-none placeholder:text-ink3"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {results.length === 0 ? <p role="status" className="px-4 py-8 text-center font-semibold text-ink3">No results for “{q}”.</p> : null}
            {maxResults && results.length >= maxResults ? <p role="status" className="px-3 pt-2 text-[12.5px] font-semibold text-ink3">Showing the first {maxResults} matches. Keep typing to narrow down.</p> : null}
            {results.map((c, i) => {
              const header = c.section !== lastSection ? c.section : null;
              lastSection = c.section;
              return (
                <div key={c.id} role="presentation">
                  {header ? <div role="presentation" className="px-3 pt-3 pb-1 text-xs font-bold text-ink3">{header}</div> : null}
                  {/* Options follow the combobox pattern: DOM focus stays in the input (aria-activedescendant), so options are intentionally not tabbable. */}
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */}
                  <div
                    id={`${listId}-${c.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(c)}
                    className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 font-semibold', i === active ? 'bg-accent-bg text-accent' : 'text-ink2')}
                  >
                    {c.icon ? <Icon name={c.icon} size={18} /> : null}
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.hint ? <span className="text-[12.5px] text-ink3">{c.hint}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {footer ? <div className="px-5 pt-1 pb-3 text-[12.5px] text-ink3">{footer}</div> : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Registers the single global ⌘K / Ctrl+K listener. Mount once, near the app root. */
export function useCommandPaletteShortcut(toggle: () => void) {
  const ref = useRef(toggle);
  ref.current = toggle;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}
