import { useState } from 'react';
import { ActionMenu, Button, Card, CardHeader, Dialog, DialogClose, EmptyState, LoadingButton, NumberField, Select, StatusBadge, Switch, TextField } from '@/design-system';
import { useOp, type OpResult } from './ops';

export interface CronParts { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string }
export interface ScheduleTask { id: number; sequence: number; action: string; payload: string; offset: number; continueOnFailure: boolean }
export interface ManagedSchedule {
  id: number; name: string; cron: CronParts; active: boolean; processing: boolean; onlyWhenOnline: boolean;
  lastRun?: string; nextRun?: string; tasks: ScheduleTask[];
}
export interface ScheduleInput extends CronParts { name: string; active: boolean; onlyWhenOnline: boolean }
export interface TaskDraft { action: 'command' | 'power' | 'backup'; payload: string; offset: number; continueOnFailure: boolean }
export interface SchedulePermissions { create: boolean; update: boolean; delete: boolean }

export interface ScheduleManagerProps {
  schedules: ManagedSchedule[];
  permissions: SchedulePermissions;
  onSave: (id: number | null, input: ScheduleInput) => Promise<OpResult>;
  onDelete: (s: ManagedSchedule) => Promise<OpResult>;
  onRun: (s: ManagedSchedule) => Promise<OpResult>;
  onSaveTask: (s: ManagedSchedule, taskId: number | null, t: TaskDraft) => Promise<OpResult>;
  onDeleteTask: (s: ManagedSchedule, t: ScheduleTask) => Promise<OpResult>;
}

const CRON = /^[0-9A-Za-z*/,?#LW-]{1,64}$/;
const PRESETS: Array<{ value: string; label: string; cron?: CronParts }> = [
  { value: 'custom', label: 'Custom' },
  { value: 'hourly', label: 'Every hour', cron: { minute: '0', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
  { value: 'daily4', label: 'Every day at 04:00', cron: { minute: '0', hour: '4', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
  { value: 'weekly', label: 'Every Monday at 04:00', cron: { minute: '0', hour: '4', dayOfMonth: '*', month: '*', dayOfWeek: '1' } },
];
const ACTIONS = [{ value: 'command', label: 'Send command' }, { value: 'power', label: 'Power action' }, { value: 'backup', label: 'Create backup' }];
const POWER = [{ value: 'start', label: 'Start' }, { value: 'stop', label: 'Stop' }, { value: 'restart', label: 'Restart' }, { value: 'kill', label: 'Kill' }];
export const cronText = (c: CronParts) => `${c.minute} ${c.hour} ${c.dayOfMonth} ${c.month} ${c.dayOfWeek}`;
const taskLabel = (t: ScheduleTask) => t.action === 'command' ? `Send command: ${t.payload}` : t.action === 'power' ? `Power: ${t.payload}` : t.action === 'backup' ? `Create backup${t.payload ? ` (ignoring ${t.payload.split('\n')[0]}…)` : ''}` : `${t.action}: ${t.payload}`;

/** Panel schedules: cron timing, "only when online", and ordered tasks (command, power, backup) with delays. */
export function ScheduleManager({ schedules, permissions, onSave, onDelete, onRun, onSaveTask, onDeleteTask }: ScheduleManagerProps) {
  const op = useOp();
  const [edit, setEdit] = useState<ManagedSchedule | 'new' | null>(null);
  const [f, setF] = useState({ name: '', preset: 'daily4', ...PRESETS[2]!.cron!, active: true, onlyWhenOnline: false });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [task, setTask] = useState<{ s: ManagedSchedule; t: ScheduleTask | null } | null>(null);
  const [td, setTd] = useState<TaskDraft>({ action: 'command', payload: '', offset: 0, continueOnFailure: false });
  const [te, setTe] = useState<string>();
  const [del, setDel] = useState<ManagedSchedule | null>(null);

  const open = (s: ManagedSchedule | 'new') => {
    setEdit(s); setFe({});
    setF(s === 'new' ? { name: '', preset: 'daily4', ...PRESETS[2]!.cron!, active: true, onlyWhenOnline: false } : { name: s.name, preset: 'custom', ...s.cron, active: s.active, onlyWhenOnline: s.onlyWhenOnline });
  };
  const save = async () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e['name'] = 'Enter a name.';
    for (const k of ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const) if (!CRON.test(f[k])) e[k] = 'Not a valid cron value.';
    setFe(e); if (Object.keys(e).length) return;
    const input: ScheduleInput = { name: f.name.trim(), minute: f.minute, hour: f.hour, dayOfMonth: f.dayOfMonth, month: f.month, dayOfWeek: f.dayOfWeek, active: f.active, onlyWhenOnline: f.onlyWhenOnline };
    if (await op.run('save', () => onSave(edit === 'new' || !edit ? null : edit.id, input), 'Schedule saved.')) setEdit(null);
  };
  const openTask = (s: ManagedSchedule, t: ScheduleTask | null) => {
    setTask({ s, t }); setTe(undefined);
    setTd(t ? { action: (['command', 'power', 'backup'].includes(t.action) ? t.action : 'command') as TaskDraft['action'], payload: t.payload, offset: t.offset, continueOnFailure: t.continueOnFailure } : { action: 'command', payload: '', offset: 0, continueOnFailure: false });
  };
  const saveTask = async () => {
    if (td.action !== 'backup' && !td.payload.trim()) { setTe(td.action === 'power' ? 'Choose a power action.' : 'Enter a command.'); return; }
    if (!task) return;
    setTe(undefined);
    if (await op.run('task', () => onSaveTask(task.s, task.t?.id ?? null, td), 'Task saved.')) setTask(null);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink3">{schedules.length} {schedules.length === 1 ? 'schedule' : 'schedules'}</p>
        {permissions.create ? <Button variant="primary" leadingIcon="add-01" onClick={() => open('new')}>New schedule</Button> : null}
      </div>
      {op.feedback}
      {schedules.length === 0 ? <Card pad="lg"><EmptyState icon="clock-01" title="No schedules" description={permissions.create ? 'Run restarts, backups or commands on a timer.' : 'No schedules are set up for this server.'} /></Card> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4">{schedules.map((s) => (
          <li key={s.id}>
            <Card pad="lg" className="grid gap-4">
              <CardHeader title={s.name} description={<><code className="font-mono">{cronText(s.cron)}</code>{s.nextRun ? ` · next ${s.nextRun}` : ''}{s.lastRun ? ` · last ${s.lastRun}` : ''}</>}
                actions={<div className="flex items-center gap-2">
                  {s.processing ? <StatusBadge tone="warn" live>Running</StatusBadge> : <StatusBadge tone={s.active ? 'good' : 'neutral'}>{s.active ? 'Active' : 'Paused'}</StatusBadge>}
                  {s.onlyWhenOnline ? <StatusBadge tone="neutral" dot={false}>Only when online</StatusBadge> : null}
                  {permissions.update || permissions.delete ? <ActionMenu label={`Actions for ${s.name}`} entries={[
                    ...(permissions.update ? [{ id: 'run', label: 'Run now', disabled: s.processing, disabledReason: 'Already running', onSelect: () => void op.run('run', () => onRun(s), `${s.name} started.`) }, { id: 'e', label: 'Edit schedule', onSelect: () => open(s) }] : []),
                    ...(permissions.delete ? [{ kind: 'separator' as const, id: 's' }, { id: 'd', label: 'Delete', tone: 'danger' as const, onSelect: () => setDel(s) }] : []),
                  ]} /> : null}
                </div>} />
              {s.tasks.length === 0 ? <p className="text-[14px] text-ink3">No tasks yet. A schedule without tasks does nothing when it runs.</p> : (
                <ol className="grid gap-2">{[...s.tasks].sort((a, b) => a.sequence - b.sequence).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-md bg-s2 px-3 py-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-bg text-[12px] font-extrabold text-accent" aria-hidden>{t.sequence}</span>
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{taskLabel(t)}</p><p className="text-[12.5px] text-ink3">{t.offset ? `after ${t.offset}s` : 'immediately'}{t.continueOnFailure ? ' · continues if this fails' : ''}</p></div>
                    {permissions.update ? <><Button size="sm" variant="secondary" onClick={() => openTask(s, t)}>Edit<span className="sr-only"> task {t.sequence} of {s.name}</span></Button>
                      <Button size="sm" variant="danger-subtle" onClick={() => void op.run('deltask', () => onDeleteTask(s, t), 'Task removed.')}>Remove<span className="sr-only"> task {t.sequence} of {s.name}</span></Button></> : null}
                  </li>))}</ol>
              )}
              {permissions.update ? <div><Button size="sm" variant="secondary" leadingIcon="add-01" onClick={() => openTask(s, null)}>Add task<span className="sr-only"> to {s.name}</span></Button></div> : null}
            </Card>
          </li>))}</ul>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'New schedule' : 'Edit schedule'} description="Times use the server's time zone (UTC on most nodes)."
        footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" onClick={save}>Save schedule</LoadingButton></>}>
        <div className="grid gap-4">
          <TextField label="Name" value={f.name} error={fe['name']} maxLength={191} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Select label="When" options={PRESETS.map((p) => ({ value: p.value, label: p.label }))} value={f.preset} onValueChange={(v) => { const p = PRESETS.find((x) => x.value === v); if (p) setF({ ...f, preset: p.value, ...(p.cron ?? {}) }); }} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([['minute', 'Minute'], ['hour', 'Hour'], ['dayOfMonth', 'Day of month'], ['month', 'Month'], ['dayOfWeek', 'Day of week']] as const).map(([k, l]) => (
              <TextField key={k} label={l} value={f[k]} error={fe[k]} className="font-mono" onChange={(e) => setF({ ...f, preset: 'custom', [k]: e.target.value })} />))}
          </div>
          <Switch label="Active" description="Paused schedules keep their tasks but never run." checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
          <Switch label="Only when the server is online" description="Skip runs while the server is stopped." checked={f.onlyWhenOnline} onCheckedChange={(v) => setF({ ...f, onlyWhenOnline: v })} />
        </div>
      </Dialog>

      <Dialog open={!!task} onOpenChange={(o) => !o && setTask(null)} title={task?.t ? 'Edit task' : 'Add task'} description={task ? task.s.name : undefined}
        footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" onClick={saveTask}>Save task</LoadingButton></>}>
        <div className="grid gap-4">
          <Select label="Action" options={ACTIONS} value={td.action} onValueChange={(v) => v && setTd({ ...td, action: v as TaskDraft['action'], payload: v === 'power' ? 'restart' : '' })} />
          {td.action === 'power'
            ? <Select label="Power action" options={POWER} value={td.payload || null} error={te} onValueChange={(v) => v && setTd({ ...td, payload: v })} />
            : <TextField label={td.action === 'backup' ? 'Ignored files (optional)' : 'Command'} value={td.payload} error={te} maxLength={td.action === 'backup' ? 4096 : 1000} onChange={(e) => setTd({ ...td, payload: e.target.value })} />}
          <NumberField label="Delay" description="Seconds to wait before this task, up to 900." unit="s" min={0} max={900} value={td.offset} onValueChange={(v) => setTd({ ...td, offset: v ?? 0 })} />
          <Switch label="Continue if this task fails" checked={td.continueOnFailure} onCheckedChange={(v) => setTd({ ...td, continueOnFailure: v })} />
        </div>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={del ? `Delete ${del.name}?` : 'Delete'} description="The schedule and all of its tasks are removed."
        footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="danger" onClick={async () => { const s = del; if (!s) return; if (await op.run('delete', () => onDelete(s), `${s.name} deleted.`)) setDel(null); }}>Delete schedule</LoadingButton></>}><span /></Dialog>
    </div>
  );
}
