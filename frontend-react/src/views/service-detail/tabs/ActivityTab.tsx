import { useState } from 'react';
import { Button, Select } from '@/design-system';
import { AuditTrail } from '@/features';
import type { ActivityCategory } from '../contracts';
import { useService } from '../context';
import { mapActivity } from '../mappers';
import { useResource } from '../../shared/useResource';

const CATS: Array<{ value: ActivityCategory; label: string }> = [
  { value: 'all', label: 'Everything' }, { value: 'power', label: 'Power' }, { value: 'files', label: 'Files' }, { value: 'backups', label: 'Backups' }, { value: 'network', label: 'Network' },
  { value: 'settings', label: 'Settings' }, { value: 'game', label: 'Game' }, { value: 'databases', label: 'Databases' }, { value: 'schedules', label: 'Schedules' }, { value: 'lifecycle', label: 'Lifecycle' }, { value: 'billing', label: 'Billing' },
];
const RANGES = [{ value: 'all', label: 'All time' }, { value: '1', label: 'Last day' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }];

/** Server-side filtered, server-paginated customer activity (15 per page). Only allowlisted actions exist in this feed. */
export function ActivityTab() {
  const { id, ports } = useService();
  const [category, setCategory] = useState<ActivityCategory>('all'); const [range, setRange] = useState('all'); const [page, setPage] = useState(1);
  const res = useResource((s) => ports.service.activity(id, { category, range: range === 'all' ? undefined : (range as '1' | '7' | '30'), page }, s), [id, ports, category, range, page]);
  const pages = res.status === 'ready' ? Math.max(1, Math.ceil(res.data.total / res.data.pageSize)) : 1;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Select label="Category" options={CATS} value={category} onValueChange={(v) => { if (v) { setCategory(v as ActivityCategory); setPage(1); } }} />
        <Select label="Period" options={RANGES} value={range} onValueChange={(v) => { if (v) { setRange(v); setPage(1); } }} />
      </div>
      <AuditTrail events={res.status === 'ready' ? mapActivity(res.data.events) : []} loading={res.status === 'loading'} error={res.status === 'error' ? res.error : undefined} onRetry={res.reload} />
      {res.status === 'ready' && pages > 1 ? (
        <nav aria-label="Activity pages" className="flex items-center justify-between gap-3">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span role="status" className="text-[13.5px] text-ink3">Page {res.data.page} of {pages} · {res.data.total} events</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>
      ) : null}
    </div>
  );
}
