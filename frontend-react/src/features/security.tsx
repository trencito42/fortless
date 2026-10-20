import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ActionMenu, AlertDialog, Button, Card, CardHeader, CopyButton, EmptyState, Icon, LoadingButton, StatusBadge, type IconName } from '@/design-system';

/** Row of single-digit boxes with paste, backspace and arrow handling. Calls onComplete once all digits are present. */
export function OtpInput({ length = 6, label = 'Verification code', onComplete, error, disabled }: { length?: number; label?: string; onComplete: (code: string) => void | Promise<void>; error?: string; disabled?: boolean }) {
  const [d, setD] = useState<string[]>(Array(length).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const id = useId();
  const set = (next: string[]) => { setD(next); if (next.every(Boolean)) void onComplete(next.join('')); };
  const onChange = (i: number, v: string) => {
    const c = v.replace(/\D/g, '').slice(-1);
    const n = [...d]; n[i] = c; set(n);
    if (c && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onKey = (i: number, e: KeyboardEvent) => {
    if (e.key === 'Backspace' && !d[i] && i > 0) { refs.current[i - 1]?.focus(); }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!t) return;
    e.preventDefault();
    const n = Array(length).fill('').map((_, i) => t[i] ?? ''); set(n);
    refs.current[Math.min(t.length, length - 1)]?.focus();
  };
  useEffect(() => { if (error) { setD(Array(length).fill('')); refs.current[0]?.focus(); } }, [error, length]);
  return (
    <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
      <legend className="mb-1 text-[13px] font-bold text-ink2">{label}</legend>
      <div className="flex min-w-0 gap-1.5 sm:gap-2" onPaste={onPaste}>
        {d.map((v, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} id={`${id}-${i}`} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1} value={v} aria-label={`Digit ${i + 1} of ${length}`} aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onFocus={(e) => e.target.select()}
            className={`h-14 w-0 min-w-0 flex-1 rounded-md bg-s2 text-center font-mono text-[22px] font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent ${error ? 'ring-2 ring-bad' : ''}`} />
        ))}
      </div>
      {error ? <p role="alert" className="text-[13px] font-semibold text-bad">{error}</p> : null}
    </fieldset>
  );
}

export function RecoveryCodes({ codes, onRegenerate }: { codes: string[]; onRegenerate?: () => Promise<void> }) {
  return (
    <div className="grid gap-3">
      <p className="rounded-md bg-warn-bg px-4 py-2.5 font-semibold text-warn">Each code works once. Store them somewhere safe; they are shown only now.</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-[14px] font-bold" aria-label="Recovery codes">{codes.map((c) => <li key={c} className="rounded-md bg-s2 px-3 py-2">{c}</li>)}</ul>
      <div className="flex flex-wrap gap-2"><CopyButton value={codes.join('\n')} label="Copy recovery codes" text="Copy all" />{onRegenerate ? <LoadingButton variant="secondary" onClick={onRegenerate}>Regenerate codes</LoadingButton> : null}</div>
    </div>
  );
}

export interface TwoFactorSetupProps {
  /** Rendered by the app (SVG/img of the otpauth:// URI). This library does not generate QR codes. */
  qr: React.ReactNode;
  /** Manual-entry secret shown as text for people who cannot scan. */
  secret: string;
  onVerify: (code: string) => Promise<void>;
}
/** Authenticator-app enrolment: scan, or type the secret, then confirm with a code. Verification failures reset the code boxes. */
export function TwoFactorSetup({ qr, secret, onVerify }: TwoFactorSetupProps) {
  const [err, setErr] = useState<string>();
  return (
    <Card pad="lg" className="grid gap-5">
      <CardHeader title="Set up an authenticator app" description="Use any TOTP app (1Password, Authy, Google Authenticator)." />
      <div className="grid items-center gap-5 sm:grid-cols-[180px_1fr]">
        <div className="mx-auto grid size-[180px] place-items-center rounded-lg bg-white p-3" role="img" aria-label="QR code for the authenticator app">{qr}</div>
        <div className="grid gap-2"><p className="text-ink2">Can't scan? Enter this key manually:</p><p className="flex items-center gap-2 font-mono text-[15px] font-bold break-all">{secret}<CopyButton value={secret} label="Copy setup key" size="sm" /></p></div>
      </div>
      <OtpInput onComplete={async (c) => { setErr(undefined); try { await onVerify(c); } catch (e) { setErr(e instanceof Error ? e.message : 'That code did not work. Try the next one.'); } }} error={err} />
    </Card>
  );
}

export interface Passkey { id: string; name: string; added: string; lastUsed?: string; deviceIcon?: IconName }
export function PasskeyList({ passkeys, onAdd, onRemove, onRename }: { passkeys: Passkey[]; onAdd: () => Promise<void>; onRemove: (p: Passkey) => Promise<void>; onRename?: (p: Passkey) => void }) {
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Passkeys" description="Sign in with a fingerprint, face or device PIN." actions={<LoadingButton variant="secondary" leadingIcon="add-01" onClick={onAdd}>Add passkey</LoadingButton>} />
      {passkeys.length === 0 ? <EmptyState icon="finger-print-scan" title="No passkeys yet" description="Add one to sign in without a password." /> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{passkeys.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-md bg-s2 p-3">
            <span className="grid size-10 place-items-center rounded-md bg-s3"><Icon name={p.deviceIcon ?? 'finger-print-scan'} /></span>
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{p.name}</p><p className="text-[13px] text-ink3">Added {p.added}{p.lastUsed ? ` · Last used ${p.lastUsed}` : ''}</p></div>
            <ActionMenu label={`Actions for ${p.name}`} entries={[...(onRename ? [{ id: 'r', label: 'Rename', onSelect: () => onRename(p) }] : []), { id: 'x', label: 'Remove', tone: 'danger' as const, onSelect: () => void onRemove(p) }]} />
          </li>))}</ul>
      )}
    </Card>
  );
}

export interface Session { id: string; device: string; location?: string; lastActive: string; current?: boolean }
export function SessionList({ sessions, onRevoke, onRevokeOthers }: { sessions: Session[]; onRevoke: (s: Session) => Promise<void>; onRevokeOthers?: () => Promise<void> }) {
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Active sessions" actions={onRevokeOthers ? <AlertDialog trigger={<Button variant="danger-subtle">Sign out other devices</Button>} title="Sign out other devices?" description="Every session except this one is ended." confirmLabel="Sign out" tone="danger" onConfirm={onRevokeOthers} /> : undefined} />
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-3 rounded-md bg-s2 p-3">
          <Icon name="laptop" className="text-ink3" />
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{s.device}{s.current ? <StatusBadge tone="good" className="ml-2">This device</StatusBadge> : null}</p><p className="text-[13px] text-ink3">{[s.location, s.lastActive].filter(Boolean).join(' · ')}</p></div>
          {!s.current ? <LoadingButton size="sm" variant="secondary" onClick={() => onRevoke(s)}>Sign out</LoadingButton> : null}
        </li>))}</ul>
    </Card>
  );
}
