import { useMemo, useState } from 'react';
import { Button, Card, EmptyState, Icon, SearchField, SegmentedControl, StatusBadge, type IconName } from '@/design-system';

export type AnnouncementKind = 'maintenance' | 'incident' | 'news' | 'resolved';
export interface AnnouncementItem { id: string; kind: AnnouncementKind; title: string; body: string; /** Already formatted time. */ time: string; affects?: string[]; read: boolean }
const KIND: Record<AnnouncementKind, { label: string; tone: 'warn' | 'bad' | 'info' | 'good'; icon: IconName }> = {
  maintenance: { label: 'Maintenance', tone: 'warn', icon: 'wrench-01' }, incident: { label: 'Incident', tone: 'bad', icon: 'alert-circle' }, news: { label: 'News', tone: 'info', icon: 'notification-01' }, resolved: { label: 'Resolved', tone: 'good', icon: 'checkmark-circle-02' },
};
type Filter = 'all' | 'unread' | 'maintenance' | 'incident';

/** Announcements newest first with a filter. Unread items carry a New badge and a Mark as read action. */
export function AnnouncementFeed({ items, onMarkRead }: { items: AnnouncementItem[]; onMarkRead: (item: AnnouncementItem) => void | Promise<void> }) {
  const [filter, setFilter] = useState<Filter>('all');
  const list = items.filter((a) => filter === 'all' || (filter === 'unread' ? !a.read : a.kind === filter));
  return (
    <div className="grid gap-4">
      <SegmentedControl<Filter> aria-label="Announcement filter" value={filter} onValueChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'incident', label: 'Incidents' }]} />
      {list.length === 0 ? <Card pad="lg"><EmptyState icon="notification-01" title="Nothing here" description="No announcements match this filter." /></Card> : (
        <ul className="grid gap-3" aria-label="Announcements">
          {list.map((a) => { const k = KIND[a.kind]; return (
            <li key={a.id}><Card pad="lg" className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2"><Icon name={k.icon} size={20} /><StatusBadge tone={k.tone}>{k.label}</StatusBadge>{!a.read ? <StatusBadge tone="accent" dot={false}>New</StatusBadge> : null}<span className="text-[13px] text-ink3">{a.time}</span></div>
              <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">{a.title}</h2>
              <p className="text-ink2">{a.body}</p>
              {a.affects?.length ? <p className="text-[13.5px] text-ink3">Affects: {a.affects.join(', ')}</p> : null}
              {!a.read ? <div><Button size="sm" variant="secondary" onClick={() => void onMarkRead(a)}>Mark as read</Button></div> : null}
            </Card></li>); })}
        </ul>
      )}
    </div>
  );
}

export interface KnowledgeArticle { id: string; category: string; title: string; summary: string; tags: string[]; popular?: boolean; /** Searched too, so a query can match text inside an article. */ searchText?: string }
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Search plus category filter over articles. Matching ignores case and accents and covers title, summary, tags and body text. */
export function KnowledgeBaseSearch({ articles, onOpen, onNoResults }: { articles: KnowledgeArticle[]; onOpen: (a: KnowledgeArticle) => void; onNoResults?: React.ReactNode }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState('All');
  const cats = useMemo(() => ['All', ...new Set(articles.map((a) => a.category))], [articles]);
  const hits = useMemo(() => { const n = norm(q.trim()); return articles.filter((a) => (cat === 'All' || a.category === cat) && (!n || norm(`${a.title} ${a.summary} ${a.tags.join(' ')} ${a.searchText ?? ''}`).includes(n))); }, [articles, q, cat]);
  return (
    <div className="grid gap-4">
      <SearchField label="Search articles" placeholder="Search guides, for example “plugins”" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">{cats.map((c) => <Button key={c} size="sm" variant={c === cat ? 'primary' : 'secondary'} aria-pressed={c === cat} onClick={() => setCat(c)}>{c}</Button>)}</div>
      {hits.length === 0 ? <Card pad="lg"><EmptyState icon="search-01" title="No articles match" description="Try a shorter search, or open a ticket and we will help." action={onNoResults} /></Card> : (
        <ul className="grid gap-3" aria-live="polite" aria-label={`${hits.length} articles`}>
          {hits.map((a) => <li key={a.id}><button type="button" onClick={() => onOpen(a)} className="grid w-full gap-1 rounded-xl bg-s1 p-5 text-left hover:bg-s2"><span className="flex flex-wrap items-center gap-2"><span className="text-[17px] font-extrabold tracking-[-0.03em]">{a.title}</span>{a.popular ? <StatusBadge tone="accent" dot={false}>Popular</StatusBadge> : null}</span><span className="text-ink2">{a.summary}</span><span className="text-[13px] text-ink3">{a.category}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}
