import { useState } from 'react';
import { Badge, Button, Notice, Select, Tabs, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { Status, emailStatus } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { col } from '../../components/cols';
import { useActionDialog } from '../../components/ActionDialog';
import { useSettings } from '../../hooks/useSettings';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { relative } from '../../lib/format';
import type { EmailDelivery, EmailTemplate } from '../../types';

const VARS = ['{{name}}', '{{link}}', '{{amount}}', '{{invoice.number}}', '{{service.name}}', '{{reason}}', '{{ticket.id}}', '{{ticket.subject}}', '{{reply}}', '{{agent.name}}'];

export default function Email() {
  const { values, save } = useSettings('email');
  const { data, patch, audit } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const [tab, setTab] = useState('smtp');
  const [f, setF] = useState({ host: values['host'] ?? '', port: values['port'] ?? '587', security: values['security'] ?? 'starttls', username: values['username'] ?? '', fromName: values['fromName'] ?? '', fromAddress: values['fromAddress'] ?? '', replyTo: values['replyTo'] ?? '' });
  const err: Record<string, string> = {};
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(f.host)) err['host'] = 'Enter a host name such as smtp.example.com.';
  if (!(Number(f.port) >= 1 && Number(f.port) <= 65535)) err['port'] = 'Port must be 1–65535.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.fromAddress)) err['fromAddress'] = 'Enter a valid sender address.';
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(f.host)) err['host'] = 'Private and loopback hosts are blocked (SSRF protection).';
  const m = can('services:manage');
  const dirty = JSON.stringify(f) !== JSON.stringify({ host: values['host'], port: values['port'], security: values['security'], username: values['username'], fromName: values['fromName'], fromAddress: values['fromAddress'], replyTo: values['replyTo'] });
  const saveSmtp = () => { if (Object.keys(err).length) return; act.run({ title: 'Save SMTP settings', confirmLabel: 'Save settings', permission: 'services:manage', stepUp: true, reasonRequired: true, description: 'The password is a server secret and is not editable here.', onConfirm: ({ reason }) => { save(f, 'settings.email_updated', reason); } }); };
  const test = () => act.run({ title: 'Send test email', description: 'Sends one message through the saved SMTP settings to an address you enter. Simulated in this preview.', confirmLabel: 'Send test', permission: 'services:manage', stepUp: true, reasonRequired: false, initial: { to: '' }, validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v['to']!) ? {} : { to: 'Enter a valid recipient.' }), fields: ({ values: v, set, errors }) => <TextField label="Recipient" type="email" value={v['to']} onChange={(e) => set('to', e.target.value)} error={errors['to']} />, onConfirm: ({ values: v }) => { audit('settings.smtp_tested', { type: 'settings', id: 'email' }); return `Test sent to ${v['to']} (simulated: nothing left the browser)`; } });
  const editTpl = (t: EmailTemplate) => act.run({ title: `Edit “${t.name}”`, description: `Variables: ${VARS.join(', ')}`, confirmLabel: 'Save template', permission: 'services:manage', stepUp: true, reasonRequired: false, initial: { subject: t.subject, body: t.body },
    validate: (v) => ({ ...(v['subject']!.trim().length < 3 ? { subject: 'Subject is required.' } : {}), ...(v['body']!.trim().length < 10 ? { body: 'Body is too short.' } : /\{\{(?![a-z.]+\}\})[^}]*\}\}/.test(v['body']!) ? { body: 'Malformed variable.' } : (v['body']!.match(/\{\{[^}]+\}\}/g) ?? []).some((x) => !VARS.includes(x)) ? { body: 'Unknown variable. Allowed: ' + VARS.join(', ') } : {}) }),
    fields: ({ values: v, set, errors }) => <div className="grid gap-3"><TextField label="Subject" value={v['subject']} onChange={(e) => set('subject', e.target.value)} error={errors['subject']} /><Textarea label="Body" value={v['body']} onChange={(e) => set('body', e.target.value)} rows={8} error={errors['body']} /></div>,
    onConfirm: ({ values: v }) => { patch('emailTemplates', t.key, { subject: v['subject']!, body: v['body']!, customized: true, updatedAt: new Date().toISOString() }); audit('settings.email_template_saved', { type: 'email_template', id: t.key, label: t.name }); return 'Template saved'; } });
  const resend = (d: EmailDelivery) => act.run({ title: 'Resend email', description: `Queues ${d.template} again to ${d.to}.`, confirmLabel: 'Resend', permission: 'services:manage', stepUp: true, reasonRequired: false, onConfirm: () => { patch('emailDeliveries', d.id, { status: 'queued', error: null }); audit('settings.email_resent', { type: 'email_delivery', id: d.id }); return 'Queued'; } });
  return (
    <AdminPage title="Email" description="Transactional email only: receipts, verification, notifications and ticket replies. Bulk marketing email is not supported.">
      <Tabs label="Email sections" value={tab} onValueChange={setTab} items={[{ value: 'smtp', label: 'SMTP' }, { value: 'templates', label: 'Templates', badge: data.emailTemplates.length }, { value: 'deliveries', label: 'Deliveries', badge: data.emailDeliveries.filter((d) => d.status === 'failed' || d.status === 'bounced').length || undefined }]} />
      {tab === 'smtp' ? (<>
        <Columns>
          <Section title="Server" actions={<Button size="sm" variant="secondary" onClick={test} disabled={!m}>Send test…</Button>}><div className="grid gap-4 sm:grid-cols-2"><TextField label="Host" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} error={err['host']} disabled={!m} /><TextField label="Port" inputMode="numeric" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} error={err['port']} disabled={!m} /><Select label="Security" value={f.security} onValueChange={(v) => setF({ ...f, security: v ?? 'starttls' })} options={[{ value: 'starttls', label: 'STARTTLS' }, { value: 'tls', label: 'TLS (implicit)' }]} disabled={!m} /><TextField label="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} disabled={!m} /><TextField label="Password" value={values['password'] ?? ''} readOnly description="Server secret. Not editable or visible here." className="sm:col-span-2" /></div></Section>
          <Section title="Sender"><div className="grid gap-4"><TextField label="From name" value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} disabled={!m} /><TextField label="From address" value={f.fromAddress} onChange={(e) => setF({ ...f, fromAddress: e.target.value })} error={err['fromAddress']} disabled={!m} /><TextField label="Reply-to" value={f.replyTo} onChange={(e) => setF({ ...f, replyTo: e.target.value })} disabled={!m} /></div><div className="mt-4"><Button variant="primary" disabled={!dirty || !m || Object.keys(err).length > 0} onClick={saveSmtp}>Save…</Button></div></Section>
        </Columns>
        <Notice tone="warn" title="Relay is greylisting some messages">3 of the last 20 deliveries returned 421. See the deliveries tab and the open Action Center item.</Notice>
      </>) : null}
      {tab === 'templates' ? <Section title="Templates"><RelatedTable rows={data.emailTemplates} getRowId={(t) => t.key} caption="Email templates" pageSize={10} columns={[col<EmailTemplate>('n', 'Template', (t) => <span className="grid"><b>{t.name}</b><span className="font-mono text-[12px] text-ink3">{t.key}</span></span>, { primary: true, sort: (t) => t.name }), col<EmailTemplate>('s', 'Subject', (t) => t.subject), col<EmailTemplate>('c', 'Source', (t) => <Badge tone={t.customized ? 'accent' : 'neutral'}>{t.customized ? 'Customized' : 'Default'}</Badge>), col<EmailTemplate>('u', 'Updated', (t) => relative(t.updatedAt), { sort: (t) => t.updatedAt, hideOnMobile: true }), col<EmailTemplate>('a', 'Edit', (t) => <Button size="sm" variant="secondary" disabled={!m} onClick={() => editTpl(t)}>Edit…</Button>)]} /></Section> : null}
      {tab === 'deliveries' ? <Section title="Recent deliveries" description="Recipients are masked."><RelatedTable rows={data.emailDeliveries} getRowId={(d) => d.id} caption="Email deliveries" pageSize={10} columns={[col<EmailDelivery>('t', 'Template', (d) => <span className="font-mono text-[12.5px]">{d.template}</span>, { primary: true }), col<EmailDelivery>('to', 'To', (d) => d.to), col<EmailDelivery>('s', 'Status', (d) => <Status map={emailStatus} value={d.status} />, { sort: (d) => d.status }), col<EmailDelivery>('e', 'Error', (d) => d.error ?? '—'), col<EmailDelivery>('w', 'When', (d) => relative(d.at), { sort: (d) => d.at }), col<EmailDelivery>('a', 'Action', (d) => (d.status === 'failed' || d.status === 'bounced' ? <Button size="sm" variant="secondary" disabled={!m || d.status === 'bounced'} title={d.status === 'bounced' ? 'Bounced addresses should be corrected, not resent' : undefined} onClick={() => resend(d)}>Resend…</Button> : '—'))]} /></Section> : null}
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
