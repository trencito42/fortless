import { useMemo } from 'react';
import { Button } from '@/design-system';
import { AnnouncementFeed } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../data/DataProvider';
import { PageHeader } from '../components/PageHeader';
import { CapabilityNote } from '../components/CapabilityNote';
import { dateTime } from '../format';

export default function Announcements() {
  const api = useApi();
  const res = useApiQuery((a) => a.announcements());
  const hasUnread = useMemo(() => res.status === 'ready' && res.data.some((a) => !a.read), [res]);
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader
        title="Announcements"
        description="Maintenance windows, incidents and product news that affect your services."
        actions={hasUnread ? <Button variant="secondary" onClick={() => void api.markAllAnnouncementsRead()}>Mark all as read</Button> : undefined}
      />
      <CapabilityNote area="announcements" />
      <ResourceView res={res} reload={res.reload} label="Loading announcements">
        {(list) => <AnnouncementFeed items={[...list].sort((a, b) => b.at.localeCompare(a.at)).map((a) => ({ id: a.id, kind: a.kind, title: a.title, body: a.body, time: dateTime(a.at), affects: a.affects, read: a.read }))} onMarkRead={(a) => api.markAnnouncementRead(a.id)} />}
      </ResourceView>
    </div>
  );
}
