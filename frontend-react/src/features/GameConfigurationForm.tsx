import { useState } from 'react';
import { Card, CardHeader, LoadingButton, Button, NumberField, Select, Switch, TextField, SegmentedControl } from '@/design-system';

export interface MinecraftConfig {
  version: string;
  memoryMb: number;
  maxPlayers: number;
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  gamemode: 'survival' | 'creative' | 'adventure';
  motd: string;
  onlineMode: boolean;
  pvp: boolean;
}

type Errors = Partial<Record<keyof MinecraftConfig, string>>;
export function validateMinecraft(c: MinecraftConfig, limits: { maxMemoryMb: number }): Errors {
  const e: Errors = {};
  if (!c.version) e.version = 'Choose a version.';
  if (c.memoryMb < 512) e.memoryMb = 'At least 512 MB.';
  else if (c.memoryMb > limits.maxMemoryMb) e.memoryMb = `Your plan allows up to ${limits.maxMemoryMb} MB.`;
  if (!Number.isInteger(c.maxPlayers) || c.maxPlayers < 1 || c.maxPlayers > 1000) e.maxPlayers = 'Enter a whole number from 1 to 1000.';
  if (c.motd.length > 59) e.motd = 'Keep the message under 60 characters.';
  return e;
}

export interface GameConfigurationFormProps {
  initial: MinecraftConfig;
  versions: string[];
  maxMemoryMb: number;
  /** Persist to the panel. Throwing shows the message in the form. A running server usually needs a restart: say so via `restartNote`. */
  onSave: (config: MinecraftConfig) => Promise<void>;
  restartNote?: string;
}

/** Minecraft settings. Other games get their own forms; the shell (Card, dirty tracking, save/reset) is the reusable part. */
export function GameConfigurationForm({ initial, versions, maxMemoryMb, onSave, restartNote = 'Changes apply after the next restart.' }: GameConfigurationFormProps) {
  const [saved, setSaved] = useState(initial);
  const [c, setC] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [fail, setFail] = useState<string | null>(null);
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);
  const set = <K extends keyof MinecraftConfig>(k: K, v: MinecraftConfig[K]) => { setC((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: undefined })); };

  const save = async () => {
    const e = validateMinecraft(c, { maxMemoryMb });
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setFail(null);
    try { await onSave(c); setSaved(c); } catch (err) { setFail(err instanceof Error ? err.message : 'Could not save. Try again.'); }
  };

  return (
    <Card>
      <CardHeader title="Minecraft settings" description={restartNote} />
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          <Select label="Version" value={c.version} onValueChange={(v) => set('version', v ?? '')} options={versions.map((v) => ({ value: v, label: v }))} error={errors.version} />
          <NumberField label="Memory" unit="MB" min={512} step={256} largeStep={1024} value={c.memoryMb} onValueChange={(v) => set('memoryMb', v ?? 0)} error={errors.memoryMb} description={`Plan limit ${maxMemoryMb} MB`} />
          <NumberField label="Max players" value={c.maxPlayers} min={1} onValueChange={(v) => set('maxPlayers', v ?? 0)} error={errors.maxPlayers} />
          <TextField label="Message of the day" value={c.motd} onChange={(e) => set('motd', e.target.value)} error={errors.motd} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          <div className="grid gap-1.5"><span className="text-[13px] font-bold text-ink2">Difficulty</span><SegmentedControl aria-label="Difficulty" value={c.difficulty} onValueChange={(v) => set('difficulty', v)} options={[{ value: 'peaceful', label: 'Peaceful' }, { value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }]} /></div>
          <div className="grid gap-1.5"><span className="text-[13px] font-bold text-ink2">Game mode</span><SegmentedControl aria-label="Game mode" value={c.gamemode} onValueChange={(v) => set('gamemode', v)} options={[{ value: 'survival', label: 'Survival' }, { value: 'creative', label: 'Creative' }, { value: 'adventure', label: 'Adventure' }]} /></div>
        </div>
        <Switch label="Verify players with Mojang (online mode)" description="Turn off only behind a proxy that handles authentication." checked={c.onlineMode} onCheckedChange={(v) => set('onlineMode', v)} />
        <Switch label="Player versus player" checked={c.pvp} onCheckedChange={(v) => set('pvp', v)} />
        {fail ? <p role="alert" className="rounded-md bg-bad-bg px-4 py-2.5 font-semibold text-bad">{fail}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={!dirty} onClick={() => { setC(saved); setErrors({}); setFail(null); }}>Discard changes</Button>
          <LoadingButton type="submit" variant="primary" disabled={!dirty} onClick={save}>Save settings</LoadingButton>
        </div>
      </form>
    </Card>
  );
}
