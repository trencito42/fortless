import { useState } from 'react';
import { Badge, Button, DetailPanel, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, webhookStatus } from '../../components/status';
import { CustomerLink, EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useAdminRouter } from '../../router';
import { useSession } from '../../session';
import { dateTime, iso, relative } from '../../lib/format';
import type { WebhookEvent } from '../../types';

export default function Webhooks() {
  const { data, patch, audit } = useAdmin();
  const { search } = useAdminRouter();
  const { can } = useSession();
  const act = useActionDialog();
  const [open, setOpen] = useState<WebhookEvent | null>(null);
  const m = can('accounts:manage');
  const seg = (v: string, label: string, test: (e: WebhookEvent) => boolean) => ({ value: v, label, test });
  const payment = (e: WebhookEvent) => data.payments.find((p) => p.providerRef === e.objectId || p.webhookEventId === e.id);
  const replay = (e: WebhookEvent) => act.run({ title: 'Replay webhook event', description: 'Runs the stored event through the idempotent handler again. The handler keys on the Stripe event id, so it cannot apply twice.', confirmLabel: 'Replay event', permission: 'accounts:manage', stepUp: true, reasonRequired: true, effects: ['Re-verify the stored signature record', 'Run the handler (marks invoice paid, queues fulfillment if needed)', 'Record the new outcome on the event'],
    onConfirm: ({ reason }) => { patch('webhooks', e.id, { status: 'processed', error: null, processedAt: iso(0), attempts: e.attempts + 1 }); const p = payment(e); if (p) patch('payments', p.id, { reconciled: true }); audit('webhook.replayed', { type: 'webhook', id: e.id, label: e.type }, { reason }); setOpen(null); return 'Event replayed and processed'; } });
  const reviewed = (e: WebhookEvent) => act.run({ title: 'Mark reviewed', description: 'Records that a person looked at this event and no action is needed (for example a duplicate).', confirmLabel: 'Mark reviewed', permission: 'accounts:manage', reasonRequired: true, onConfirm: ({ reason }) => { patch('webhooks', e.id, { status: 'processed' }); audit('webhook.reviewed', { type: 'webhook', id: e.id }, { reason }); setOpen(null); return 'Marked as reviewed'; } });
  const f = data.webhooks.filter((w) => w.status === 'failed').length;
  return (
    <AdminPage title="Webhook events" description="Events received from Stripe, stored before processing (inbox). The signature is verified on the raw body first; an event is acted on only once, keyed by its id.">
      <KpiGrid cols={5} items={[{ label: 'Received', value: data.webhooks.length }, { label: 'Processed', value: data.webhooks.filter((w) => w.status === 'processed').length }, { label: 'Failed', value: f, hint: f ? 'Money may have moved' : undefined }, { label: 'Pending review', value: data.webhooks.filter((w) => w.status === 'pending_review').length }, { label: 'Duplicates', value: data.webhooks.filter((w) => w.status === 'duplicate').length, hint: 'Ignored safely' }]} />
      <ResourceTable<WebhookEvent>
        tableId="webhooks" caption="Webhook events" rows={data.webhooks} getRowId={(w) => w.id} rowLabel={(w) => w.id} initialSearch={search.get('q') ?? ''} searchText={(w) => `${w.id} ${w.type} ${w.objectId} ${w.provider}`} searchPlaceholder="Search event id, type, object"
        segments={[seg('all', 'All', () => true), seg('failed', 'Failed', (w) => w.status === 'failed'), seg('pending_review', 'Pending review', (w) => w.status === 'pending_review'), seg('received', 'Received', (w) => w.status === 'received'), seg('processed', 'Processed', (w) => w.status === 'processed'), seg('duplicate', 'Duplicate', (w) => w.status === 'duplicate')]}
        filters={[{ id: 'prov', label: 'Provider', options: [{ value: 'stripe', label: 'Stripe' }, { value: 'pterodactyl', label: 'Pterodactyl' }], test: (w, v) => w.provider === v }, { id: 'type', label: 'Type', options: [...new Set(data.webhooks.map((w) => w.type))].map((t) => ({ value: t, label: t })), test: (w, v) => w.type === v }]}
        dateField={{ label: 'Received', get: (w) => w.receivedAt }}
        onRowClick={setOpen} pageSize={20}
        columns={[
          col<WebhookEvent>('id', 'Event', (w) => <span className="font-mono text-[12.5px] font-semibold">{w.id}</span>, { primary: true, sort: (w) => w.id }),
          col<WebhookEvent>('p', 'Provider', (w) => <Badge>{w.provider}</Badge>, { sort: (w) => w.provider }),
          col<WebhookEvent>('t', 'Type', (w) => <span className="font-mono text-[12.5px]">{w.type}</span>, { sort: (w) => w.type }),
          col<WebhookEvent>('o', 'Object', (w) => <span className="font-mono text-[12.5px] break-all">{w.objectId}</span>, { hideOnMobile: true }),
          col<WebhookEvent>('s', 'Status', (w) => <Status map={webhookStatus} value={w.status} />, { sort: (w) => w.status }),
          col<WebhookEvent>('a', 'Attempts', (w) => w.attempts, { numeric: true, sort: (w) => w.attempts }),
          col<WebhookEvent>('r', 'Received', (w) => nw(relative(w.receivedAt)), { sort: (w) => w.receivedAt }),
        ]}
        rowActions={(w) => [{ id: 'open', label: 'Inspect event', icon: 'view', onSelect: () => setOpen(w) }, { id: 'rp', label: 'Replay…', icon: 'replay', disabled: !m || (w.status !== 'failed' && w.status !== 'pending_review'), disabledReason: !m ? 'Requires accounts:manage' : 'Only failed or pending events', onSelect: () => replay(w) }]}
        empty={{ title: 'No webhook events' }}
      />
      <DetailPanel open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.type ?? 'Event'} description={open?.id}
        items={open ? [{ label: 'Status', value: <Status map={webhookStatus} value={open.status} /> }, { label: 'Provider', value: open.provider }, { label: 'Object', value: open.objectId, mono: true, copy: open.objectId }, { label: 'Signature', value: open.signatureVerified ? 'Verified (HMAC-SHA256 on raw body)' : 'Not verified' }, { label: 'Received', value: dateTime(open.receivedAt) }, { label: 'Processed', value: dateTime(open.processedAt) }, { label: 'Attempts', value: open.attempts }, { label: 'Customer', value: open.customerId ? <CustomerLink id={open.customerId} /> : '—' }] : []}
        footer={open ? <><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>{open.status === 'pending_review' || open.status === 'duplicate' ? <Button variant="secondary" disabled={!m} onClick={() => reviewed(open)}>Mark reviewed…</Button> : null}<Button variant="primary" disabled={!m || (open.status !== 'failed' && open.status !== 'pending_review')} onClick={() => replay(open)}>Replay…</Button></> : undefined}>
        {open?.error ? <Notice tone="bad" title="Handler error">{open.error}</Notice> : null}
        {open && payment(open) ? <p className="text-[13.5px]">Linked payment: <EntityLink to={`/billing/transactions/${payment(open)!.id}`} mono>{payment(open)!.id}</EntityLink></p> : null}
        <p className="text-[12.5px] font-semibold text-ink3">Payload bodies and signatures are never shown in the admin UI.</p>
      </DetailPanel>
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
