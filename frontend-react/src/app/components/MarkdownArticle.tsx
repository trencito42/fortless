import { Fragment, type ReactNode } from 'react';

function inline(source: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const token = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let cursor = 0; let match: RegExpExecArray | null;
  while ((match = token.exec(source))) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index));
    if (match[2]) nodes.push(<strong key={match.index} className="font-extrabold text-ink">{match[2]}</strong>);
    else if (match[3]) nodes.push(<code key={match.index} className="rounded bg-s3 px-1.5 py-0.5 font-mono text-[0.9em] font-semibold text-ink">{match[3]}</code>);
    else if (match[4] && match[5]) nodes.push(<a key={match.index} href={match[5]} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink underline underline-offset-2">{match[4]}</a>);
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

/** Small, safe renderer for the Markdown subset returned by the Fortless knowledge-base API. */
export function MarkdownArticle({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) { index += 1; continue; }
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3); const code: string[] = []; index += 1;
      while (index < lines.length && !lines[index]!.trim().startsWith('```')) code.push(lines[index++]!);
      index += index < lines.length ? 1 : 0;
      blocks.push(<pre key={`code-${index}`} className="max-w-full overflow-x-auto rounded-lg bg-s3 p-4 text-[13px] leading-6 text-ink"><code className={`font-mono language-${language || 'text'}`}>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const level = heading[1]!.length; const content = inline(heading[2]!);
      const cls = level === 1 ? 'text-[26px]' : level === 2 ? 'text-[21px]' : 'text-[17px]';
      blocks.push(<div key={`heading-${index}`} role="heading" aria-level={level} className={`${cls} mt-3 font-display font-extrabold tracking-[-0.02em] text-ink`}>{content}</div>); index += 1; continue;
    }
    const ordered = /^\s*\d+\.\s+/.test(line); const unordered = /^\s*[-*]\s+/.test(line);
    if (ordered || unordered) {
      const items: ReactNode[] = []; const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/;
      while (index < lines.length) { const item = pattern.exec(lines[index]!); if (!item) break; items.push(<li key={index}>{inline(item[1]!)}</li>); index += 1; }
      const cls = 'grid max-w-[72ch] gap-2 pl-6 leading-7 text-ink2 marker:font-bold marker:text-ink3';
      blocks.push(ordered ? <ol key={`list-${index}`} className={`${cls} list-decimal`}>{items}</ol> : <ul key={`list-${index}`} className={`${cls} list-disc`}>{items}</ul>); continue;
    }
    const paragraph: string[] = [line.trim()]; index += 1;
    while (index < lines.length && lines[index]!.trim() && !/^(#{1,4})\s+|^\s*(?:\d+\.|[-*])\s+|^```/.test(lines[index]!)) paragraph.push(lines[index++]!.trim());
    blocks.push(<p key={`p-${index}`} className="max-w-[72ch] leading-7 text-ink2">{paragraph.map((part, i) => <Fragment key={i}>{i ? ' ' : null}{inline(part)}</Fragment>)}</p>);
  }
  return <div className="grid gap-4">{blocks}</div>;
}
