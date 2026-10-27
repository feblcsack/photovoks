'use client';

/**
 * Admin PIN entry screen — 4 digits.
 *
 * Flow: type exactly 4 digits → press ✓ (confirm) to submit. The ✓ key stays
 * disabled until all 4 digits are entered, and Enter on a keyboard behaves the
 * same way. On success the JWT is written to the `admin_token` cookie (read by
 * proxy.ts). On failure: shake + inline error, with a lockout countdown.
 *
 * Requirements: 11.2, 11.5
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Check, Delete, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DoodleBackdrop } from '@/components/doodle';
import { cn } from '@/lib/utils';

const PIN_LENGTH = 4;

type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'backspace' | 'submit';

const KEYPAD_LAYOUT: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['backspace', '0', 'submit'],
];

interface ApiSuccessResponse {
  token: string;
}

interface ApiErrorResponse {
  error: string;
  lockedUntil?: string;
  retryAfterSeconds?: number;
}

/** Only allow same-site /admin paths as post-login redirect targets. */
function safeNextPath(): string {
  if (typeof window === 'undefined') return '/admin/dashboard';
  const next = new URLSearchParams(window.location.search).get('next');
  if (
    next &&
    next.startsWith('/admin') &&
    !next.startsWith('/admin/pin') &&
    !next.startsWith('//') &&
    // Avoid redirecting to bare /admin (no page there) — send to dashboard instead
    next !== '/admin'
  ) return next;
  return '/admin/dashboard';
}

export default function AdminPinPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const shake = useAnimationControls();

  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownRef.current !== null) clearInterval(countdownRef.current);
    };
  }, []);

  function startLockoutCountdown(seconds: number) {
    setLockoutSeconds(seconds);
    if (countdownRef.current !== null) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setError(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function wrongPinFeedback() {
    if (!reduce) void shake.start({ x: [0, -12, 12, -9, 9, -4, 4, 0], transition: { duration: 0.45 } });
  }

  async function submitPin() {
    // Must be exactly 4 digits, and confirmed with ✓ (or Enter).
    if (pin.length !== PIN_LENGTH || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (response.ok) {
        const data = (await response.json()) as ApiSuccessResponse;
        const isSecure = window.location.protocol === 'https:';
        document.cookie = [
          `admin_token=${data.token}`,
          'Path=/',
          'SameSite=Strict',
          isSecure ? 'Secure' : '',
          'Max-Age=600', // 10 minutes, matches JWT expiry
        ]
          .filter(Boolean)
          .join('; ');

        router.push(safeNextPath());
        return;
      }

      const errData = (await response.json().catch(() => ({ error: 'unknown' }))) as ApiErrorResponse;

      if (response.status === 423) {
        const remaining = errData.retryAfterSeconds ?? 300;
        startLockoutCountdown(remaining);
        setError(`Terlalu banyak percobaan. Coba lagi dalam ${remaining} detik.`);
        setPin('');
      } else if (response.status === 400) {
        setError('PIN harus 4 digit angka.');
        setPin('');
      } else {
        setError('PIN salah. Silakan coba lagi.');
        setPin('');
      }
      wrongPinFeedback();
    } catch {
      setError('Terjadi kesalahan. Periksa koneksi internet Anda.');
    } finally {
      setIsLoading(false);
    }
  }

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (isLoading || lockoutSeconds !== null) return;

      if (key === 'backspace') {
        setPin((p) => p.slice(0, -1));
        setError(null);
        return;
      }
      if (key === 'submit') {
        void submitPin();
        return;
      }
      if (pin.length < PIN_LENGTH) {
        setPin((p) => p + key);
        setError(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pin, isLoading, lockoutSeconds],
  );

  // Physical keyboard
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key as KeypadKey);
      else if (e.key === 'Backspace') handleKey('backspace');
      else if (e.key === 'Enter') handleKey('submit');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKey]);

  function formatLockoutTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }

  const isLocked = lockoutSeconds !== null;
  const isComplete = pin.length === PIN_LENGTH;

  return (
    <div className="admin-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <DoodleBackdrop density="calm" />

      <motion.div
        className="relative z-10 w-full max-w-sm"
        initial={reduce ? false : { opacity: 0, y: 22, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 16 }}
      >
        <motion.div animate={shake}>
          <Card className="flex flex-col gap-6 p-7">
            {/* Header */}
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid size-14 place-items-center rounded-full border-[2.5px] border-[var(--color-ink)] bg-[var(--color-accent-soft)]">
                <Lock className="size-6 text-[var(--color-accent)]" aria-hidden="true" />
              </span>
              <h1 className="font-display m-0 text-4xl font-bold leading-none">Admin</h1>
              <p className="m-0 text-sm text-gray-600">Masukkan 4 digit PIN, lalu tekan ✓</p>
            </div>

            {/* 4 PIN dots */}
            <div className="flex justify-center gap-4" aria-label={`PIN: ${pin.length} dari ${PIN_LENGTH} digit dimasukkan`} aria-live="polite">
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <motion.span
                  key={i}
                  animate={i < pin.length ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    'size-5 rounded-full border-[2.5px] border-[var(--color-ink)] transition-colors',
                    i < pin.length ? 'bg-[var(--color-accent)]' : 'bg-transparent',
                  )}
                />
              ))}
            </div>

            {/* Error / lockout */}
            <div className="min-h-[3rem]" aria-live="assertive">
              {error && (
                <motion.div
                  role="alert"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-2 border-[var(--color-danger)] bg-[#FDECEA] px-4 py-2.5 text-center text-sm text-[#8E1F16] [border-radius:10px_5px_10px_5px/5px_10px_5px_10px]"
                >
                  {isLocked && lockoutSeconds !== null ? `Terkunci. Coba lagi dalam ${formatLockoutTime(lockoutSeconds)}.` : error}
                </motion.div>
              )}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3" role="group" aria-label="Keypad PIN">
              {KEYPAD_LAYOUT.flat().map((key) => {
                const isSubmit = key === 'submit';
                const isBackspace = key === 'backspace';
                const disabled = isLoading || isLocked || (isSubmit && !isComplete) || (isBackspace && pin.length === 0);

                return (
                 <Button
  key={key}
  type="button"
  data-plain
  size="lg"
  variant={isSubmit ? 'default' : 'secondary'} // <-- Ganti success jadi default
  disabled={disabled}
  onClick={() => handleKey(key)}
  aria-label={isBackspace ? 'Hapus digit terakhir' : isSubmit ? 'Konfirmasi PIN' : `Digit ${key}`}
  // Tambahin warna ijo di className khusus kalau isSubmit
  className={`text-3xl ${isSubmit ? 'bg-green-500 hover:bg-green-600 text-white' : ''}`}
>
                    {isBackspace ? (
                      <Delete aria-hidden="true" />
                    ) : isSubmit ? (
                      isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />
                    ) : (
                      key
                    )}
                  </Button>
                );
              })}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
