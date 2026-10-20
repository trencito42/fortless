import { useId } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Select } from '../forms/Select';
import { TextField } from '../forms/TextField';

export type FilterFieldType = 'text' | 'number' | 'select';
export type FilterOperator = 'contains' | 'notContains' | 'equals' | 'startsWith' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'isNot';

export interface FilterField {
  id: string;
  label: string;
  type: FilterFieldType;
  /** Required for type "select". */
  options?: { value: string; label: string }[];
}
export interface FilterRule { id: string; field: string; op: FilterOperator; value: string }

const OPS: Record<FilterFieldType, { value: FilterOperator; label: string }[]> = {
  text: [{ value: 'contains', label: 'contains' }, { value: 'notContains', label: 'does not contain' }, { value: 'equals', label: 'is exactly' }, { value: 'startsWith', label: 'starts with' }],
  number: [{ value: 'eq', label: '=' }, { value: 'neq', label: '≠' }, { value: 'gt', label: '>' }, { value: 'gte', label: '≥' }, { value: 'lt', label: '<' }, { value: 'lte', label: '≤' }],
  select: [{ value: 'is', label: 'is' }, { value: 'isNot', label: 'is not' }],
};

/** A rule takes part in filtering only when it is complete: it has a value, and numeric fields hold a number. A half-typed rule never hides rows. */
export const isActiveRule = (r: FilterRule) => {
  if (r.value.trim() === '') return false;
  const numeric = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(r.op);
  return !numeric || !Number.isNaN(Number(r.value));
};

/**
 * Applies rules with AND. Pure and synchronous: use it on the client for loaded rows, or send `rules` to the API for server-side filtering.
 * `getValue` maps a row and field id to the comparable value. Text compares case-insensitively; a row whose value is not a number never matches a numeric rule.
 */
export function applyFilters<T>(rows: T[], rules: FilterRule[], fields: FilterField[], getValue: (row: T, fieldId: string) => unknown): T[] {
  const active = rules.filter(isActiveRule);
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every((r) => {
    const type = fields.find((f) => f.id === r.field)?.type ?? 'text';
    const raw = getValue(row, r.field);
    if (type === 'number') {
      const a = Number(raw); const b = Number(r.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return { eq: a === b, neq: a !== b, gt: a > b, gte: a >= b, lt: a < b, lte: a <= b }[r.op as 'eq'] ?? true;
    }
    const a = String(raw ?? '').toLowerCase(); const b = r.value.trim().toLowerCase();
    switch (r.op) {
      case 'contains': return a.includes(b);
      case 'notContains': return !a.includes(b);
      case 'equals': case 'is': return a === b;
      case 'isNot': return a !== b;
      case 'startsWith': return a.startsWith(b);
      default: return true;
    }
  }));
}

export interface FilterBuilderProps {
  fields: FilterField[];
  rules: FilterRule[];
  onRulesChange: (rules: FilterRule[]) => void;
  /** Cap on rules. Default 6. */
  max?: number;
  className?: string;
}

let counter = 0;
const newId = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Field / operator / value rows combined with AND. Operators follow the field type; changing the field resets operator and value
 * so a rule can never hold an operator its field does not support. Controlled: the caller owns `rules`.
 */
export function FilterBuilder({ fields, rules, onRulesChange, max = 6, className }: FilterBuilderProps) {
  const gid = useId();
  const first = fields[0];
  const update = (id: string, patch: Partial<FilterRule>) => onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => { if (first) onRulesChange([...rules, { id: newId(), field: first.id, op: OPS[first.type][0]!.value, value: '' }]); };
  const activeCount = rules.filter(isActiveRule).length;

  return (
    <section aria-label="Filters" className={cn('grid gap-3', className)}>
      {rules.length === 0 ? <p className="text-[14px] text-ink3">No filters. Showing everything.</p> : null}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {rules.map((r, i) => {
          const f = fields.find((x) => x.id === r.field) ?? first;
          if (!f) return null;
          const n = i + 1;
          return (
            <li key={r.id} className="grid min-w-0 items-end gap-2 rounded-lg bg-s2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <Select label={`Filter ${n} field`} hideLabel value={r.field} options={fields.map((x) => ({ value: x.id, label: x.label }))} onValueChange={(id) => { const nf = fields.find((x) => x.id === id); if (nf) update(r.id, { field: nf.id, op: OPS[nf.type][0]!.value, value: '' }); }} />
              <Select label={`Filter ${n} operator`} hideLabel value={r.op} options={OPS[f.type]} onValueChange={(op) => op && update(r.id, { op: op as FilterOperator })} />
              {f.type === 'select' ? (
                <Select label={`Filter ${n} value`} hideLabel placeholder="Choose a value" value={r.value || null} options={f.options ?? []} onValueChange={(v) => update(r.id, { value: v ?? '' })} />
              ) : (
                <TextField label={`Filter ${n} value`} hideLabel inputMode={f.type === 'number' ? 'decimal' : undefined} placeholder={f.type === 'number' ? 'Number' : 'Value'} value={r.value} onChange={(e) => update(r.id, { value: e.target.value })} error={f.type === 'number' && r.value.trim() !== '' && Number.isNaN(Number(r.value)) ? 'Enter a number.' : undefined} />
              )}
              <IconButton label={`Remove filter ${n}`} icon="cancel-01" variant="ghost" onClick={() => onRulesChange(rules.filter((x) => x.id !== r.id))} />
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2" id={gid}>
        <Button size="sm" variant="secondary" leadingIcon="add-01" onClick={add} disabled={rules.length >= max || !first}>{rules.length >= max ? `Limit of ${max} reached` : 'Add filter'}</Button>
        {rules.length > 0 ? <Button size="sm" variant="ghost" onClick={() => onRulesChange([])}>Clear all</Button> : null}
        <span role="status" className="text-[13px] font-semibold text-ink3">{rules.length > 0 ? `${activeCount} of ${rules.length} active` : ''}</span>
      </div>
    </section>
  );
}
