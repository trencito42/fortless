import { NotificationPreferences, type NotificationMatrix } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';

const TOPICS = [
  { id: 'service', label: 'Server status', description: 'A server crashed, was suspended, or finished installing.' },
  { id: 'billing', label: 'Invoices and payments', description: 'New invoices, failed payments and receipts.' },
  { id: 'support', label: 'Support replies', description: 'The team answered one of your tickets.' },
];

export default function Notifications() {
  const api = useApi();
  const res = useApiQuery((a) => a.notificationPrefs());
  return (
    <div className="grid max-w-4xl gap-5">
      <PageHeader title="Notifications" description="Pick where each kind of message reaches you." crumbs={[{ label: 'Account', to: '/app/account' }, { label: 'Notifications' }]} />
      <CapabilityNote area="notifications" />
      <ResourceView res={res} reload={res.reload} label="Loading preferences">
        {(p) => <NotificationPreferences topics={TOPICS} value={p.topics as NotificationMatrix} channels={{ email: { label: 'Email', connected: true }, discord: { label: 'Discord', connected: p.channels.discord, hint: 'Connect Discord first' }, push: { label: 'Browser push', connected: p.channels.push } }} onSave={(m) => api.saveNotificationPrefs({ ...p, topics: m })} />}
      </ResourceView>
    </div>
  );
}
