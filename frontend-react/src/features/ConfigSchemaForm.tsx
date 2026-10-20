import { useMemo, useState } from 'react';
import { Button, Card, CardHeader, LoadingButton, NumberField, Notice, Select, Switch, TextField } from '@/design-system';

export type ConfigValue = string | number | boolean;
export type ConfigValues = Record<string, ConfigValue>;

interface FieldBase { key: string; label: string; description?: string; /** Needs a restart to take effect. */ restart?: boolean }
export type ConfigField =
  | (FieldBase & { type: 'text'; maxLength?: number; required?: boolean })
  | (FieldBase & { type: 'number'; min?: number; max?: number; step?: number; unit?: string })
  | (FieldBase & { type: 'select'; options: { value: string; label: string }[] })
  | (FieldBase & { type: 'switch' });
export interface ConfigSection { id: string; title: string; fields: ConfigField[] }

export interface ConfigSchemaFormProps {
  title: string;
  description?: string;
  sections: ConfigSection[];
  initial: ConfigValues;
  /** Receives only the keys that changed. A rejection keeps the draft and is shown above the form. */
  onSave: (changes: ConfigValues, all: ConfigValues) => Promise<void>;
  disabledReason?: string;
}

/** Returns an error per field key. Exported so the same rules can run before a request is sent. */
export function validateConfig(sections: ConfigSection[], values: ConfigValues): Record<string, string> {
  const e: Record<string, string> = {};
  for (const f of sections.flatMap((s) => s.fields)) {
    const v = values[f.key];
    if (f.type === 'text') {
      if (f.required && String(v ?? '').trim() === '') e[f.key] = `${f.label} is required.`;
      else if (f.maxLength && String(v ?? '').length > f.maxLength) e[f.key] = `Keep it under ${f.maxLength + 1} characters.`;
    } else if (f.type === 'number') {
      if (typeof v !== 'number' || Number.isNaN(v)) e[f.key] = 'Enter a number.';
      else if (f.min != null && v < f.min) e[f.key] = `At least ${f.min}.`;
      else if (f.max != null && v > f.max) e[f.key] = `At most ${f.max}.`;
    }
  }
  return e;
}

/**
 * Schema-driven settings form: the schema decides which controls exist, so one component serves Minecraft server.properties,
 * Rust, bots or anything else without a hardcoded form per game. Tracks changes, validates before sending, and lists which
 * changed settings need a restart.
 */
export function ConfigSchemaForm({ title, description, sections, initial, onSave, disabledReason }: ConfigSchemaFormProps) {
  const [values, setValues] = useState<ConfigValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [base, setBase] = useState<ConfigValues>(initial);
  const changed = useMemo(() => Object.keys(values).filter((k) => values[k] !== base[k]), [values, base]);
  const restartKeys = useMemo(() => sections.flatMap((s) => s.fields).filter((f) => f.restart && changed.includes(f.key)).map((f) => f.label), [sections, changed]);
  const locked = !!disabledReason;

  const set = (key: string, v: ConfigValue) => { setSaved(false); setErrors(({ [key]: _d, ...rest }) => rest); setValues((x) => ({ ...x, [key]: v })); };
  const save = async () => {
    const found = validateConfig(sections, values);
    setErrors(found); setFailure(null);
    if (Object.keys(found).length) return;
    const diff = Object.fromEntries(changed.map((k) => [k, values[k] as ConfigValue]));
    try { await onSave(diff, values); setBase(values); setSaved(true); } catch (e) { setFailure(e instanceof Error ? e.message : 'Could not save the settings.'); }
  };

  return (
    <Card>
      <CardHeader title={title} description={description} actions={
        <span className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={changed.length === 0 || locked} onClick={() => { setValues(base); setErrors({}); setFailure(null); }}>Discard</Button>
          <LoadingButton variant="primary" size="sm" disabled={changed.length === 0 || locked} onClick={save}>{changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Save'}</LoadingButton>
        </span>
      } />
      <div className="grid gap-6">
        {locked ? <Notice tone="warn" title="Read-only">{disabledReason}</Notice> : null}
        {failure ? <Notice tone="bad" title="Not saved">{failure}</Notice> : null}
        {saved && changed.length === 0 ? <Notice tone="good">Settings saved.</Notice> : null}
        {restartKeys.length ? <Notice tone="info">Restart needed for: {restartKeys.join(', ')}.</Notice> : null}
        {sections.map((s) => (
          <section key={s.id} aria-labelledby={`cfg-${s.id}`} className="grid gap-3">
            <h4 id={`cfg-${s.id}`} className="text-[13px] font-bold text-ink3">{s.title}</h4>
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-4 md:grid-cols-2">
              {s.fields.map((f) => {
                const v = values[f.key];
                const err = errors[f.key];
                if (f.type === 'switch') return <Switch key={f.key} label={f.label} description={f.description} checked={v === true} disabled={locked} onCheckedChange={(c) => set(f.key, c)} />;
                if (f.type === 'select') return <Select key={f.key} label={f.label} description={f.description} value={String(v ?? '')} options={f.options} disabled={locked} onValueChange={(x) => set(f.key, x ?? '')} />;
                if (f.type === 'number') return <NumberField key={f.key} label={f.label} description={f.description} value={typeof v === 'number' ? v : null} min={f.min} max={f.max} step={f.step} unit={f.unit} readOnly={locked} error={err} onValueChange={(n) => set(f.key, n ?? NaN)} />;
                return <TextField key={f.key} label={f.label} description={f.description} value={String(v ?? '')} readOnly={locked} error={err} required={f.required} onChange={(e) => set(f.key, e.target.value)} />;
              })}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}
