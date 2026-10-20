import { useEffect, useState } from 'react';
import { Avatar, Button, Card, CardHeader, Notice, Select, StatusBadge, TextField } from '@/design-system';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import type { Profile } from '../../domain/types';

function Form({ initial }: { initial: Profile }) {
  const api = useApi();
  const [p, setP] = useState(initial); const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string }>();
  useEffect(() => setP(initial), [initial]);
  const save = async () => {
    const er: Record<string, string> = {};
    if (!p.fullName.trim()) er.fullName = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) er.email = 'Enter a valid email address.';
    if (p.phone && !/^\+?[0-9 ()-]{7,20}$/.test(p.phone)) er.phone = 'Use digits, spaces and an optional +.';
    setErrors(er); if (Object.keys(er).length) return;
    setBusy(true); setNote(undefined);
    try { await api.saveProfile(p); setNote({ tone: 'good', text: p.email !== initial.email ? 'Saved. We sent a confirmation link to your new email address.' : 'Profile saved.' }); } catch (e) { setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' }); } finally { setBusy(false); }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid max-w-3xl gap-5">
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card pad="lg" className="grid gap-4">
        <CardHeader title="Personal details" actions={<Avatar initials={p.avatarInitials} size="lg" />} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" autoComplete="name" value={p.fullName} onChange={(e) => setP({ ...p, fullName: e.target.value })} error={errors.fullName} />
          <TextField label="Phone (optional)" type="tel" autoComplete="tel" value={p.phone ?? ''} onChange={(e) => setP({ ...p, phone: e.target.value })} error={errors.phone} />
          <div className="grid gap-1.5 sm:col-span-2"><TextField label="Email" type="email" autoComplete="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} error={errors.email} suffix={<StatusBadge tone={p.emailVerified && p.email === initial.email ? 'good' : 'warn'}>{p.emailVerified && p.email === initial.email ? 'Verified' : 'Unverified'}</StatusBadge>} /></div>
          <Select label="Language" value={p.language} onValueChange={(v) => setP({ ...p, language: v ?? p.language })} options={['English', 'Română', 'Deutsch'].map((x) => ({ value: x, label: x }))} />
          <Select label="Time zone" value={p.timezone} onValueChange={(v) => setP({ ...p, timezone: v ?? p.timezone })} options={['Europe/Bucharest', 'Europe/Berlin', 'Europe/London', 'America/New_York'].map((x) => ({ value: x, label: x }))} />
        </div>
      </Card>
      <div><Button type="submit" variant="primary" loading={busy}>Save profile</Button></div>
    </form>
  );
}

export default function ProfilePage() {
  const res = useApiQuery((a) => a.profile());
  return (
    <div className="grid gap-5">
      <PageHeader title="Account" description="Your details and preferences." />
      <CapabilityNote area="account" />
      <ResourceView res={res} reload={res.reload} label="Loading profile">{(p) => <Form initial={p} />}</ResourceView>
    </div>
  );
}
