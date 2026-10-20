import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { cn } from '@/lib/utils/cn';
import { Field, type FieldProps } from './Field';
import { controlBox, type ControlSize } from './control-styles';
import { Icon } from '../icons/Icon';
import { Spinner } from '../primitives/Spinner';
import { menuItemStyles, menuLabelStyles, popupSurface } from '../overlays/popup-styles';
import { toGroups, type Option, type OptionGroup } from './options';

interface ComboBase extends Pick<FieldProps, 'label' | 'description' | 'error' | 'hideLabel'> {
  /** Static options. With `loadOptions` these are the initial suggestions. */
  options?: Option[];
  placeholder?: string;
  emptyText?: string;
  size?: ControlSize;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  clearable?: boolean;
  className?: string;
  /** Server-side search. Called (debounced) with the query; aborted when a newer query starts. Failures are shown in the list. */
  loadOptions?: (query: string, signal: AbortSignal) => Promise<Option[]>;
  /** Lets the user add an option that does not exist. Shown as 'Create "query"'. */
  onCreate?: (label: string) => Option | Promise<Option>;
  debounceMs?: number;
}

export interface SearchableSelectProps extends ComboBase {
  value?: string | null;
  onValueChange?: (value: string | null, option: Option | null) => void;
}
export interface MultiSelectProps extends ComboBase {
  value?: string[];
  onValueChange?: (value: string[], options: Option[]) => void;
  /** Maximum selections. Items become unavailable once reached. */
  max?: number;
}

const CREATE_PREFIX = '__create__:';

function useCombo(base: Pick<ComboBase, 'options' | 'loadOptions' | 'onCreate' | 'debounceMs'>) {
  const { options = [], loadOptions, onCreate, debounceMs = 250 } = base;
  const [remote, setRemote] = useState<Option[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const cache = useRef(new Map<string, Option>());
  const abort = useRef<AbortController | null>(null);

  const pool = remote ?? options;
  for (const o of pool) cache.current.set(o.value, o);

  useEffect(() => {
    if (!loadOptions) return;
    const t = window.setTimeout(async () => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setStatus('loading');
      setErrorText(null);
      try {
        const res = await loadOptions(query.trim(), ac.signal);
        if (ac.signal.aborted) return;
        setRemote(res);
        setStatus('idle');
      } catch (e) {
        if (ac.signal.aborted) return;
        setStatus('error');
        setErrorText(e instanceof Error ? e.message : 'Search failed. Try again.');
      }
    }, query ? debounceMs : 0);
    return () => window.clearTimeout(t);
  }, [query, loadOptions, debounceMs]);
  useEffect(() => () => abort.current?.abort(), []);

  const trimmed = query.trim();
  const canCreate = !!onCreate && trimmed !== '' && !pool.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const items: Option[] = useMemo(() => (canCreate ? [...pool, { value: CREATE_PREFIX + trimmed, label: `Create "${trimmed}"`, group: undefined }] : pool), [pool, canCreate, trimmed]);
  return { items, query, setQuery, status, errorText, cache: cache.current, isRemote: !!loadOptions, onCreate };
}

function ItemList({ items, remote, status, errorText, emptyText, loadingText }: { items: Option[]; remote: boolean; status: string; errorText: string | null; emptyText: string; loadingText: string }) {
  const grouped = toGroups(items);
  const isGrouped = !remote && grouped.length > 0 && 'items' in (grouped[0] as object);
  const renderItem = (o: Option) => (
    <Combobox.Item key={o.value} value={o} disabled={o.disabled} className={cn(menuItemStyles, 'data-[selected]:text-ink')}>
      <span className="grid size-5 shrink-0 place-items-center text-accent">
        <Combobox.ItemIndicator><Icon name="tick-02" size={16} /></Combobox.ItemIndicator>
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{o.label}</span>
        {o.description ? <span className="truncate text-[12.5px] font-medium text-ink3">{o.description}</span> : null}
      </span>
    </Combobox.Item>
  );
  return (
    <>
      <Combobox.Status className="px-3 py-2 text-[13px] font-semibold text-ink3 empty:hidden">
        {status === 'loading' ? <span className="flex items-center gap-2"><Spinner size={14} />{loadingText}</span> : status === 'error' ? <span className="text-bad" role="alert">{errorText}</span> : null}
      </Combobox.Status>
      <Combobox.Empty className="px-3 py-3 text-[13.5px] font-semibold text-ink3 empty:hidden">{status === 'idle' ? emptyText : null}</Combobox.Empty>
      <Combobox.List className="max-h-[min(var(--available-height),320px)] overflow-auto outline-none">
        {!isGrouped
          ? (o: Option) => renderItem(o)
          : (g: OptionGroup) => (
              <Combobox.Group key={g.value} items={g.items}>
                <Combobox.GroupLabel className={menuLabelStyles}>{g.value}</Combobox.GroupLabel>
                <Combobox.Collection>{(o: Option) => renderItem(o)}</Combobox.Collection>
              </Combobox.Group>
            )}
      </Combobox.List>
    </>
  );
}

const containsFilter = (o: Option, q: string) => `${o.label} ${o.keywords ?? ''} ${o.description ?? ''}`.toLowerCase().includes(q.toLowerCase());

/**
 * Pick one value by typing to filter. Use when the list is long or users know the name (locations, domains, software versions).
 * With `loadOptions` it searches on the server (AsyncSelect). With `onCreate` users can add a missing option (CreatableCombobox).
 */
export function SearchableSelect({ label, description, error, hideLabel, placeholder = 'Search…', emptyText = 'No matches. Try a different search.', size: _size, disabled, required, name, clearable = true, className, value, onValueChange, ...base }: SearchableSelectProps) {
  const c = useCombo(base);
  const selected = value ? (c.cache.get(value) ?? null) : null;
  const items = useMemo(() => {
    if (selected && !c.items.some((o) => o.value === selected.value)) return [...c.items, selected];
    return c.items;
  }, [c.items, selected]);

  const change = useCallback(
    async (next: Option | null) => {
      if (next && next.value.startsWith(CREATE_PREFIX) && c.onCreate) {
        const created = await c.onCreate(next.value.slice(CREATE_PREFIX.length));
        c.cache.set(created.value, created);
        onValueChange?.(created.value, created);
        return;
      }
      onValueChange?.(next?.value ?? null, next);
    },
    [c, onValueChange],
  );

  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} name={name} className={className}>
      <Combobox.Root
        items={c.isRemote ? items : toGroups(items)}
        value={selected}
        onValueChange={(v) => void change(v as Option | null)}
        itemToStringLabel={(o: Option) => o.label}
        itemToStringValue={(o: Option) => o.value}
        isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
        filter={c.isRemote ? null : containsFilter}
        onInputValueChange={(v, d) => { if (d.reason === 'input-change' || d.reason === 'input-clear') c.setQuery(v); }}
        disabled={disabled}
        required={required}
        name={name}
        autoHighlight
      >
        <Combobox.InputGroup className={cn(controlBox, 'h-ctl-md pr-1')} data-invalid={error ? true : undefined}>
          <Combobox.Input placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold outline-none placeholder:font-medium placeholder:text-ink3" />
          {clearable ? (
            <Combobox.Clear aria-label="Clear selection" className="grid size-8 place-items-center rounded-full text-ink3 hover:bg-s3 hover:text-ink data-[empty]:hidden"><Icon name="cancel-01" size={16} /></Combobox.Clear>
          ) : null}
          <Combobox.Trigger aria-label="Show options" className="grid size-8 place-items-center rounded-full text-ink3 hover:bg-s3"><Icon name="arrow-down-01" size={18} /></Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={6} collisionPadding={8} className="z-[70] outline-none">
            <Combobox.Popup className={cn(popupSurface, 'w-[var(--anchor-width)] min-w-[220px] max-w-[var(--available-width)] p-1.5')}>
              <ItemList items={items} remote={c.isRemote} status={c.status} errorText={c.errorText} emptyText={emptyText} loadingText="Searching…" />
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </Field>
  );
}

/** Pick several values; selections appear as removable chips. Backspace from the empty input moves into the chips. */
export function MultiSelect({ label, description, error, hideLabel, placeholder = 'Add…', emptyText = 'No matches. Try a different search.', disabled, required, name, className, value = [], onValueChange, max, ...base }: MultiSelectProps) {
  const c = useCombo(base);
  const selected = value.map((v) => c.cache.get(v)).filter((o): o is Option => !!o);
  const items = useMemo(() => {
    const extra = selected.filter((s) => !c.items.some((o) => o.value === s.value));
    const list = [...c.items, ...extra];
    return max !== undefined && value.length >= max ? list.map((o) => (value.includes(o.value) ? o : { ...o, disabled: true })) : list;
  }, [c.items, selected, max, value]);

  const change = async (next: Option[]) => {
    const create = next.find((o) => o.value.startsWith(CREATE_PREFIX));
    let final = next;
    if (create && c.onCreate) {
      const created = await c.onCreate(create.value.slice(CREATE_PREFIX.length));
      c.cache.set(created.value, created);
      final = [...next.filter((o) => o !== create), created];
    }
    onValueChange?.(final.map((o) => o.value), final);
  };

  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} name={name} className={className}>
      <Combobox.Root
        items={c.isRemote ? items : toGroups(items)}
        multiple
        value={selected}
        onValueChange={(v) => void change(v as Option[])}
        itemToStringLabel={(o: Option) => o.label}
        itemToStringValue={(o: Option) => o.value}
        isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
        filter={c.isRemote ? null : containsFilter}
        onInputValueChange={(v, d) => { if (d.reason === 'input-change' || d.reason === 'input-clear') c.setQuery(v); }}
        disabled={disabled}
        required={required}
        name={name}
      >
        <Combobox.InputGroup className={cn(controlBox, 'min-h-ctl-md flex-wrap gap-1 py-1.5 pr-2')} data-invalid={error ? true : undefined}>
          <Combobox.Value>
            {(v: Option[]) => (
              <Combobox.Chips className="flex w-full flex-wrap items-center gap-1">
                {v.map((o) => (
                  <Combobox.Chip key={o.value} aria-label={o.label} className="group flex h-7 items-center gap-1 rounded-full bg-accent-bg pr-1 pl-3 text-[13px] font-bold text-accent-ink outline-none focus-within:ring-2 focus-within:ring-accent data-[highlighted]:ring-2 data-[highlighted]:ring-accent">
                    {o.label}
                    <Combobox.ChipRemove aria-label={`Remove ${o.label}`} className="grid size-5 place-items-center rounded-full hover:bg-accent/20"><Icon name="cancel-01" size={12} /></Combobox.ChipRemove>
                  </Combobox.Chip>
                ))}
                <Combobox.Input placeholder={v.length ? '' : placeholder} className="h-7 min-w-24 flex-1 bg-transparent text-[14.5px] font-semibold outline-none placeholder:font-medium placeholder:text-ink3" />
              </Combobox.Chips>
            )}
          </Combobox.Value>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={6} collisionPadding={8} className="z-[70] outline-none">
            <Combobox.Popup className={cn(popupSurface, 'w-[var(--anchor-width)] min-w-[220px] max-w-[var(--available-width)] p-1.5')}>
              <ItemList items={items} remote={c.isRemote} status={c.status} errorText={c.errorText} emptyText={emptyText} loadingText="Searching…" />
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </Field>
  );
}
