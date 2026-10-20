import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';

export interface ValidationIssue {
  /** DOM id of the invalid control. When it exists, the item becomes a link that moves focus there. */
  fieldId?: string;
  label: string;
  message: string;
}

export interface ValidationSummaryProps {
  issues: ValidationIssue[];
  title?: string;
  /** Move focus to the summary when issues first appear after a submit attempt. Default true. */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Lists everything that blocks a form. Each item jumps to its field, so keyboard and screen reader users do not hunt for errors.
 * Renders nothing when there are no issues. Focus moves to the summary when it appears.
 */
export function ValidationSummary({ issues, title, autoFocus = true, className }: ValidationSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const had = useRef(false);
  const has = issues.length > 0;
  useEffect(() => {
    if (has && !had.current && autoFocus) ref.current?.focus();
    had.current = has;
  }, [has, autoFocus]);
  if (!has) return null;
  const heading = title ?? (issues.length === 1 ? 'Fix 1 problem to continue' : `Fix ${issues.length} problems to continue`);
  return (
    <div ref={ref} tabIndex={-1} role="alert" className={cn('grid gap-2 rounded-lg bg-bad-bg p-4 text-bad outline-none focus-visible:ring-2 focus-visible:ring-bad', className)}>
      <p className="flex items-center gap-2 font-extrabold"><Icon name="alert-circle" size={18} />{heading}</p>
      <ul className="grid gap-1 pl-7 text-[14px] font-semibold">
        {issues.map((i, n) => (
          <li key={`${i.fieldId ?? i.label}-${n}`} className="list-disc">
            {i.fieldId ? (
              <a
                href={`#${i.fieldId}`}
                className="underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad"
                onClick={(e) => { const el = document.getElementById(i.fieldId!); if (el) { e.preventDefault(); el.focus(); el.scrollIntoView({ block: 'center' }); } }}
              >
                {i.label}: {i.message}
              </a>
            ) : <>{i.label}: {i.message}</>}
          </li>
        ))}
      </ul>
    </div>
  );
}
