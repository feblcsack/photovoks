import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-bold transition-[background,color,border,box-shadow,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Y2K sticker buttons: ink outline + hard offset shadow that "presses in".
        primary: 'border-2 border-ink bg-brand text-white shadow-[3px_3px_0_var(--color-ink)] hover:bg-brand-hover active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-ink)]',
        secondary: 'border-2 border-ink bg-surface text-ink shadow-[2px_2px_0_var(--color-ink)] hover:bg-[#FFF4DA] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        ghost: 'text-ink-2 hover:bg-ink/[0.06] hover:text-ink active:translate-y-px',
        soft: 'border-2 border-cobalt/25 bg-cobalt-soft text-cobalt hover:border-cobalt/50 active:translate-y-px',
        danger: 'border-2 border-ink bg-danger text-white shadow-[2px_2px_0_var(--color-ink)] hover:bg-[#A82020] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        'danger-ghost': 'text-danger hover:bg-danger-soft active:translate-y-px',
        ai: 'border-2 border-ink bg-cobalt text-white shadow-[3px_3px_0_var(--color-ink)] hover:bg-[#1F3BAA] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-ink)]',
        ink: 'border-2 border-ink bg-ink text-white shadow-[3px_3px_0_var(--color-brand)] hover:bg-[#2B231C] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-brand)]',
        sun: 'border-2 border-ink bg-sun text-ink shadow-[3px_3px_0_var(--color-ink)] hover:bg-[#FFDB5C] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-ink)]',
        bubble: 'border-2 border-ink bg-bubble text-ink shadow-[3px_3px_0_var(--color-ink)] hover:bg-[#FFB0DC] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-ink)]',
        // Retro OS ("Photovoks 98") bevel buttons — booth + guest flow.
        // 98.css: plain button, and the "default" button (extra black ring) for the main action.
        win: 'bevel-out bg-win font-pixel text-black active:bevel-pressed active:[&>*]:translate-x-px active:[&>*]:translate-y-px focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-black focus-visible:-outline-offset-4 disabled:text-win-shadow disabled:[text-shadow:1px_1px_0_#fff]',
        'win-primary': 'bg-win font-pixel font-bold text-black shadow-[inset_-2px_-2px_0_#0a0a0a,inset_1px_1px_0_#0a0a0a,inset_2px_2px_0_#fff,inset_-3px_-3px_0_#808080,inset_3px_3px_0_#dfdfdf] active:shadow-[inset_2px_2px_0_#0a0a0a,inset_-1px_-1px_0_#0a0a0a,inset_-2px_-2px_0_#fff,inset_3px_3px_0_#808080,inset_-3px_-3px_0_#dfdfdf] active:[&>*]:translate-x-px active:[&>*]:translate-y-px focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-black focus-visible:-outline-offset-5',
        'win-go': 'bg-win font-pixel font-bold text-black shadow-[inset_-2px_-2px_0_#0a0a0a,inset_1px_1px_0_#0a0a0a,inset_2px_2px_0_#fff,inset_-3px_-3px_0_#808080,inset_3px_3px_0_#dfdfdf] active:shadow-[inset_2px_2px_0_#0a0a0a,inset_-1px_-1px_0_#0a0a0a,inset_-2px_-2px_0_#fff,inset_3px_3px_0_#808080,inset_-3px_-3px_0_#dfdfdf] active:[&>*]:translate-x-px active:[&>*]:translate-y-px focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-black focus-visible:-outline-offset-5',
      },
      size: {
        xs: 'h-7 rounded-full px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-8 rounded-full px-3 text-[13px] [&_svg]:size-4',
        md: 'h-10 rounded-full px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 rounded-full px-5 text-[15px] [&_svg]:size-5',
        xl: 'h-16 rounded-full px-8 text-lg [&_svg]:size-6',
        icon: 'size-9 rounded-full [&_svg]:size-[18px]',
        'icon-sm': 'size-8 rounded-full [&_svg]:size-4',
        'icon-lg': 'size-12 rounded-full [&_svg]:size-5',
      },
    },
    // Square corners for the retro OS buttons whatever the size.
    compoundVariants: [{ variant: ['win', 'win-primary', 'win-go'], class: 'rounded-none' }],
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
