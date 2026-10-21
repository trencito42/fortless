import { Badge } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, contentStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { date } from '../../lib/format';
import type { LegalDoc } from '../../types';

export default function LegalList() {
  const { data } = useAdmin();
  const nav = useNav();
  return (
    <AdminPage title="Legal pages" description="Terms, privacy, cookies and refund policy in each language. Every published version is kept; customers see the current one.">
      <ResourceTable<LegalDoc>
        tableId="legal" caption="Legal documents" rows={data.legalDocs} getRowId={(d) => d.id} rowLabel={(d) => d.title} searchText={(d) => `${d.title} ${d.kind} ${d.language}`}
        filters={[{ id: 'kind', label: 'Document', options: ['terms', 'privacy', 'cookies', 'refund'].map((k) => ({ value: k, label: k })), test: (d, v) => d.kind === v }, { id: 'lang', label: 'Language', options: [{ value: 'en', label: 'English' }, { value: 'ro', label: 'Romanian' }], test: (d, v) => d.language === v }]}
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'draft', label: 'Has unpublished draft', test: (d) => !!d.draft }]}
        onRowClick={(d) => nav(`/content/legal/${d.id}`)}
        columns={[
          col<LegalDoc>('t', 'Document', (d) => <EntityLink to={`/content/legal/${d.id}`}>{d.title}</EntityLink>, { primary: true, sort: (d) => d.title }),
          col<LegalDoc>('l', 'Language', (d) => <Badge>{d.language.toUpperCase()}</Badge>, { sort: (d) => d.language }),
          col<LegalDoc>('v', 'Published version', (d) => `v${d.currentVersion}`, { sort: (d) => d.currentVersion }),
          col<LegalDoc>('s', 'Status', (d) => <span className="flex flex-wrap gap-1"><Status map={contentStatus} value={d.status} />{d.draft ? <Badge tone="warn">Draft pending</Badge> : null}</span>),
          col<LegalDoc>('p', 'Last published', (d) => nw(date(d.revisions[0]?.at)), { sort: (d) => d.revisions[0]?.at ?? '' }),
          col<LegalDoc>('r', 'Revisions', (d) => d.revisions.length, { numeric: true }),
        ]}
        empty={{ title: 'No legal documents' }}
      />
    </AdminPage>
  );
}
