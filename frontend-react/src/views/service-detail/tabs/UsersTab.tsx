import { MemberManager } from '@/features';
import { useService } from '../context';
import { mapMembers } from '../mappers';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';

/** Owner-only service sharing. The backend answers 403 to anyone else; the tab is also hidden for them (access.ts). */
export function UsersTab() {
  const { id, ports } = useService();
  const res = useResource((s) => ports.members.list(id, s), [id, ports]);
  return (
    <ResourceView res={res} reload={res.reload} label="Loading people">
      {(m) => {
        const v = mapMembers(m);
        return <MemberManager members={v.members} invitations={v.invitations}
          onInvite={async (email, preset) => { await ports.members.invite(id, email, preset); res.refresh(); }}
          onRevoke={async (i) => { await ports.members.revoke(id, i.id); res.refresh(); }}
          onRemove={async (mem) => { await ports.members.remove(id, mem.id); res.refresh(); }}
          onSetPreset={async (mem, p) => { await ports.members.setPreset(id, mem.id, p); res.refresh(); }} />;
      }}
    </ResourceView>
  );
}
