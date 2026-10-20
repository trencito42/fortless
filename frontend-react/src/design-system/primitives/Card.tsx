import type { HTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const cardStyles = cva('min-w-0 rounded-lg [&.grid]:grid-cols-[minmax(0,1fr)]', {
  variants: {
    surface: { raised: 'bg-s1', sunken: 'bg-s2', accent: 'bg-accent text-on-accent', ink: 'bg-ink text-on-ink', lime: 'bg-lime text-lime-ink' },
    pad: { none: 'p-0', sm: 'p-3.5', md: 'p-[18px]', lg: 'p-6' },
  },
  defaultVariants: { surface: 'raised', pad: 'md' },
});

export interface CardProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof cardStyles> {
  as?: 'div' | 'section' | 'article' | 'li';
}

/** Flat color-block container. Hierarchy comes from surface tone, never from borders or shadows. */
export function Card({ as: Tag = 'div', surface, pad, className, ...rest }: CardProps) {
  return <Tag className={cn(cardStyles({ surface, pad }), className)} {...rest} />;
}

export function CardHeader({ title, description, actions, level = 3 }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; level?: 2 | 3 | 4 }) {
  const H = `h${level}` as 'h2' | 'h3' | 'h4';
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <H className="text-lg leading-tight font-extrabold tracking-[-0.03em]">{title}</H>
        {description ? <p className="mt-1 text-ink2 in-[.bg-accent]:text-on-accent in-[.bg-ink]:text-on-ink in-[.bg-lime]:text-lime-ink">{description}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
