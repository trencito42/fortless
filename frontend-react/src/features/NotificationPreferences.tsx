import { useState } from 'react';
import { Button, Card, CardHeader, Notice, Switch } from '@/design-system';

export type NotificationChannel = 'email' | 'discord' | 'push';
export interface NotificationTopic { id: string; label: string; description: string; /** Channels this topic must always use, for example security alerts by email. */ locked?: NotificationChannel[] }
export type NotificationMatrix = Record<string, Record<NotificationChannel, boolean>>;
export interface NotificationPreferencesProps {
  topics: NotificationTopic[];
  value: NotificationMatrix;
  /** Channels that are connected. A channel that is not connected cannot be switched on and says why. */
  channels: Record<NotificationChannel, { label: string; connected: boolean; hint?: string }>;
  onSave: (value: NotificationMatrix) => Promise<void>;
}

/** Topic by channel matrix. Edits stay local until Save, locked cells explain themselves, and unconnected channels are switched off with a hint. */
export function NotificationPreferences({ topics, value, channels, onSave }: NotificationPreferencesProps) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string }>();
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const cols = Object.keys(channels) as NotificationChannel[];
  const set = (t: string, c: NotificationChannel, on: boolean) => setDraft((d) => ({ ...d, [t]: { ...d[t]!, [c]: on } }));
  const save = async () => { setBusy(true); setNote(undefined); try { await onSave(draft); setNote({ tone: 'good', text: 'Notification settings saved.' }); } catch (e) { setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' }); } finally { setBusy(false); } };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="What we tell you, and where" description="Choose a channel for each kind of message." actions={<><Button variant="ghost" disabled={!dirty || busy} onClick={() => setDraft(value)}>Reset</Button><Button variant="primary" disabled={!dirty} loading={busy} onClick={() => void save()}>Save</Button></>} />
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <ul className="grid divide-y divide-ink/10" aria-label="Notification topics">
        {topics.map((t) => (
          <li key={t.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6">
            <div><p className="font-bold">{t.label}</p><p className="text-[13.5px] text-ink3">{t.description}</p></div>
            <div className="flex flex-wrap gap-x-5">
              {cols.map((c) => {
                const ch = channels[c]; const locked = t.locked?.includes(c);
                return <Switch key={c} label={ch.label} description={!ch.connected ? ch.hint ?? 'Not connected' : locked ? 'Always on' : undefined} checked={locked ? true : !!draft[t.id]?.[c] && ch.connected} disabled={!ch.connected || locked} onCheckedChange={(on) => set(t.id, c, on)} />;
              })}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
