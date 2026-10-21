import { Badge, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { KpiGrid, Section } from '../../components/Cards';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';

type State = 'configured' | 'partial' | 'missing' | 'unknown';
interface Control { id: string; area: string; name: string; state: State; evidence: string; action?: { label: string; to: string } }
const tone: Record<State, 'good' | 'warn' | 'bad' | 'neutral'> = { configured: 'good', partial: 'warn', missing: 'bad', unknown: 'neutral' };
const label: Record<State, string> = { configured: 'Configured', partial: 'Partly configured', missing: 'Missing', unknown: 'Cannot be verified here' };

export default function SecurityPolicy() {
  const { data } = useAdmin();
  const active = data.staff.filter((s) => s.status === 'ACTIVE');
  const noMfa = active.filter((s) => !s.mfa);
  const controls: Control[] = [
    { id: 'c1', area: 'Authentication', name: 'MFA for every staff account', state: noMfa.length ? 'partial' : 'configured', evidence: `${active.length - noMfa.length} of ${active.length} active staff have MFA${noMfa.length ? `; missing: ${noMfa.map((s) => s.name).join(', ')}` : ''}`, ...(noMfa.length ? { action: { label: 'Open staff sessions', to: '/staff/sessions' } } : {}) },
    { id: 'c2', area: 'Authentication', name: 'Step-up verification for sensitive endpoints', state: 'configured', evidence: 'Refunds, suspend/terminate, role changes, publishing, SMTP and exports sit behind requireRecentStepUp (5-minute window).' },
    { id: 'c3', area: 'Authentication', name: 'Origin check on state-changing requests', state: 'configured', evidence: 'The Fastify backend rejects mutating requests with a foreign Origin.' },
    { id: 'c4', area: 'Authentication', name: 'Staff IP allowlist', state: data.staff.filter((s) => s.ipAllowlist.length).length === active.length ? 'configured' : 'partial', evidence: `${data.staff.filter((s) => s.status === 'ACTIVE' && s.ipAllowlist.length).length} of ${active.length} active staff are restricted to an IP range.`, action: { label: 'Open directory', to: '/staff' } },
    { id: 'c5', area: 'Authorization', name: 'Server-side permission check on every endpoint', state: 'configured', evidence: 'requireStaffPermission(…) guards each /api/v1/admin route; the UI only mirrors it.' },
    { id: 'c6', area: 'Authorization', name: 'Last owner and self-change protection', state: 'configured', evidence: 'applyStaffChange blocks self-modification and removal of the final active owner.' },
    { id: 'c7', area: 'Authorization', name: 'Second-person approval for large refunds', state: 'missing', evidence: 'Approval requests exist only in this preview. The refund endpoint relies on role plus step-up.', action: { label: 'Open approvals', to: '/staff/approvals' } },
    { id: 'c8', area: 'Data protection', name: 'No card numbers or CVVs stored', state: 'configured', evidence: 'Only brand and last four digits are kept; Stripe holds the card.' },
    { id: 'c9', area: 'Data protection', name: 'Secrets never reach the browser', state: 'configured', evidence: 'Provider tokens and Stripe keys are server environment values; the UI shows masked references.' },
    { id: 'c10', area: 'Data protection', name: 'Audit log excludes credentials', state: 'configured', evidence: 'Event metadata is limited to safe fields; sensitive values are masked before storage.' },
    { id: 'c11', area: 'Payments', name: 'Stripe webhook signature verification', state: 'configured', evidence: 'Raw-body HMAC-SHA256 verification before an event is stored or processed.' },
    { id: 'c12', area: 'Payments', name: 'Idempotent payment and provisioning side effects', state: 'configured', evidence: 'Idempotency keys on financial mutations and provider calls; outcome-unknown handling by correlation tag.' },
    { id: 'c13', area: 'Network', name: 'SSRF protection for outbound requests', state: 'configured', evidence: 'User-supplied URLs resolve and are checked against loopback, private and metadata ranges.' },
    { id: 'c14', area: 'Operations', name: 'Audit log retention policy', state: 'missing', evidence: 'No retention or archival schedule is configured for audit events.' },
    { id: 'c15', area: 'Operations', name: 'Restore test of database backups', state: 'missing', evidence: 'Backups run daily, but no restore test is recorded.', action: { label: 'See scheduled tasks', to: '/settings/system' } },
    { id: 'c16', area: 'Operations', name: 'Alerting on repeated failed sign-ins', state: 'partial', evidence: 'Rate limiting is active and raises an Action Center item; no paging integration is configured.', action: { label: 'Notifications', to: '/settings/notifications' } },
    { id: 'c17', area: 'Operations', name: 'Penetration test within 12 months', state: 'unknown', evidence: 'Not tracked in the platform. Record external assessments in your compliance process.' },
  ];
  const by = (s: State) => controls.filter((c) => c.state === s).length;
  const areas = [...new Set(controls.map((c) => c.area))];
  return (
    <AdminPage title="Security policy" description="Which controls are in place and which are missing, with the evidence for each. Controls that cannot be checked from the application are labelled, not guessed.">
      <KpiGrid cols={4} items={[{ label: 'Configured', value: by('configured'), icon: 'shield-01' }, { label: 'Partly configured', value: by('partial'), icon: 'alert-01' }, { label: 'Missing', value: by('missing'), icon: 'alert-circle' }, { label: 'Not verifiable here', value: by('unknown'), icon: 'help-circle' }]} />
      <Notice tone="info" title="Evidence, not certification">Statuses reflect backend behaviour documented in the code and the demo data. This page is not a compliance attestation.</Notice>
      {areas.map((a) => <Section key={a} title={a}><ul className="grid gap-2">{controls.filter((c) => c.area === a).map((c) => <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-s2 p-3.5"><div className="min-w-0 flex-1 basis-64"><p className="font-bold">{c.name}</p><p className="text-[13.5px] text-ink2">{c.evidence}</p>{c.action ? <p className="mt-1"><EntityLink to={c.action.to}>{c.action.label}</EntityLink></p> : null}</div><Badge tone={tone[c.state]}>{label[c.state]}</Badge></li>)}</ul></Section>)}
    </AdminPage>
  );
}
