import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background,color,border,box-shadow,transform] duration-150 select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(14_20_36/0.2)] hover:bg-brand-hover',
        secondary: 'border border-line-strong bg-surface text-ink hover:border-faint hover:bg-canvas',
        ghost: 'text-ink-2 hover:bg-ink/5 hover:text-ink',
        soft: 'bg-brand-soft text-brand-ink hover:bg-[#E2E7FD]',
        danger: 'bg-danger text-white hover:bg-[#A82020]',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        ai: 'bg-ai text-white hover:bg-[#6A2BD9]',
        ink: 'bg-ink text-white hover:bg-[#232B40]',
        sun: 'bg-sun text-ink shadow-[0_3px_0_#C99A00] hover:bg-[#FFDB5C] active:shadow-none active:translate-y-[3px]',
      },
      size: {
        xs: 'h-7 rounded-[8px] px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-8 rounded-[9px] px-3 text-[13px] [&_svg]:size-4',
        md: 'h-10 rounded-ctl px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 rounded-[12px] px-5 text-[15px] [&_svg]:size-5',
        xl: 'h-16 rounded-[16px] px-8 text-lg [&_svg]:size-6',
        icon: 'size-9 rounded-ctl [&_svg]:size-[18px]',
        'icon-sm': 'size-8 rounded-[9px] [&_svg]:size-4',
        'icon-lg': 'size-12 rounded-[12px] [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
});
