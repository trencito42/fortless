import { useCallback, useState, type ReactNode } from 'react';
import { Badge, Button, Dialog, Icon, Notice, StatusBadge, TextField, Textarea } from '@/design-system';
import type { StaffPermission } from '../types';
import { STEP_UP_MINUTES, useSession } from '../session';
import { useToast } from '../toast';

export interface ActionContext { reason: string; values: Record<string, string> }
export interface ActionSpec {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  /** Backend permission the real endpoint enforces. Missing it disables the confirm button and says why. */
  permission?: StaffPermission;
  /** The real endpoint sits behind requireRecentStepUp. */
  stepUp?: boolean;
  tone?: 'default' | 'danger';
  /** Reason is stored in the (preview) audit event. Default: required for danger and step-up actions. */
  reasonRequired?: boolean;
  reasonLabel?: string;
  /** User must type this to enable confirm (irreversible actions on named resources). */
  requireText?: string;
  /** Bullet list of what the real operation would do. */
  effects?: string[];
  initial?: Record<string, string>;
  /** Custom fields; call set(name, value) to update. */
  fields?: (api: { values: Record<string, string>; set: (k: string, v: string) => void; errors: Record<string, string> }) => ReactNode;
  validate?: (values: Record<string, string>) => Partial<Record<string, string>>;
  /** Mutate demo data here. Return the toast message. */
  onConfirm: (ctx: ActionContext) => string | void;
}

/**
 * Standard confirmation for admin operations: states the permission the real endpoint needs, shows step-up status, collects a reason, and
 * says every time that the result is a browser-only preview. Nothing here calls a backend.
 */
export function useActionDialog() {
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const run = useCallback((s: ActionSpec) => setSpec(s), []);
  const node = spec ? <ActionDialog key={spec.title + spec.confirmLabel} spec={spec} onClose={() => setSpec(null)} /> : null;
  return { run, node };
}

function ActionDialog({ spec, onClose }: { spec: ActionSpec; onClose: () => void }) {
  const session = useSession();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [values, setValues] = useState<Record<string, string>>(spec.initial ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const danger = spec.tone === 'danger';
  const reasonRequired = spec.reasonRequired ?? (danger || !!spec.stepUp);
  const allowed = !spec.permission || session.can(spec.permission);
  const stepOk = !spec.stepUp || session.stepUpValid;
  const typedOk = !spec.requireText || typed === spec.requireText;
  const reasonOk = !reasonRequired || reason.trim().length >= 8;
  const ready = allowed && stepOk && typedOk && reasonOk && !session.live;

  const confirm = () => {
    const e: Record<string, string> = {};
    for (const [k, v] of Object.entries(spec.validate?.(values) ?? {})) if (v) e[k] = v;
    if (reasonRequired && reason.trim().length < 8) e['reason'] = 'Give a reason of at least 8 characters. It is written to the audit log.';
    setErrors(e);
    if (Object.keys(e).length > 0 || !ready) return;
    setBusy(true);
    window.setTimeout(() => {
      const msg = spec.onConfirm({ reason: reason.trim(), values });
      toast({ tone: 'good', title: msg || `${spec.title}: done (preview)`, description: 'Simulated in this browser only. No provider, payment or email was touched.' });
      setBusy(false);
      onClose();
    }, 350);
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o && !busy) onClose(); }}
      title={spec.title}
      description={spec.description}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={confirm} loading={busy} loadingLabel="Applying preview" disabled={!ready && !busy}>{spec.confirmLabel}</Button>
      </>}
    >
      <div className="grid gap-4">
        {session.live ? <Notice tone="warn" title="Operation not connected">This control is disabled until its typed Fastify mutation is connected and integration-tested. No browser-only result will be presented as successful.</Notice> : <Notice tone="info" title="Preview only">This changes demo data in this tab. The real operation is not executed.</Notice>}
        {spec.effects?.length ? (
          <div className="grid gap-1.5">
            <p className="text-[13px] font-bold text-ink2">In production this would</p>
            <ul className="grid list-disc gap-1 pl-5 text-ink2">{spec.effects.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ) : null}
        {spec.permission ? (
          <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <Icon name="shield-user" size={18} className="text-ink3" />
            <span className="font-semibold text-ink2">Requires</span> <Badge>{spec.permission}</Badge>
            {allowed ? <StatusBadge tone="good">Your role {session.role} has it</StatusBadge> : <StatusBadge tone="bad">Role {session.role} lacks it</StatusBadge>}
          </div>
        ) : null}
        {!allowed ? <Notice tone="warn" title="Not permitted">The backend would answer 403. Switch role in the profile menu to compare.</Notice> : null}
        {spec.stepUp ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-s2 p-3">
            <div className="flex items-center gap-2"><Icon name="finger-print-scan" size={20} className="text-ink3" /><div><p className="font-bold">Step-up verification</p><p className="text-[13px] text-ink3">The real endpoint requires MFA re-verification within {STEP_UP_MINUTES} minutes.</p></div></div>
            {stepOk ? <StatusBadge tone="good">Verified</StatusBadge> : session.live ? <StatusBadge tone="warn">Recent verification required</StatusBadge> : <Button size="sm" variant="secondary" onClick={session.grantStepUp}>Simulate step-up</Button>}
          </div>
        ) : null}
        {spec.fields?.({ values, set: (k, v) => setValues((s) => ({ ...s, [k]: v })), errors })}
        {reasonRequired || spec.reasonLabel ? <Textarea label={spec.reasonLabel ?? 'Reason (audit log)'} required={reasonRequired} value={reason} maxLength={400} counter onChange={(e) => setReason(e.target.value)} error={errors['reason']} rows={3} /> : null}
        {spec.requireText ? <TextField label={<>Type <b className="font-mono">{spec.requireText}</b> to confirm</>} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /> : null}
      </div>
    </Dialog>
  );
}
