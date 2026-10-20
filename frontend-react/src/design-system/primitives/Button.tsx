import { forwardRef, type ReactNode } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';
import { Spinner } from './Spinner';

export const buttonStyles = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold tracking-[-0.01em] whitespace-nowrap select-none',
    'transition-[background-color,color,transform,opacity] duration-150 ease-petal active:scale-[0.97]',
    'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:active:scale-100',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-h data-[disabled]:hover:bg-accent',
        secondary: 'bg-s3 text-ink hover:bg-s4 data-[disabled]:hover:bg-s3',
        ghost: 'text-ink2 hover:bg-s3 hover:text-ink data-[disabled]:hover:bg-transparent',
        ink: 'bg-ink text-on-ink hover:opacity-90',
        lime: 'bg-lime text-lime-ink hover:brightness-95',
        subtle: 'bg-accent-bg text-accent-ink hover:brightness-95',
        danger: 'bg-bad text-on-bad hover:brightness-95',
        'danger-subtle': 'bg-bad-bg text-bad hover:brightness-95',
      },
      size: {
        sm: 'h-ctl-sm px-4 text-[13.5px]',
        md: 'h-ctl-md px-5 text-[14.5px]',
        lg: 'h-ctl-lg px-7 text-base',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', block: false },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonStyles>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonStyles>['size']>;

export interface ButtonProps extends Omit<React.ComponentPropsWithoutRef<typeof BaseButton>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width block button. */
  block?: boolean;
  /** Shows a spinner, sets aria-busy and ignores clicks. The button stays focusable so focus is not lost. */
  loading?: boolean;
  /** Text read by screen readers while loading, for example "Restarting". */
  loadingLabel?: string;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  className?: string;
  children?: ReactNode;
}

/** The base action. For related actions use ButtonGroup, for one-of-many choice use SegmentedControl. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading = false, loadingLabel, leadingIcon, trailingIcon, className, children, disabled, onClick, ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 16 : 18;
  return (
    <BaseButton
      ref={ref}
      type="button"
      disabled={disabled}
      focusableWhenDisabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cn(buttonStyles({ variant, size, block }), loading && 'cursor-progress', className)}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : leadingIcon ? <Icon name={leadingIcon} size={iconSize} /> : null}
      {children}
      {trailingIcon && !loading ? <Icon name={trailingIcon} size={iconSize} /> : null}
      {loading && loadingLabel ? <span className="sr-only" role="status">{loadingLabel}</span> : null}
    </BaseButton>
  );
});
