import type { StoryDef } from './types';
import { StatusBadge } from '@/design-system';

export const statusTone = { planned: 'neutral', partial: 'warn', implemented: 'good' } as const;

export function StoryDocs({ story, verified }: { story: StoryDef; verified: boolean }) {
  const rows: [string, React.ReactNode][] = [
    ['Purpose', story.purpose],
    ['Layer', story.layer],
    ['Source', story.source],
    ['Variants', story.variants.join(', ')],
    ['Props', <ul key="p" className="grid gap-1 font-mono text-[12.5px]">{story.props.map((p) => <li key={p}>{p}</li>)}</ul>],
    ['Accessibility contract', story.a11y],
    ['Responsive behavior', story.responsive],
    ['Status', <span key="s" className="flex flex-wrap items-center gap-2"><StatusBadge tone={statusTone[story.status]}>{story.status}</StatusBadge>{verified ? <StatusBadge tone="good">verified by automated test</StatusBadge> : <StatusBadge tone="neutral">not verified by test yet</StatusBadge>}</span>],
    ['Known gaps', story.gaps ?? 'None recorded.'],
  ];
  return (
    <dl className="mx-auto grid max-w-[900px] gap-px overflow-hidden rounded-lg bg-s3">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 bg-s1 p-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
          <dt className="text-[13px] font-bold text-ink3">{k}</dt>
          <dd className="min-w-0 text-[14px] font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
