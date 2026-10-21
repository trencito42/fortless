import { useMemo, useState } from 'react';
import { Button, Icon, IconButton, Popover, StatusBadge, type IconName } from '@/design-system';
import { useAdmin } from '../store';
import { useNav } from '../router';
import { relative } from '../lib/format';

interface N { id: string; icon: IconName; tone: 'bad' | 'warn' | 'info'; title: string; at: string; to: string }

/** Bell with unread count. Items are derived from live demo data: critical actions, pending approvals, open incidents. */
export function AdminNotifications() {
  const { data } = useAdmin();
  const nav = useNav();
  const [read, setRead] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const items = useMemo<N[]>(() => [
    ...data.actions.filter((a) => a.status === 'open' && a.priority === 'critical').map((a): N => ({ id: a.id, icon: 'flash', tone: 'bad', title: a.title, at: a.createdAt, to: `/actions/${a.id}` })),
    ...data.approvals.filter((a) => a.status === 'pending').map((a): N => ({ id: a.id, icon: 'shield-user', tone: 'warn', title: `Approval needed: ${a.summary}`, at: a.requestedAt, to: '/staff/approvals' })),
    ...data.incidents.filter((i) => i.status !== 'resolved').map((i): N => ({ id: i.id, icon: 'alert-01', tone: 'warn', title: `Incident: ${i.title}`, at: i.startedAt, to: `/monitoring/incidents/${i.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12), [data.actions, data.approvals, data.incidents]);
  const unread = items.filter((i) => !read.has(i.id)).length;
  return (
    <Popover open={open} onOpenChange={setOpen} align="end" title="Notifications" className="w-[min(420px,calc(100vw-16px))]" trigger={
      <button type="button" aria-label={`Notifications, ${unread} unread`} className="relative inline-grid size-ctl-md place-items-center rounded-full bg-s3 text-ink hover:bg-s4 focus-visible:outline-2 focus-visible:outline-accent">
        <Icon name="notification-01" size={20} />
        {unread > 0 ? <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10.5px] font-extrabold text-on-bad">{unread}</span> : null}
      </button>
    }>
      <div className="grid gap-2">
        <div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-ink3">{unread} unread</span><Button size="sm" variant="ghost" onClick={() => setRead(new Set(items.map((i) => i.id)))} disabled={unread === 0}>Mark all read</Button></div>
        {items.length === 0 ? <p className="py-6 text-center text-ink3">Nothing needs attention.</p> : (
          <ul className="grid gap-1" aria-label="Notifications">
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => { setRead((r) => new Set(r).add(n.id)); setOpen(false); nav(n.to); }} className="flex w-full items-start gap-3 rounded-md p-2.5 text-left hover:bg-s2 focus-visible:outline-2 focus-visible:outline-accent">
                  <Icon name={n.icon} size={18} className={n.tone === 'bad' ? 'mt-0.5 text-bad' : 'mt-0.5 text-warn'} />
                  <span className="grid min-w-0 flex-1 gap-0.5"><span className={read.has(n.id) ? 'font-semibold text-ink2' : 'font-bold'}>{n.title}</span><span className="text-[12.5px] font-semibold text-ink3">{relative(n.at)}</span></span>
                  {!read.has(n.id) ? <StatusBadge tone={n.tone} dot={false}>New</StatusBadge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pt-1"><IconButton label="Close notifications" icon="cancel-01" size="sm" variant="ghost" className="sr-only" onClick={() => setOpen(false)} /></div>
      </div>
    </Popover>
  );
}
