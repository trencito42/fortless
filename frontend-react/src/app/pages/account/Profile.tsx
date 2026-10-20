import { useEffect, useState } from 'react';
import { Avatar, Button, Card, CardHeader, Notice, StatusBadge, TextField } from '@/design-system';
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
    setErrors(er); if (Object.keys(er).length) return;
    setBusy(true); setNote(undefined);
    try { await api.saveProfile({ fullName: p.fullName }); setNote({ tone: 'good', text: 'Profile saved.' }); } catch (e) { setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' }); } finally { setBusy(false); }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid max-w-3xl gap-5">
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card pad="lg" className="grid gap-4">
        <CardHeader title="Personal details" actions={<Avatar initials={p.avatarInitials} size="lg" />} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" autoComplete="name" value={p.fullName} onChange={(e) => setP({ ...p, fullName: e.target.value })} error={errors.fullName} />
          <TextField label="Phone" value={p.phone ?? 'Not provided'} readOnly description="Phone changes are not exposed by the backend." />
          <div className="grid gap-1.5 sm:col-span-2"><TextField label="Email" type="email" autoComplete="email" value={p.email} readOnly description="Email changes are not exposed by the backend." suffix={<StatusBadge tone={p.emailVerified ? 'good' : 'warn'}>{p.emailVerified ? 'Verified' : 'Unverified'}</StatusBadge>} /></div>
          <TextField label="Language" value={p.language} readOnly description="Derived from the current account session." />
          <TextField label="Time zone" value={p.timezone} readOnly description="Derived from this browser." />
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
