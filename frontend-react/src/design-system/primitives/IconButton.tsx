import { forwardRef } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';
import { Spinner } from './Spinner';

const iconButtonStyles = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 ease-petal active:scale-90 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
  {
    variants: {
      variant: {
        ghost: 'text-ink2 hover:bg-s3 hover:text-ink',
        secondary: 'bg-s3 text-ink hover:bg-s4',
        primary: 'bg-accent text-on-accent hover:bg-accent-h',
        subtle: 'bg-accent-bg text-accent-ink',
        danger: 'text-bad hover:bg-bad-bg',
      },
      size: { sm: 'size-ctl-sm', md: 'size-ctl-md', lg: 'size-ctl-lg' },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
);

export interface IconButtonProps extends Omit<React.ComponentPropsWithoutRef<typeof BaseButton>, 'className' | 'children'>, VariantProps<typeof iconButtonStyles> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  icon: IconName;
  loading?: boolean;
  className?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, icon, variant, size, loading, className, onClick, ...rest }, ref) {
  return (
    <BaseButton
      ref={ref}
      type="button"
      aria-label={label}
      aria-busy={loading || undefined}
      focusableWhenDisabled={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cn(iconButtonStyles({ variant, size }), className)}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : <Icon name={icon} size={size === 'sm' ? 17 : 20} />}
    </BaseButton>
  );
});
