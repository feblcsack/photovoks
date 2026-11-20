'use client';
import React from 'react';
import { cn } from '@/lib/utils';

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: React.ReactNode }>; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-[11px] bg-ink/[0.06] p-[3px]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-[8px] font-semibold whitespace-nowrap transition-all',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]',
            value === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(14_20_36/0.12)]' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
