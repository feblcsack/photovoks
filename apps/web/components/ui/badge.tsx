import React from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'bg-ink/[0.06] text-ink-2',
  brand: 'bg-brand-soft text-brand-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  ai: 'bg-ai-soft text-ai',
  dark: 'bg-ink text-white',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = 'neutral', dot, className, children }: { tone?: BadgeTone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11.5px] font-semibold whitespace-nowrap', TONES[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
