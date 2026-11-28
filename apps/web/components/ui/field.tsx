import React from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-ctl border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint transition-colors hover:border-faint focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:bg-canvas disabled:text-muted';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-2 leading-relaxed', className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%236B7385%27 stroke-width=%272%27%3E%3Cpath d=%27m4 6 4 4 4-4%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, className, htmlFor }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-2">
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : hint ? <p className="text-xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

/** 98.css text box (sunken white field, square, pixel font) for the retro surfaces. */
export const WinInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function WinInput({ className, ...props }, ref) {
  return <input ref={ref} className={cn('win-field h-10 w-full px-2.5 font-pixel text-[15px] text-black placeholder:text-win-shadow focus:outline-1 focus:outline-dotted focus:outline-black focus:-outline-offset-4 disabled:bg-win', className)} {...props} />;
});
