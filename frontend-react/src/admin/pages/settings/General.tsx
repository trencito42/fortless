import { Button, Notice, Select, TextField } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useForm, required, email, minLen } from '../../hooks/useForm';
import { useSettings } from '../../hooks/useSettings';
import { useSession } from '../../session';

export default function General() {
  const { values, save } = useSettings('general');
  const { can } = useSession();
  const act = useActionDialog();
  const f = useForm({ company: values['company'] ?? '', siteUrl: values['siteUrl'] ?? '', supportEmail: values['supportEmail'] ?? '', billingEmail: values['billingEmail'] ?? '', timezone: values['timezone'] ?? 'UTC', defaultCurrency: values['defaultCurrency'] ?? 'EUR', statusUrl: values['statusUrl'] ?? '' }, {
    company: [required('Company name'), minLen(3, 'Company name')], siteUrl: [(v) => (/^https:\/\/[a-z0-9.-]+(\/.*)?$/i.test(v) ? undefined : 'Use an https:// address.')], supportEmail: [email], billingEmail: [email], statusUrl: [(v) => (/^https:\/\//.test(v) ? undefined : 'Use an https:// address.')],
  });
  const m = can('admin:access');
  const submit = () => { if (!f.submit()) return; act.run({ title: 'Save general settings', description: 'Applies to emails, invoices and public links.', confirmLabel: 'Save settings', permission: 'services:manage', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { save(f.values, 'settings.general_updated', reason); f.reset(f.values); } }); };
  return (
    <AdminPage title="General settings" description="Identity and defaults of the platform." actions={<><Button variant="ghost" disabled={!f.dirty} onClick={() => f.reset()}>Discard</Button><Button variant="primary" disabled={!f.dirty || !m} onClick={submit}>Save…</Button></>}>
      <Notice tone="info" title="Environment-managed values">Deployment-level values (database, secrets, ports) are not editable here. They live in server environment configuration.</Notice>
      <Section title="Company"><div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Company name" required value={f.values.company} onChange={(e) => f.set('company', e.target.value)} onBlur={() => f.blur('company')} error={f.errors.company} />
        <TextField label="Public site address" required value={f.values.siteUrl} onChange={(e) => f.set('siteUrl', e.target.value)} onBlur={() => f.blur('siteUrl')} error={f.errors.siteUrl} />
        <TextField label="Support email" required value={f.values.supportEmail} onChange={(e) => f.set('supportEmail', e.target.value)} onBlur={() => f.blur('supportEmail')} error={f.errors.supportEmail} />
        <TextField label="Billing email" required value={f.values.billingEmail} onChange={(e) => f.set('billingEmail', e.target.value)} onBlur={() => f.blur('billingEmail')} error={f.errors.billingEmail} />
        <TextField label="Status page address" value={f.values.statusUrl} onChange={(e) => f.set('statusUrl', e.target.value)} onBlur={() => f.blur('statusUrl')} error={f.errors.statusUrl} />
      </div></Section>
      <Section title="Defaults"><div className="grid gap-4 sm:grid-cols-2"><Select label="Default currency" value={f.values.defaultCurrency} onValueChange={(v) => f.set('defaultCurrency', v ?? 'EUR')} options={['EUR', 'USD', 'RON'].map((c) => ({ value: c, label: c }))} description="Used when a customer’s country has no mapped currency." /><Select label="Display time zone (staff)" value={f.values.timezone} onValueChange={(v) => f.set('timezone', v ?? 'UTC')} options={['UTC', 'Europe/Bucharest', 'Europe/Berlin', 'America/New_York'].map((z) => ({ value: z, label: z }))} description="Data is stored and shown in UTC in this preview." /></div></Section>
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
