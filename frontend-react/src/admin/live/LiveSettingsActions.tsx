import { useState } from 'react';
import { Button, Notice, TextField, Textarea } from '@/design-system';
import { adminDownload, adminRequest } from '../data/http';
import { useSession } from '../session';
import { LiveMutation, type MutationSpec } from './LiveMutation';
import { text, type Row } from './helpers';
import { templateBody } from './bodies';

type Kind = 'smtp' | 'stripe' | 'provider';
const TESTS: Record<Kind, { label: string; path: string; permission: 'services:manage' | 'accounts:manage'; what: string }> = {
  smtp: { label: 'Test SMTP', path: '/settings/test-smtp', permission: 'services:manage', what: 'Opens an authenticated connection to the configured SMTP relay. No email is sent.' },
  stripe: { label: 'Test Stripe', path: '/settings/test-stripe', permission: 'accounts:manage', what: 'Reads the Stripe account with the server-side key. Nothing is charged.' },
  provider: { label: 'Test provider', path: '/settings/test-provider', permission: 'services:manage', what: 'Reads the Pterodactyl inventory with the server-side key. Nothing is created.' },
};

/** Server-side connectivity checks. Credentials never leave the server; only the outcome is shown. */
export function LiveIntegrationTest({ kind }: { kind: Kind }) {
  const { can } = useSession();
  const [result, setResult] = useState<Row | null>(null);
  const t = TESTS[kind];
  if (!can(t.permission)) return null;
  const spec: MutationSpec = { title: t.label, confirmLabel: 'Run check', description: `${t.what} Requires recent step-up.`, run: async () => { setResult(null); setResult(await adminRequest<Row>(t.path, { method: 'POST', body: '{}' })); } };
  return <div className="grid gap-2">
    <LiveMutation spec={spec} onDone={() => undefined} trigger={<Button size="sm" variant="secondary">{t.label}</Button>} />
    {result ? <Notice tone="good" title={`${t.label}: reachable`}>{Object.entries(result).filter(([k, v]) => k !== 'success' && typeof v !== 'object' && !/secret|key|token|password/i.test(k)).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') || 'The server confirmed the connection.'}</Notice> : null}
  </div>;
}

/** Templates whose message is useless without their action link; the backend enforces the same rule. */
const REQUIRED_LINK: Record<string, string> = { email_verification: 'verifyUrl', password_reset: 'resetUrl', account_invitation: 'inviteUrl', service_invitation: 'inviteUrl' };

export function TemplateRowActions({ row, reload }: { row: Row; reload: () => void }) {
  const { can } = useSession();
  if (!can('services:manage')) return null;
  const id = text(row['template']);
  const edit: MutationSpec = {
    title: `Edit template “${text(row['name'], id)}”`, confirmLabel: 'Save template', endpoint: `/settings/email-templates/${encodeURIComponent(id)}`, method: 'PUT', description: 'Replaces the built-in template. Verification, reset and invitation templates must keep their link placeholder. Requires recent step-up.',
    initial: { subject: text(row['subject']), text: text(row['text']), html: text(row['html']) },
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Subject" value={values['subject']} onChange={(e) => set('subject', e.target.value)} error={errors['subject']} maxLength={200} /><Textarea label="Plain text" value={values['text']} onChange={(e) => set('text', e.target.value)} rows={6} error={errors['text']} /><Textarea label="HTML" value={values['html']} onChange={(e) => set('html', e.target.value)} rows={8} error={errors['html']} description="Scripts are not rendered by mail clients and the backend rejects oversized content." /></div>,
    validate: (v) => {
      const link = REQUIRED_LINK[id]; const token = link ? `{{${link}}}` : null;
      return { ...(!v['subject']?.trim() ? { subject: 'Subject is required.' } : {}), ...(!v['text']?.trim() ? { text: 'Text body is required.' } : token && !v['text'].includes(token) ? { text: `Must contain ${token}. The built-in text shows a sample link; replace it with the placeholder.` } : {}), ...(!v['html']?.trim() ? { html: 'HTML body is required.' } : /<script/i.test(v['html']) ? { html: 'Scripts are not allowed.' } : token && !v['html'].includes(token) ? { html: `Must contain ${token}.` } : {}) };
    },
    body: (_r, v) => templateBody(v),
  };
  const reset: MutationSpec = { title: 'Reset template', confirmLabel: 'Reset to default', endpoint: `/settings/email-templates/${encodeURIComponent(id)}`, method: 'DELETE', tone: 'danger', description: 'Removes the override and goes back to the built-in template. Requires recent step-up.', body: () => ({}) };
  return <div className="flex flex-wrap gap-1.5">
    <LiveMutation spec={edit} onDone={reload} trigger={<Button size="sm" variant="secondary">Edit</Button>} />
    {row['overridden'] ? <LiveMutation spec={reset} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Reset</Button>} /> : null}
  </div>;
}

export function DeliveryRowActions({ row, reload }: { row: Row; reload: () => void }) {
  const { can } = useSession();
  if (!can('services:manage')) return null;
  const id = text(row['id']);
  return <LiveMutation spec={{ title: 'Resend email', confirmLabel: 'Resend', endpoint: `/settings/email-deliveries/${encodeURIComponent(id)}/resend`, reason: true, reasonMinLength: 5, description: 'Queues the stored message again through the outbox. Requires recent step-up.' }} onDone={reload} trigger={<Button size="sm" variant="secondary">Resend</Button>} />;
}

const today = () => new Date().toISOString().slice(0, 10);
/** CSV export of the audit log. The export is itself audited and truncated at 10,000 events; a truncation is announced, never silent. */
export function LiveAuditExport() {
  const { can } = useSession();
  const [note, setNote] = useState<string>();
  if (!can('audit:read')) return null;
  const spec: MutationSpec = {
    title: 'Export audit log', confirmLabel: 'Download CSV', description: 'The newest 10,000 matching events. The export is recorded in the audit log. Requires recent step-up.', initial: { q: '', from: '', to: '', accountId: '' },
    fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-2"><TextField label="Search" value={values['q']} onChange={(e) => set('q', e.target.value)} maxLength={100} className="sm:col-span-2" /><TextField label="From" type="date" value={values['from']} onChange={(e) => set('from', e.target.value)} max={today()} /><TextField label="To" type="date" value={values['to']} onChange={(e) => set('to', e.target.value)} error={errors['to']} max={today()} /><TextField label="Account id" value={values['accountId']} onChange={(e) => set('accountId', e.target.value)} maxLength={100} className="sm:col-span-2" /></div>,
    validate: (v) => (v['from'] && v['to'] && v['from'] > v['to'] ? { to: 'End date must not be before the start date.' } : {}),
    run: async ({ values }) => {
      const params = new URLSearchParams(); for (const k of ['q', 'from', 'to', 'accountId']) if (values[k]?.trim()) params.set(k, values[k]!.trim());
      const { blob, truncated } = await adminDownload(`/audit/export${params.size ? `?${params}` : ''}`);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `fortless-audit-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setNote(truncated ? 'The export was cut at the newest 10,000 events. Narrow the date range to get the rest.' : 'Export downloaded. The export itself is now an audit event.');
    },
  };
  return <div className="grid gap-2"><LiveMutation spec={spec} onDone={() => undefined} trigger={<Button size="sm" variant="secondary">Export CSV</Button>} />{note ? <Notice tone="info">{note}</Notice> : null}</div>;
}
