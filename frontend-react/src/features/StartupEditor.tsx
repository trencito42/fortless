import { useMemo, useState } from 'react';
import { Button, Card, CardHeader, LoadingButton, Notice, Select, TextField, Textarea } from '@/design-system';

export interface StartupVariable {
  /** Environment variable name, e.g. MINECRAFT_VERSION. */
  key: string;
  label: string;
  description?: string;
  value: string;
  required?: boolean;
  /** False when the provider marks the variable as read-only for customers. */
  editable?: boolean;
}
export interface StartupConfig { command: string; dockerImage: string; variables: StartupVariable[] }

export interface StartupEditorProps {
  initial: StartupConfig;
  images: { value: string; label: string }[];
  /** Command editing can be locked by the plan or egg. Variables remain editable. */
  commandEditable?: boolean;
  onSave: (config: StartupConfig) => Promise<void>;
  /** Everything read-only with a reason (missing permission, server installing). */
  disabledReason?: string;
  restartNote?: string;
}

/**
 * Startup command, runtime image and egg variables. Tracks its own draft: Save is enabled only when something changed,
 * required variables are validated, and a failed save keeps the draft and says why. Never sends unchanged data.
 */
export function StartupEditor({ initial, images, commandEditable = true, onSave, disabledReason, restartNote = 'Changes apply after the next restart.' }: StartupEditorProps) {
  const [draft, setDraft] = useState<StartupConfig>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const locked = !!disabledReason;

  const setVar = (key: string, value: string) => { setSaved(false); setErrors(({ [key]: _d, ...rest }) => rest); setDraft((d) => ({ ...d, variables: d.variables.map((v) => (v.key === key ? { ...v, value } : v)) })); };
  const save = async () => {
    const found: Record<string, string> = {};
    if (commandEditable && !draft.command.trim()) found.command = 'The startup command cannot be empty.';
    for (const v of draft.variables) if (v.required && !v.value.trim()) found[v.key] = `${v.label} is required.`;
    setErrors(found); setFailure(null); setSaved(false);
    if (Object.keys(found).length) return;
    try { await onSave(draft); setSaved(true); } catch (e) { setFailure(e instanceof Error ? e.message : 'Could not save the startup settings.'); }
  };

  return (
    <Card>
      <CardHeader title="Startup" description={restartNote} actions={
        <span className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || locked} onClick={() => { setDraft(initial); setErrors({}); setFailure(null); }}>Reset</Button>
          <LoadingButton variant="primary" size="sm" disabled={!dirty || locked} onClick={save}>Save changes</LoadingButton>
        </span>
      } />
      <div className="grid gap-5">
        {locked ? <Notice tone="warn" title="Read-only">{disabledReason}</Notice> : null}
        {failure ? <Notice tone="bad" title="Not saved">{failure}</Notice> : null}
        {saved && !dirty ? <Notice tone="good">Saved. {restartNote}</Notice> : null}
        <Textarea label="Startup command" rows={3} value={draft.command} readOnly={!commandEditable || locked} error={errors.command} description={commandEditable ? undefined : 'This command is managed by the plan.'} onChange={(e) => { setSaved(false); setDraft({ ...draft, command: e.target.value }); }} className="font-mono" />
        <Select label="Docker image" value={draft.dockerImage} disabled={locked} options={images} onValueChange={(v) => { setSaved(false); setDraft({ ...draft, dockerImage: v ?? draft.dockerImage }); }} />
        {draft.variables.map((v) => (
          <TextField key={v.key} label={<span>{v.label} <code className="ml-1 font-mono text-[11px] font-semibold text-ink3">{v.key}</code></span>} description={v.description} value={v.value} readOnly={v.editable === false || locked} required={v.required} error={errors[v.key]} onChange={(e) => setVar(v.key, e.target.value)} />
        ))}
      </div>
    </Card>
  );
}
