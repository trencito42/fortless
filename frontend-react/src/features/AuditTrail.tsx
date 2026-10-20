import { useMemo, useState } from 'react';
import { DataTable, DescriptionList, FilterBuilder, applyFilters, StatusBadge, type ColumnDef, type FilterField, type FilterRule } from '@/design-system';

export interface AuditEvent {
  id: string;
  /** ISO timestamp. Formatted for display with the viewer's locale. */
  at: string;
  actor: string;
  action: string;
  target: string;
  outcome: 'success' | 'failed';
  ip?: string;
  /** Extra facts shown when the row is expanded. Only what the API returned. */
  details?: { label: string; value: string }[];
}

export interface AuditTrailProps {
  events: AuditEvent[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

const FIELDS: FilterField[] = [
  { id: 'actor', label: 'Actor', type: 'text' },
  { id: 'action', label: 'Action', type: 'text' },
  { id: 'target', label: 'Target', type: 'text' },
  { id: 'outcome', label: 'Outcome', type: 'select', options: [{ value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' }] },
];

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Who did what, when. Filterable with FilterBuilder, searchable, and each row expands to show the details the API returned.
 * Presentation only: events arrive from the caller, nothing is fetched or invented here.
 */
export function AuditTrail({ events, loading, error, onRetry }: AuditTrailProps) {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const rows = useMemo(() => applyFilters(events, rules, FIELDS, (e, f) => e[f as keyof AuditEvent]), [events, rules]);
  const columns = useMemo<ColumnDef<AuditEvent, unknown>[]>(() => [
    { accessorKey: 'at', header: 'When', meta: { primary: true }, cell: (c) => fmt(c.getValue() as string) },
    { accessorKey: 'actor', header: 'Actor' },
    { accessorKey: 'action', header: 'Action' },
    { accessorKey: 'target', header: 'Target' },
    { accessorKey: 'outcome', header: 'Outcome', cell: (c) => <StatusBadge tone={c.getValue() === 'success' ? 'good' : 'bad'}>{c.getValue() === 'success' ? 'Success' : 'Failed'}</StatusBadge> },
  ], []);
  return (
    <div className="grid gap-4">
      <FilterBuilder fields={FIELDS} rules={rules} onRulesChange={setRules} />
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(e) => e.id}
        rowLabel={(e) => `${e.action} by ${e.actor}`}
        caption="Audit trail"
        loading={loading}
        error={error}
        onRetry={onRetry}
        searchable
        searchPlaceholder="Search the trail"
        pageSize={8}
        empty={{ title: 'No activity yet', description: 'Actions on your account appear here.' }}
        renderExpanded={(e) => (
          <DescriptionList items={[{ label: 'IP address', value: e.ip ?? 'Not recorded' }, { label: 'Event ID', value: e.id }, ...(e.details ?? [])]} />
        )}
      />
      {rules.some((r) => r.value) && rows.length === 0 && events.length > 0 ? <p role="status" className="text-[14px] text-ink3">No events match these filters.</p> : null}
    </div>
  );
}
