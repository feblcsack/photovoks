'use client';

/**
 * End screen — shown immediately after a Print Job is created.
 *
 * Displays:
 * - Current print status (printing / complete), sourced from BoothState and
 *   updated live via Supabase Realtime channel `session:{sessionId}`
 * - A QR code encoding `/s/{sessionToken}` with error correction level M
 * - "Unggahan masih berlangsung…" note when uploadPending is true (Req 7.8)
 * - "Status cetak tidak dapat dikonfirmasi." when Realtime is unavailable (Req 7.5)
 * - "Selesai" button that dispatches DISMISS_END_SCREEN
 *
 * The screen stays visible until the visitor taps "Selesai" OR 45 seconds
 * elapse — printing complete via Realtime does NOT auto-advance. (Req 7.3, 7.4)
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
import { createBrowserClient } from '@/lib/supabase/client';
import type { PrintJobStatus } from '@photovoks/shared-types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Auto-dismiss after 45 seconds (Req 7.3) */
const DISMISS_TIMEOUT_MS = 45_000;

/** Minimum QR code display size in pixels (legibility requirement, Req 7.7) */
const QR_SIZE = 220;

// ── Component ─────────────────────────────────────────────────────────────────

export default function EndPage() {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();

  const { sessionId, sessionToken, uploadPending } = state;
  const reduce = useReducedMotion();

  /**
   * Local print status — starts from whatever is already in state (may already
   * be 'printed' if confirmed before the end screen mounts) and gets updated
   * from Realtime events.
   */
  const [printStatus, setPrintStatus] = useState<PrintJobStatus | null>(
    state.printJobStatus,
  );

  /**
   * When Realtime fails to subscribe or an error event is received,
   * we show the fallback message instead of the status text. (Req 7.5)
   */
  const [realtimeUnavailable, setRealtimeUnavailable] = useState(false);

  // Prevent double-subscription in React Strict Mode
  const channelRef = useRef<RealtimeChannel | null>(null);
  const dismissedRef = useRef(false);

  // ── Dismiss helper ────────────────────────────────────────────────────────

  function dismiss() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    // Clean up Realtime subscription before leaving
    if (channelRef.current) {
      try {
        createBrowserClient().removeChannel(channelRef.current);
      } catch {
        // Ignore errors during cleanup
      }
      channelRef.current = null;
    }

    // DISMISS_END_SCREEN resets all state → idle step (Req 7.6)
    dispatch({ type: 'DISMISS_END_SCREEN' });
    router.push('/');
  }

  // ── 45-second auto-dismiss timeout (Req 7.3) ─────────────────────────────

  useEffect(() => {
    const timer = setTimeout(dismiss, DISMISS_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty — timer fires once on mount

  // ── Supabase Realtime subscription (Req 7.2) ─────────────────────────────

  useEffect(() => {
    if (!sessionId) return;
    if (channelRef.current) return; // Already subscribed

    let supabase: ReturnType<typeof createBrowserClient>;
    try {
      supabase = createBrowserClient();
    } catch {
      // Supabase client couldn't be created (missing env vars etc.)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRealtimeUnavailable(true);
      return;
    }

    const channel = supabase.channel(`session:${sessionId}`);
    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'print_jobs',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { status?: PrintJobStatus })?.status;
          if (newStatus) {
            setPrintStatus(newStatus);
            dispatch({ type: 'PRINT_STATUS_UPDATE', status: newStatus });
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
          // Realtime failed — fall back to the "cannot confirm" message (Req 7.5)
          setRealtimeUnavailable(true);
        }
      });

    return () => {
      // Cleanup on unmount
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {
          // Ignore
        }
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // Re-run only if sessionId changes (it won't during the screen)

  // ── Derive displayed status text ──────────────────────────────────────────

  function getStatusText(): string {
    if (realtimeUnavailable) {
      return id.end.noRealtime;
    }
    if (printStatus === 'printed') {
      return id.end.printed;
    }
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
  const isPrinted = printStatus === 'printed' && !realtimeUnavailable;

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
      <DoodleButton variant="primary" size="lg" onClick={dismiss} aria-label={id.end.done} className="relative z-10">
        {id.end.done}
      </DoodleButton>
    </div>
  );
}
