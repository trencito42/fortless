import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, auditResult } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { dateTime } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';
import type { AuditEvent } from '../../types';

export default function AuditExplorer() {
  const { data, audit } = useAdmin();
  const nav = useNav();
  const act = useActionDialog();
  const cust = new Map(data.customers.map((c) => [c.id, c.name]));
  const exportCsv = (rows: AuditEvent[]) => act.run({ title: `Export ${rows.length} audit events`, description: 'Exports the rows currently selected. The real export endpoint requires audit:read and a fresh step-up, and is itself audited.', confirmLabel: 'Download CSV', permission: 'audit:read', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { downloadCsv('audit-demo.csv', ['at', 'actor_type', 'actor', 'action', 'resource_type', 'resource', 'result', 'correlation_id'], rows.map((e) => [e.at, e.actor.type, e.actor.name, e.action, e.resource.type, e.resource.id, e.result, e.correlationId])); audit('audit.exported', { type: 'audit', id: 'export' }, { reason }); return `${rows.length} events exported`; } });
  const types = [...new Set(data.audit.map((e) => e.resource.type))].sort();
  const actions = [...new Set(data.audit.map((e) => e.action))].sort();
  return (
    <AdminPage title="Audit log" description="Who did what, to which resource, when and with what result. Entries are append-only. Passwords, tokens, card data and secrets are never recorded; sensitive values appear masked.">
      <ResourceTable<AuditEvent>
        tableId="audit" caption="Audit events" rows={data.audit} getRowId={(e) => e.id} rowLabel={(e) => e.id} searchText={(e) => `${e.id} ${e.actor.name} ${e.action} ${e.resource.id} ${e.resource.label} ${e.correlationId} ${e.accountId ?? ''} ${e.accountId ? cust.get(e.accountId) ?? '' : ''}`} searchPlaceholder="Search actor, action, resource, account, correlation id"
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'staff', label: 'Staff', test: (e) => e.actor.type === 'STAFF' }, { value: 'user', label: 'Customers', test: (e) => e.actor.type === 'USER' }, { value: 'system', label: 'System & webhooks', test: (e) => e.actor.type === 'SYSTEM' || e.actor.type === 'WEBHOOK' }, { value: 'problems', label: 'Denied or failed', test: (e) => e.result !== 'success' }, { value: 'preview', label: 'Preview actions', test: (e) => !!e.preview }]}
        filters={[{ id: 'act', label: 'Action', options: actions.map((a) => ({ value: a, label: a })), test: (e, v) => e.action === v }, { id: 'rt', label: 'Resource type', options: types.map((a) => ({ value: a, label: a })), test: (e, v) => e.resource.type === v }, { id: 'res', label: 'Result', options: ['success', 'denied', 'failed'].map((a) => ({ value: a, label: a })), test: (e, v) => e.result === v }, { id: 'actor', label: 'Actor', options: [...new Set(data.audit.filter((e) => e.actor.type === 'STAFF').map((e) => e.actor.name))].map((a) => ({ value: a, label: a })), test: (e, v) => e.actor.name === v }]}
        dateField={{ label: 'When', get: (e) => e.at }}
        advanced={{ fields: [{ id: 'account', label: 'Account id', type: 'text' }, { id: 'corr', label: 'Correlation id', type: 'text' }, { id: 'ip', label: 'IP', type: 'text' }], getValue: (e, f) => (f === 'account' ? e.accountId ?? '' : f === 'corr' ? e.correlationId : e.ip) }}
        onRowClick={(e) => nav(`/audit/events/${e.id}`)} pageSize={20}
        columns={[
          col<AuditEvent>('t', 'When', (e) => nw(dateTime(e.at)), { sort: (e) => e.at, primary: true }),
          col<AuditEvent>('a', 'Actor', (e) => <span className="grid"><b>{e.actor.name}</b><span className="text-[12px] text-ink3">{e.actor.type.toLowerCase()}</span></span>, { sort: (e) => e.actor.name }),
          col<AuditEvent>('ac', 'Action', (e) => <span className="font-mono text-[12.5px] font-semibold">{e.action}{e.preview ? <Badge tone="warn" className="ml-2">preview</Badge> : null}</span>, { sort: (e) => e.action }),
          col<AuditEvent>('r', 'Resource', (e) => <span className="grid"><span className="font-semibold">{e.resource.label}</span><span className="font-mono text-[12px] text-ink3">{e.resource.type}</span></span>, { sort: (e) => e.resource.id }),
          col<AuditEvent>('acc', 'Account', (e) => (e.accountId ? <EntityLink to={`/customers/${e.accountId}`}>{cust.get(e.accountId) ?? e.accountId}</EntityLink> : '—'), { hideOnMobile: true }),
          col<AuditEvent>('s', 'Result', (e) => <Status map={auditResult} value={e.result} />, { sort: (e) => e.result }),
          col<AuditEvent>('c', 'Correlation', (e) => <span className="font-mono text-[12px]">{e.correlationId}</span>, { hideOnMobile: true }),
        ]}
        rowActions={(e) => [{ id: 'o', label: 'Open event', icon: 'arrow-up-right-01', onSelect: () => nav(`/audit/events/${e.id}`) }, { id: 'c', label: 'Same correlation id', icon: 'link-01', onSelect: () => nav(`/audit/events/${e.id}`) }]}
        bulkActions={(sel) => <Button size="sm" variant="secondary" onClick={() => exportCsv(sel)}>Export…</Button>}
        toolbar={<Button size="sm" variant="secondary" leadingIcon="download-01" onClick={() => exportCsv(data.audit.slice(0, 200))}>Export 200 latest…</Button>}
        empty={{ title: 'No audit events' }}
      />
      <PreviewNote>Actions you take in this preview appear here with a “preview” badge, so you can verify what would be recorded.</PreviewNote>
      {act.node}
    </AdminPage>
  );
}
