import { Badge, Button, Notice, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { PreviewNote } from '../../components/PreviewNote';
import { col } from '../../components/cols';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { iso, relative } from '../../lib/format';
import type { MarketingBlock } from '../../types';

export default function MarketingPages() {
  const { data, patch, audit } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('content:manage');
  const pages = [...new Set(data.marketingBlocks.map((b) => b.page))];
  const edit = (b: MarketingBlock) => act.run({ title: `Edit “${b.label}”`, description: `${b.page} page · key ${b.key}. Text only: layout is code.`, confirmLabel: 'Publish change', permission: 'content:manage', stepUp: false, reasonRequired: false, initial: { v: b.value },
    validate: (v) => ({ ...(v['v']!.trim() === '' ? { v: 'This field cannot be empty.' } : v['v']!.length > b.maxLength ? { v: `Maximum ${b.maxLength} characters (now ${v['v']!.length}).` } : b.kind === 'link' && !/^(\/[a-z0-9\-/_]*|https:\/\/[^\s]+)$/i.test(v['v']!) ? { v: 'Use a path like /register or an https:// link.' } : /<\/?[a-z][^>]*>/i.test(v['v']!) ? { v: 'HTML is not allowed; write plain text.' } : {}) }),
    fields: ({ values, set, errors }) => (b.kind === 'longtext' ? <Textarea label="Text" value={values['v']} onChange={(e) => set('v', e.target.value)} rows={4} maxLength={b.maxLength + 40} counter error={errors['v']} /> : <TextField label={b.kind === 'link' ? 'Link' : 'Text'} value={values['v']} onChange={(e) => set('v', e.target.value)} error={errors['v']} description={`${values['v']?.length ?? 0}/${b.maxLength}`} />),
    onConfirm: ({ values }) => { patch('marketingBlocks', b.id, { value: values['v']!.trim(), updatedAt: iso(0) }); audit('content.page_text_changed', { type: 'page_block', id: b.key, label: b.label }, { before: { value: b.value.slice(0, 40) }, after: { value: values['v']!.trim().slice(0, 40) } }); return 'Text updated'; } });
  return (
    <AdminPage title="Marketing pages" description="Editable text and links of the public pages. This is a content editor, not a website builder: sections, layout and components are defined in code.">
      <Notice tone="info" title="What can be edited here">Short text, taglines, button labels and link targets. HTML, scripts and images are not accepted.</Notice>
      {pages.map((p) => (
        <Section key={p} title={p} description="Fields on this page">
          <RelatedTable rows={data.marketingBlocks.filter((b) => b.page === p)} getRowId={(b) => b.id} caption={`${p} page fields`} pageSize={10} columns={[
            col<MarketingBlock>('l', 'Field', (b) => <span className="grid"><b>{b.label}</b><span className="font-mono text-[12px] text-ink3">{b.key}</span></span>, { primary: true }),
            col<MarketingBlock>('v', 'Current text', (b) => <span className="block max-w-[34rem] [overflow-wrap:anywhere]">{b.value}</span>),
            col<MarketingBlock>('k', 'Type', (b) => <Badge>{b.kind}</Badge>, { hideOnMobile: true }),
            col<MarketingBlock>('u', 'Updated', (b) => relative(b.updatedAt), { sort: (b) => b.updatedAt, hideOnMobile: true }),
            col<MarketingBlock>('a', 'Edit', (b) => <Button size="sm" variant="secondary" disabled={!m} onClick={() => edit(b)}>Edit…</Button>),
          ]} />
        </Section>
      ))}
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
