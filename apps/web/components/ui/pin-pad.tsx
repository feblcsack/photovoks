'use client';

/**
 * Touch-friendly PIN entry (4–8 digits). Works with keyboard too.
 * Calls onSubmit(pin) → return an error string to show, or null on success.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export function PinPad({ length = 6, minLength = 4, onSubmit, dark, autoSubmit = false }: { length?: number; minLength?: number; onSubmit: (pin: string) => Promise<string | null>; dark?: boolean; autoSubmit?: boolean }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = useCallback(
    async (value: string) => {
      if (value.length < minLength || busy) return;
      setBusy(true);
      setError(null);
      const err = await onSubmit(value);
      setBusy(false);
      if (err) {
        setError(err);
        setPin('');
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
    },
    [busy, minLength, onSubmit],
  );

  const press = useCallback(
    (d: string) => {
      if (busy) return;
      setError(null);
      setPin((p) => {
        const next = (p + d).slice(0, length);
        if (autoSubmit && next.length === length) void submit(next);
        return next;
      });
    },
    [autoSubmit, busy, length, submit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') void submit(pin);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pin, press, submit]);

  const key = cn(
    'flex h-16 items-center justify-center rounded-[14px] text-2xl font-semibold tabular-nums transition-colors active:scale-[0.97] sm:h-[68px]',
    dark ? 'bg-white/[0.08] text-white hover:bg-white/[0.14]' : 'bg-ink/[0.05] text-ink hover:bg-ink/[0.09]',
  );

  return (
    <div className="w-full max-w-[320px]">
      <div className={cn('mb-2 flex h-12 items-center justify-center gap-3', shake && 'animate-[pop_0.3s]')} aria-live="polite" aria-label={`${pin.length} digit dimasukkan`}>
        {Array.from({ length: Math.max(minLength, Math.min(length, Math.max(pin.length, minLength))) }).map((_, i) => (
          <span key={i} className={cn('size-3.5 rounded-full transition-all', i < pin.length ? (dark ? 'scale-110 bg-white' : 'scale-110 bg-ink') : dark ? 'bg-white/20' : 'bg-ink/15')} />
        ))}
      </div>
      <p className={cn('mb-4 h-5 text-center text-sm font-medium', error ? 'text-[#FF6B6B]' : 'text-transparent')}>{error ?? '·'}</p>
      <div className="grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={cn(key, 'text-base')} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Hapus">
          <Delete className="size-6" />
        </button>
        <button type="button" className={key} onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          onClick={() => void submit(pin)}
          disabled={pin.length < minLength || busy}
          className={cn('flex h-16 items-center justify-center rounded-[14px] text-base font-bold transition-all disabled:opacity-35 sm:h-[68px]', dark ? 'bg-sun text-ink' : 'bg-brand text-white')}
        >
          {busy ? <Spinner className="size-5" /> : 'Masuk'}
        </button>
      </div>
    </div>
  );
}
