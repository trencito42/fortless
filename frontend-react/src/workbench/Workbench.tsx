import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, IconButton, SegmentedControl, StatusBadge, TooltipProvider, useTheme, SearchField, Select } from '@/design-system';
import { STORIES } from './stories';
import { StoryPage } from './StoryPage';
import { StoryDocs, statusTone } from './Docs';
import { TokensPage } from './TokensPage';
import type { Category } from './types';
import verification from '../../docs/verification.json';

const WIDTHS = [0, 320, 375, 390, 430, 768, 1024, 1440, 1920] as const;
const verifiedIds = new Set<string>((verification as { verified: string[] }).verified);

function useHash() {
  const [h, setH] = useState(() => location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const on = () => setH(location.hash.replace(/^#\/?/, ''));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return h;
}

/** Embedded mode: renders a single story at full viewport inside the workbench iframe (so media queries are real) and follows theme messages. */
function Embed({ id }: { id: string }) {
  const { setPreference, setDensity } = useTheme();
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'fl-theme') return;
      setPreference(e.data.theme);
      setDensity(e.data.density);
    };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, [setPreference, setDensity]);
  const story = STORIES.find((s) => s.id === id);
  if (!story) return <p className="p-6">Unknown story: {id}</p>;
  return <TooltipProvider><StoryPage story={story} scenario={Number(new URLSearchParams(location.search).get('scenario') ?? 0)} /></TooltipProvider>;
}

export function Workbench() {
  const hash = useHash();
  const params = new URLSearchParams(location.search);
  const embedId = params.get('embed');
  const t = useTheme();
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>(0);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'canvas' | 'docs'>('canvas');
  const [nav, setNav] = useState(false);
  const [scn, setScn] = useState(0);

  const initial = params.get('theme');
  useEffect(() => {
    if (embedId && (initial === 'light' || initial === 'dark')) t.setPreference(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [, kind, sid] = /^(story|tokens|registry)\/?(.*)$/.exec(hash) ?? [];
  useEffect(() => setScn(0), [sid]);
  const story = kind === 'story' ? STORIES.find((s) => s.id === sid) : undefined;

  const groups = useMemo(() => {
    const m = new Map<Category, typeof STORIES>();
    for (const s of STORIES) {
      if (q && !`${s.title} ${s.category}`.toLowerCase().includes(q.toLowerCase())) continue;
      m.set(s.category, [...(m.get(s.category) ?? []), s]);
    }
    return Array.from(m);
  }, [q]);

  if (embedId) return <Embed id={embedId} />;

  const bleedStory = !!story?.scenarios.some((x) => x.fullBleed);
  const frame = story ? `?embed=${story.id}&theme=${t.resolved}${bleedStory ? `&scenario=${scn}` : ''}` : '';
  const send = (el: HTMLIFrameElement | null) => el?.contentWindow?.postMessage({ type: 'fl-theme', theme: t.preference, density: t.density }, location.origin);

  const list = (
    <nav aria-label="Components" className="grid gap-1 pb-6">
      <a href="#/" className={cn('flex h-10 items-center rounded-md px-3 font-bold', !hash ? 'bg-s1' : 'hover:bg-s3')}>Overview</a>
      <a href="#/tokens" className={cn('flex h-10 items-center rounded-md px-3 font-bold', kind === 'tokens' ? 'bg-s1' : 'hover:bg-s3')}>Design tokens</a>
      <a href="#/registry" className={cn('flex h-10 items-center rounded-md px-3 font-bold', kind === 'registry' ? 'bg-s1' : 'hover:bg-s3')}>Component registry</a>
      <a href="/app" className="flex h-10 items-center gap-2 rounded-md bg-accent-soft px-3 font-bold text-accent-ink hover:bg-accent-bg">Customer app preview <span aria-hidden="true">↗</span></a>
      {groups.map(([cat, items]) => (
        <div key={cat} className="grid gap-0.5">
          <p className="px-3 pt-4 pb-1 text-[12px] font-bold text-ink3">{cat}</p>
          {items.map((s) => (
            <a key={s.id} href={`#/story/${s.id}`} onClick={() => setNav(false)} aria-current={s.id === sid ? 'page' : undefined} className={cn('flex min-h-10 items-center gap-2 rounded-md px-3 text-[14px] font-semibold text-ink2 hover:bg-s3 hover:text-ink aria-[current=page]:bg-s1 aria-[current=page]:text-ink')}>
              <span className="flex-1">{s.title}</span>
              <span aria-hidden="true" className={cn('size-2 rounded-full', s.status === 'implemented' ? 'bg-good' : s.status === 'partial' ? 'bg-warn' : 'bg-ink3')} />
              <span className="sr-only">{s.status}</span>
            </a>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <TooltipProvider>
      <div className="grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="hidden max-h-dvh overflow-auto p-3 lg:sticky lg:top-0 lg:block">
          <div className="mb-3 flex items-center gap-2 px-3 py-2 text-[20px] font-extrabold tracking-[-0.055em]">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="6.5" rx="3.25" fill="var(--accent)" /><rect x="3" y="13" width="26" height="6.5" rx="3.25" fill="var(--accent)" opacity=".62" /><rect x="3" y="21" width="17" height="6.5" rx="3.25" fill="var(--accent)" opacity=".32" /></svg>
            fortless <span className="text-ink3">ui</span>
          </div>
          <SearchField value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Find a component" className="mb-3" />
          {list}
        </aside>
        <header className="flex items-center gap-2 p-3 lg:hidden">
          <IconButton label="Open component list" icon="menu-02" variant="secondary" onClick={() => setNav((v) => !v)} aria-expanded={nav} />
          <span className="text-[18px] font-extrabold tracking-[-0.05em]">fortless ui</span>
        </header>
        {nav ? <div className="fixed inset-x-0 top-[68px] bottom-0 z-40 overflow-auto bg-bg p-3 lg:hidden"><SearchField value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Find a component" className="mb-3" />{list}</div> : null}

        <main className="min-w-0 p-3 lg:p-4 lg:pl-0">
          <div className="grid min-h-[calc(100dvh-24px)] grid-rows-[auto_1fr] gap-3 rounded-xl bg-s2 p-3 lg:min-h-[calc(100dvh-32px)] lg:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="mr-auto text-[22px] font-extrabold tracking-[-0.045em]">{story ? story.title : kind === 'tokens' ? 'Design tokens' : kind === 'registry' ? 'Component registry' : 'Overview'}</h1>
              {story ? (
                <>
                  <StatusBadge tone={statusTone[story.status]}>{story.status}</StatusBadge>
                  <SegmentedControl aria-label="View" size="sm" value={tab} onValueChange={setTab} options={[{ value: 'canvas', label: 'Canvas' }, { value: 'docs', label: 'Docs' }]} />
                  {tab === 'canvas' && bleedStory ? (
                    <Select aria-label="Scenario" label="Scenario" hideLabel size="sm" className="w-[220px]" value={String(scn)} onValueChange={(v) => setScn(Number(v))} options={story!.scenarios.map((x, i) => ({ value: String(i), label: x.name }))} />
                  ) : null}
                  {tab === 'canvas' ? (
                    <Select aria-label="Viewport" label="Viewport" hideLabel size="sm" className="w-[150px]" value={String(width)} onValueChange={(v) => setWidth(Number(v) as (typeof WIDTHS)[number])} options={WIDTHS.map((w) => ({ value: String(w), label: w === 0 ? 'Fit width' : `${w}px` }))} />
                  ) : null}
                </>
              ) : null}
              <SegmentedControl aria-label="Theme" size="sm" value={t.preference} onValueChange={t.setPreference} options={[{ value: 'light', label: 'Light', icon: 'sun-03', iconOnlyOnMobile: true }, { value: 'dark', label: 'Dark', icon: 'moon-01', iconOnlyOnMobile: true }, { value: 'system', label: 'System', iconOnlyOnMobile: false }]} />
              <SegmentedControl aria-label="Density" size="sm" value={t.density} onValueChange={t.setDensity} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
            </div>

            {story && tab === 'canvas' ? (
              <div className="min-h-[560px] overflow-auto rounded-lg bg-bg">
                <iframe key={story.id + scn} ref={send} title={`${story.title} preview`} src={frame} onLoad={(e) => send(e.currentTarget)} style={{ width: width || '100%', maxWidth: '100%' }} className="mx-auto block h-[max(78dvh,640px)] border-0 bg-bg" />
              </div>
            ) : story ? (
              <StoryDocs story={story} verified={verifiedIds.has(story.id)} />
            ) : kind === 'tokens' ? (
              <TokensPage />
            ) : kind === 'registry' ? (
              <RegistryTable />
            ) : (
              <Overview />
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

function Overview() {
  const total = STORIES.length;
  const impl = STORIES.filter((s) => s.status === 'implemented').length;
  const part = STORIES.filter((s) => s.status === 'partial').length;
  const ver = STORIES.filter((s) => verifiedIds.has(s.id)).length;
  const items: [string, number][] = [['Stories', total], ['Implemented', impl], ['Partial', part], ['Verified by test', ver]];
  return (
    <div className="mx-auto grid w-full max-w-[900px] content-start gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-s1 p-4"><p className="text-[13px] font-bold text-ink3">{k}</p><p className="text-[30px] leading-tight font-extrabold tracking-[-0.04em]">{v}</p></div>
        ))}
      </div>
      <div className="grid gap-2 rounded-lg bg-s1 p-5">
        <h2 className="text-lg font-extrabold tracking-[-0.03em]">How to read this workbench</h2>
        <p className="text-ink2">Each story renders in an iframe at the width you choose, so responsive behavior is real, not simulated. Docs lists the contract of each component. A component is marked <em>verified</em> only when an automated test actually rendered and exercised it; implemented without verification means exactly that.</p>
        <p className="flex items-center gap-2 text-ink2"><Icon name="information-circle" size={18} />Demo data is sample data and is labelled as such. Nothing here talks to a backend.</p>
      </div>
    </div>
  );
}

function RegistryTable() {
  return (
    <div className="overflow-auto rounded-lg bg-s1">
      <table className="w-full min-w-[760px] text-left text-[13.5px]">
        <caption className="sr-only">Component registry</caption>
        <thead><tr className="text-ink3">{['Component', 'Category', 'Layer', 'Source', 'Status', 'Verified'].map((h) => <th key={h} scope="col" className="px-4 py-3 text-[12px] font-bold">{h}</th>)}</tr></thead>
        <tbody>
          {STORIES.map((s) => (
            <tr key={s.id} className="odd:bg-s2/60">
              <th scope="row" className="px-4 py-2.5 font-bold"><a className="hover:text-accent-ink" href={`#/story/${s.id}`}>{s.title}</a></th>
              <td className="px-4 py-2.5 text-ink2">{s.category}</td>
              <td className="px-4 py-2.5 text-ink2">{s.layer}</td>
              <td className="px-4 py-2.5 text-ink2">{s.source}</td>
              <td className="px-4 py-2.5"><StatusBadge tone={statusTone[s.status]}>{s.status}</StatusBadge></td>
              <td className="px-4 py-2.5">{verifiedIds.has(s.id) ? <StatusBadge tone="good">yes</StatusBadge> : <StatusBadge tone="neutral">no</StatusBadge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
