import { Button, Card, EmptyState } from '@/design-system';
import { KnowledgeBaseSearch } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApiQuery } from '../data/DataProvider';
import { useNavigate } from '../router';
import { PageHeader } from '../components/PageHeader';
import { CapabilityNote } from '../components/CapabilityNote';
import { date } from '../format';
import { MarkdownArticle } from '../components/MarkdownArticle';

export default function Knowledge({ id }: { id?: string }) {
  const nav = useNavigate();
  const res = useApiQuery((a) => a.kb());
  if (id && res.status === 'ready') {
    const a = res.data.find((x) => x.id === id);
    return (
      <div className="grid max-w-3xl gap-5">
        <PageHeader title={a?.title ?? 'Article not found'} crumbs={[{ label: 'Knowledge base', to: '/app/knowledge' }, { label: a?.title ?? 'Not found' }]} />
        {a ? <Card pad="lg" className="grid gap-5"><p className="text-[13px] text-ink3">{a.category} · updated {date(a.updatedOn)}</p><MarkdownArticle source={a.body.join('\n\n')} /><div><Button variant="secondary" onClick={() => nav('/app/support/new')}>Still stuck? Open a ticket</Button></div></Card> : <EmptyState icon="book-01" title="This article does not exist" action={<Button variant="secondary" onClick={() => nav('/app/knowledge')}>Back to the knowledge base</Button>} />}
      </div>
    );
  }
  return (
    <div className="grid max-w-4xl gap-5">
      <PageHeader title="Knowledge base" description="Guides for your servers, billing and account." />
      <CapabilityNote area="knowledge" />
      <ResourceView res={res} reload={res.reload} label="Loading articles">
        {(list) => <KnowledgeBaseSearch articles={list.map((a) => ({ id: a.id, category: a.category, title: a.title, summary: a.summary, tags: a.tags, popular: a.popular, searchText: a.body.join(' ') }))} onOpen={(a) => nav(`/app/knowledge/${a.id}`)} onNoResults={<Button variant="primary" onClick={() => nav('/app/support/new')}>Open a ticket</Button>} />}
      </ResourceView>
    </div>
  );
}
