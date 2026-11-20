import React from 'react';
import { cn } from '@/lib/utils';

/** Flat white surface. Use one level only — no panels inside panels. */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('rounded-panel border border-line bg-surface shadow-panel', className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, description, icon, actions, className }: { title: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <span className="mt-0.5 text-muted [&_svg]:size-[18px]">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({ label, value, unit, hint }: { label: string; value: React.ReactNode; unit?: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-line bg-surface px-4 py-3.5 shadow-panel">
      <p className="text-[11px] font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="text-2xl font-extrabold tracking-tight text-ink tabular-nums">{value}</span>
        {unit ? <span className="text-sm text-muted">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
