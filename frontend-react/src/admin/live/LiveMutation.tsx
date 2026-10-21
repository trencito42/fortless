import { cloneElement, useState, type MouseEventHandler, type ReactElement } from 'react';
import { Button, Dialog, Notice, TextField, Textarea } from '@/design-system';
import { AdminApiError, adminRequest, authRequest } from '../data/http';
import { useToast } from '../toast';

export interface MutationSpec {
  title: string;
  confirmLabel: string;
  endpoint: string | ((values: Record<string, string>) => string);
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  tone?: 'default' | 'danger';
  reason?: boolean;
  reasonMinLength?: number;
  initial?: Record<string, string>;
  fields?: (input: { values: Record<string, string>; set: (key: string, value: string) => void; errors: Record<string, string> }) => ReactElement;
  validate?: (values: Record<string, string>) => Partial<Record<string, string>>;
  body?: (reason: string, values: Record<string, string>) => Record<string, unknown>;
}

export function LiveMutation({ spec, onDone, trigger }: { spec: MutationSpec; onDone: () => void; trigger: ReactElement<{ onClick?: MouseEventHandler }> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [values, setValues] = useState<Record<string, string>>(spec.initial ?? {});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stepUp, setStepUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const toast = useToast();
  const close = () => { if (!busy) { setOpen(false); setError(undefined); setStepUp(false); setPassword(''); setCode(''); } };
  const mutate = async () => {
    const body = spec.body?.(reason.trim(), values) ?? (spec.reason ? { reason: reason.trim() } : {});
    const endpoint = typeof spec.endpoint === 'function' ? spec.endpoint(values) : spec.endpoint;
    return adminRequest<Record<string, unknown>>(endpoint, { method: spec.method ?? 'POST', body: JSON.stringify(body) });
  };
  const submit = async () => {
    const invalid = Object.fromEntries(Object.entries(spec.validate?.(values) ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1])));
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    const reasonMinimum = spec.reasonMinLength ?? 3;
    if (spec.reason && reason.trim().length < reasonMinimum) { setError(`Give an audit reason of at least ${reasonMinimum} characters.`); return; }
    setBusy(true); setError(undefined);
    try {
      if (stepUp) {
        if (!password || !/^\d{6}$/.test(code)) { setError('Enter your password and six-digit authenticator code.'); return; }
        await authRequest('/step-up', { method: 'POST', body: JSON.stringify({ password, code }) });
      }
      await mutate();
      toast({ tone: 'good', title: `${spec.title} completed`, description: 'The authoritative API accepted the operation.' });
      setOpen(false); onDone();
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === 'STEP_UP_REQUIRED') { setStepUp(true); setError('Confirm your identity to continue.'); }
      else setError(cause instanceof Error ? cause.message : 'The operation failed.');
    } finally { setBusy(false); }
  };
  return <>
    {cloneElement(trigger, { onClick: (event) => { event.stopPropagation(); setOpen(true); } })}
    <Dialog open={open} onOpenChange={(value) => value ? setOpen(true) : close()} title={spec.title} description="This action is executed by Fastify and recorded by the backend." footer={<><Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button><Button variant={spec.tone === 'danger' ? 'danger' : 'primary'} onClick={() => void submit()} loading={busy}>{spec.confirmLabel}</Button></>}>
      <div className="grid gap-4">
        {error ? <Notice tone="bad" title="Operation not completed">{error}</Notice> : null}
        {spec.fields?.({ values, set: (key, value) => setValues((current) => ({ ...current, [key]: value })), errors: fieldErrors })}
        {spec.reason ? <Textarea label="Reason (audit log)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} counter required /> : null}
        {stepUp ? <><Notice tone="warn" title="Recent verification required">Use your current password and authenticator code. They are sent only to the existing Fortless step-up endpoint.</Notice><TextField label="Current password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><TextField label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></> : null}
      </div>
    </Dialog>
  </>;
}
