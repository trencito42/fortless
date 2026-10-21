import { Badge, Button, NumberField, Switch, TagInput } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useSettings } from '../../hooks/useSettings';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { useState } from 'react';

export default function Auth() {
  const { values, save } = useSettings('auth');
  const { data } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const [v, setV] = useState(values);
  const [origins, setOrigins] = useState((values['allowedOrigins'] ?? '').split(',').filter(Boolean));
  const dirty = JSON.stringify(v) !== JSON.stringify(values) || origins.join(',') !== (values['allowedOrigins'] ?? '');
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const staffNoMfa = data.staff.filter((s) => s.status === 'ACTIVE' && !s.mfa).length;
  const errs: Record<string, string> = {};
  if (Number(v['minPassword']) < 10) errs['minPassword'] = 'Minimum length below 10 is not allowed.';
  if (Number(v['stepUpMinutes']) < 1 || Number(v['stepUpMinutes']) > 15) errs['stepUpMinutes'] = 'Step-up window must be 1–15 minutes.';
  if (Number(v['sessionHours']) < 1 || Number(v['sessionHours']) > 72) errs['sessionHours'] = 'Session lifetime must be 1–72 hours.';
  const submit = () => { if (Object.keys(errs).length) return; act.run({ title: 'Save authentication settings', description: v['staffMfaRequired'] === 'false' ? 'Turning off required MFA for staff weakens every sensitive action.' : 'Applies to new sessions.', confirmLabel: 'Save settings', permission: 'services:manage', stepUp: true, tone: v['staffMfaRequired'] === 'false' ? 'danger' : 'default', reasonRequired: true, onConfirm: ({ reason }) => { save({ ...v, allowedOrigins: origins.join(',') }, 'settings.auth_updated', reason); } }); };
  return (
    <AdminPage title="Authentication & security" description="Password rules, sessions, MFA and sign-in providers." actions={<><Button variant="ghost" disabled={!dirty} onClick={() => { setV(values); setOrigins((values['allowedOrigins'] ?? '').split(',').filter(Boolean)); }}>Discard</Button><Button variant="primary" disabled={!dirty || !can('services:manage') || Object.keys(errs).length > 0} onClick={submit}>Save…</Button></>}>
      <Columns>
        <Section title="Passwords & sessions"><div className="grid gap-4"><NumberField label="Minimum password length" value={Number(v['minPassword'])} onValueChange={(x) => set('minPassword', String(x ?? ''))} min={8} max={64} error={errs['minPassword']} description="Customers choose their own passwords; staff cannot read or set them." /><NumberField label="Session lifetime (hours)" value={Number(v['sessionHours'])} onValueChange={(x) => set('sessionHours', String(x ?? ''))} min={1} max={72} error={errs['sessionHours']} /><NumberField label="Failed sign-ins before lockout" value={Number(v['lockoutAttempts'])} onValueChange={(x) => set('lockoutAttempts', String(x ?? ''))} min={3} max={50} /></div></Section>
        <Section title="Multi-factor authentication"><div className="grid gap-3"><Switch label="Require MFA for staff" checked={v['staffMfaRequired'] === 'true'} onCheckedChange={(x) => set('staffMfaRequired', String(x))} description={staffNoMfa ? `${staffNoMfa} active staff have no MFA yet and would be forced to enroll.` : 'Everyone already has MFA.'} /><Switch label="Offer MFA to customers" checked={v['customerMfaOffered'] === 'true'} onCheckedChange={(x) => set('customerMfaOffered', String(x))} /><NumberField label="Step-up window (minutes)" value={Number(v['stepUpMinutes'])} onValueChange={(x) => set('stepUpMinutes', String(x ?? ''))} min={1} max={15} error={errs['stepUpMinutes']} description="How long a verification stays valid for sensitive actions." /></div></Section>
      </Columns>
      <Section title="Sign-in providers" description="OpenID Connect providers offered on the sign-in page. Client secrets are server environment values."><ul className="grid gap-2">{([['oidcDiscord', 'Discord', 'configured'], ['oidcGithub', 'GitHub', 'not configured'], ['oidcGoogle', 'Google', 'not configured']] as const).map(([k, l, s]) => <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2.5"><span><b>{l}</b><span className="block text-[12.5px] text-ink3">Client secret: {s === 'configured' ? '••••••••••• (server-side)' : 'not set'}</span></span><span className="flex items-center gap-2"><Badge tone={s === 'configured' ? 'good' : 'neutral'}>{s}</Badge><Switch hideLabel label={`Offer ${l} sign-in`} checked={v[k] === 'true'} disabled={s !== 'configured'} onCheckedChange={(x) => set(k, String(x))} /></span></li>)}</ul></Section>
      <Section title="Allowed origins" description="Browser origins accepted for state-changing requests."><TagInput label="Origins" value={origins} onValueChange={(x) => setOrigins(x)} validate={(t) => (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(t) ? null : 'Use an https:// origin without a path.')} max={6} /></Section>
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
