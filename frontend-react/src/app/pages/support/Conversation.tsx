import { Notice } from '@/design-system';
import { TicketConversation } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { Link } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { dateTime } from '../../format';
import { toUiState } from './Inbox';

export default function Conversation({ id }: { id: string }) {
  const api = useApi();
  const res = useApiQuery((a) => a.getTicket(id), [id]);
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title="Ticket" crumbs={[{ label: 'Support', to: '/app/support' }, { label: 'Ticket' }]} />
      <CapabilityNote area="support" />
      <ResourceView res={res} reload={res.reload} label="Loading ticket">
        {(t) => (
          <>
            {t.serviceId ? <Notice tone="info">Related service: <Link to={`/app/services/${t.serviceId}`} className="font-bold underline">{t.serviceName}</Link></Notice> : null}
            <TicketConversation
              subject={`${t.number} · ${t.subject}`} state={toUiState(t.state)}
              messages={t.messages.map((m) => ({ id: m.id, author: m.author, fromStaff: m.fromStaff, time: dateTime(m.at), body: m.body, attachments: m.attachments?.map((a) => ({ name: a.name })) }))}
              onReply={(body, files) => api.replyTicket(t.id, body, files)} onClose={() => api.closeTicket(t.id)}
            />
          </>
        )}
      </ResourceView>
    </div>
  );
}
