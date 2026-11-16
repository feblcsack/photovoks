'use client';

/**
 * End screen — shown immediately after a Print Job is created.
 *
 * Displays:
 * - Current print status (printing / complete / failed / printer offline),
 *   polled every 2 s from GET /api/sessions/{token}/status
 * - A QR code encoding `/s/{sessionToken}` with error correction level M
 * - "Unggahan masih berlangsung…" note when uploadPending is true (Req 7.8)
 * - A friendly note when the printer is offline or the print failed
 * - "Selesai" button that dispatches DISMISS_END_SCREEN
 *
 * The screen stays visible until the visitor taps "Selesai" OR 45 seconds
 * elapse — printing complete does NOT auto-advance. (Req 7.3, 7.4)
 *
 * On dismiss, DISMISS_END_SCREEN resets BoothState to initialBoothState
 * (idle step), then we navigate to "/" to render the idle screen. (Req 7.6)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useBoothContext } from '../context/BoothContext';
import { motion, useReducedMotion } from 'framer-motion';
import { DoodleButton, DoodleBackdrop } from '@/components/doodle';
import { Card } from '@/components/ui/card';
import { id } from '@/i18n/id';
import type { PrintJobStatus } from '@photovoks/shared-types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Auto-dismiss after 45 seconds (Req 7.3) */
const DISMISS_TIMEOUT_MS = 45_000;

/** Minimum QR code display size in pixels (legibility requirement, Req 7.7) */
const QR_SIZE = 220;

// ── Component ─────────────────────────────────────────────────────────────────

export default function EndPage() {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();

  const { sessionToken, uploadPending } = state;
  const reduce = useReducedMotion();

  /**
   * Local print status — starts from whatever is already in state (may already
   * be 'printed' if confirmed before the end screen mounts) and gets updated
   * from status polling.
   */
  const [printStatus, setPrintStatus] = useState<PrintJobStatus | null>(
    state.printJobStatus,
  );

  const [stationOnline, setStationOnline] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(Math.round(DISMISS_TIMEOUT_MS / 1000));
  const dismissedRef = useRef(false);

  // ── Dismiss helper ────────────────────────────────────────────────────────

  function dismiss() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    dispatch({ type: 'DISMISS_END_SCREEN' });
    router.push('/');
  }

  // ── Auto-dismiss countdown ────────────────────────────────────────────────

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          dismiss();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Poll print status (works with RLS locked down; no anon DB access) ─────

  useEffect(() => {
    if (!sessionToken) return;
    let stopped = false;

    async function poll() {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionToken!)}/status`, {
          cache: 'no-store',
        });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as {
          printJob: { status: PrintJobStatus } | null;
          printStationOnline: boolean;
        };
        setStationOnline(data.printStationOnline);
        if (data.printJob?.status) {
          setPrintStatus(data.printJob.status);
          dispatch({ type: 'PRINT_STATUS_UPDATE', status: data.printJob.status });
        }
      } catch {
        // offline — keep last known status
      }
    }

    void poll();
    const timer = setInterval(poll, 2_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  // ── Derive displayed status text ──────────────────────────────────────────

  function getStatusText(): string {
    if (printStatus === 'printed') return id.end.printed;
    if (printStatus === 'failed') return id.end.printFailed;
    if (!stationOnline && printStatus !== 'printing') return id.end.printerOffline;
    return id.end.printing;
  }

  // ── QR code URL ───────────────────────────────────────────────────────────

  /**
   * Encode the full URL for the session page.
   * We use the current origin so the QR code works in any environment
   * (dev localhost, staging, production).
   */
  const sessionUrl = sessionToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${sessionToken}`
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  const isPrinted = printStatus === 'printed';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden p-6">
      <DoodleBackdrop density="calm" />

      {/* Print status headline */}
      <motion.p
        key={getStatusText()}
        aria-live="polite"
        aria-atomic="true"
        initial={reduce ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="font-display relative z-10 m-0 text-center text-[clamp(2rem,5vw,3rem)] font-bold leading-tight"
        style={{ color: isPrinted ? 'var(--color-accent)' : 'var(--color-ink)' }}
      >
        {getStatusText()}
      </motion.p>

      {/* QR code on a taped polaroid-style card */}
      {sessionUrl ? (
        <motion.div
          className="relative z-10 flex flex-col items-center gap-3"
          initial={reduce ? false : { opacity: 0, y: 24, rotate: 3 }}
          animate={{ opacity: 1, y: 0, rotate: -1.5 }}
          transition={{ type: 'spring', stiffness: 150, damping: 15, delay: 0.1 }}
        >
          <div className="absolute -top-3 left-1/2 z-10 h-6 w-20 -translate-x-1/2 rotate-2 border-2 border-[var(--color-ink)] bg-[var(--color-accent-soft)]/90" aria-hidden="true" />
          <Card className="flex flex-col items-center gap-3 p-5 pb-4">
            {/* White background + black modules for maximum contrast (Req 7.7) */}
            <div
              aria-label={id.end.qrInstructions}
              className="inline-block border-[2.5px] border-[var(--color-ink)] bg-white p-4 leading-[0] [border-radius:10px_5px_10px_5px/5px_10px_5px_10px]"
            >
              <QRCodeSVG
                value={sessionUrl}
                size={QR_SIZE}
                level="M" // Error correction level M or higher (Req 7.7)
                fgColor="#000000"
                bgColor="#ffffff"
                aria-label={sessionUrl}
              />
            </div>
            <p className="font-display m-0 text-center text-2xl font-bold leading-tight">{id.end.qrInstructions}</p>
          </Card>

          {/* Upload still pending note (Req 7.8) */}
          {uploadPending && (
            <p role="status" className="m-0 text-center text-base italic text-[var(--color-accent-deep)]">
              {id.end.uploadPending}
            </p>
          )}
        </motion.div>
      ) : (
        /* Fallback if no sessionToken yet (should not happen in normal flow) */
        <div
          className="relative z-10 flex items-center justify-center border-[2.5px] border-dashed border-[var(--color-ink)] bg-black/5 [border-radius:var(--doodle-radius-sm)]"
          style={{ width: QR_SIZE + 32, height: QR_SIZE + 32 }}
        >
          <p className="m-0 p-4 text-center opacity-60">{id.end.uploadPending}</p>
        </div>
      )}

      {/* Selesai (Req 7.3, 7.6) */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <DoodleButton variant="primary" size="lg" onClick={dismiss} aria-label={id.end.done}>
          {id.end.done}
        </DoodleButton>
        <p className="m-0 text-sm opacity-60">{id.end.autoClose(secondsLeft)}</p>
      </div>
    </div>
  );
}
