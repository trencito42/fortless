import { cn } from '@/lib/utils/cn';

const sizes = { sm: 'size-8 text-[11px]', md: 'size-9.5 text-[13px]', lg: 'size-12 text-base' } as const;

export function Avatar({ initials, tone = 'accent', size = 'md', className }: { initials: string; tone?: 'accent' | 'violet' | 'ink'; size?: keyof typeof sizes; className?: string }) {
  const toneCls = tone === 'violet' ? 'bg-violet text-on-ink' : tone === 'ink' ? 'bg-ink text-on-ink' : 'bg-accent text-on-accent';
  return (
    <span aria-hidden="true" className={cn('inline-grid shrink-0 place-items-center rounded-full font-extrabold', sizes[size], toneCls, className)}>
      {initials}
    </span>
  );
}
