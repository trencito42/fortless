import { Button, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { Status, contentStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { ADMIN_NOW, DAY, relative } from '../../lib/format';

export default function ContentOverview() {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const stale = data.kbArticles.filter((a) => a.status === 'published' && Date.parse(a.updatedAt) < ADMIN_NOW - 60 * DAY);
  const drafts = data.legalDocs.filter((d) => d.draft);
  const recent = [...data.kbArticles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  return (
    <AdminPage title="Content & website" description="Help articles, announcements, the editable text of marketing pages and legal documents. This is a content system: layout and components stay in code." actions={<><Button variant="primary" leadingIcon="add-01" disabled={!can('content:manage')} onClick={() => nav('/content/knowledge/new')}>New article</Button><Button variant="secondary" disabled={!can('content:manage')} onClick={() => nav('/content/announcements?new=1')}>New announcement</Button></>}>
      {drafts.length ? <Notice tone="warn" title={`${drafts.length} legal draft${drafts.length > 1 ? 's' : ''} waiting`} action={<Button size="sm" variant="secondary" onClick={() => nav('/content/legal')}>Review</Button>}>{drafts.map((d) => d.title).join(', ')}</Notice> : null}
      <KpiGrid cols={4} items={[
        { label: 'Published articles', value: data.kbArticles.filter((a) => a.status === 'published').length, icon: 'book-01', hint: `${data.kbArticles.filter((a) => a.status === 'draft').length} drafts`, to: '/content/knowledge' },
        { label: 'Live announcements', value: data.announcements.filter((a) => a.status === 'published').length, icon: 'notification-01', hint: `${data.announcements.filter((a) => a.status === 'scheduled').length} scheduled`, to: '/content/announcements' },
        { label: 'Marketing text fields', value: data.marketingBlocks.length, icon: 'edit-02', to: '/content/pages' },
        { label: 'Legal documents', value: data.legalDocs.length, icon: 'file-01', hint: '4 kinds × 2 languages', to: '/content/legal' },
      ]} />
      <Columns>
        <Section title="Recently edited articles"><ul className="grid gap-2">{recent.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><span className="grid"><EntityLink to={`/content/knowledge/${a.id}`}>{a.title}</EntityLink><span className="text-[12.5px] text-ink3">{a.author} · {relative(a.updatedAt)}</span></span><Status map={contentStatus} value={a.status} /></li>)}</ul></Section>
        <Section title="Needs a look"><ul className="grid gap-2">{stale.slice(0, 5).map((a) => <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><EntityLink to={`/content/knowledge/${a.id}`}>{a.title}</EntityLink><span className="text-[12.5px] font-semibold text-warn">not updated for {Math.round((ADMIN_NOW - Date.parse(a.updatedAt)) / DAY)} d</span></li>)}{!stale.length ? <li className="text-ink3">Nothing stale.</li> : null}</ul></Section>
      </Columns>
    </AdminPage>
  );
}
