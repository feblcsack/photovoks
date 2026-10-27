'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BoothProvider } from './context/BoothContext';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useAdminGesture } from '@/hooks/useAdminGesture';
import { useBoothContext } from './context/BoothContext';
import { DoodleButton } from '@/components/doodle';
import { OfflineIndicator } from '@/components/booth/OfflineIndicator';
import { flushPendingQueue } from '@/lib/offline/queue';
import { id } from '@/i18n/id';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * Inner shell component that can use context hooks.
 * Separated from the layout wrapper so we can call useBoothContext()
 * after BoothProvider has been mounted.
 */
function BoothShell({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function loadActiveEvent() {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('events')
        .select('id, name, status, retention_days, daily_sketch_cap, tear_line_offset_px, active_prompt_template_id')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (cancelled || error || !data) return;

      dispatch({
        type: 'SET_EVENT',
        event: {
          id: data.id,
          name: data.name,
          status: data.status,
          retentionDays: data.retention_days,
          dailySketchCap: data.daily_sketch_cap,
          tearLineOffsetPx: data.tear_line_offset_px,
          activePromptTemplateId: data.active_prompt_template_id,
        },
      });
    }

    void loadActiveEvent();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // Prevent screen from sleeping during booth operation (Req 13.1)
  useWakeLock();

  // Listen for admin entry gesture throughout the booth flow (Req 1.3, 11.1)
  useAdminGesture();

  // Reset to idle after 60 seconds of inactivity (Req 1.2)
  useIdleTimer(60_000, () => {
    dispatch({ type: 'RESET' });
  });

  // Register Service Worker and wire offline queue flush (Req 13.1, 13.3)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);

      // Listen for FLUSH_QUEUE messages relayed from the SW
      // (SW receives them from other clients and forwards to all windows)
      const handleSwMessage = (event: MessageEvent) => {
        if (event.data === 'FLUSH_QUEUE') {
          flushPendingQueue().catch(console.error);
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMessage);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      };
    }
  }, []);

  // Flush pending IndexedDB queue when network connectivity is restored (Req 13.3)
  useEffect(() => {
    const handleOnline = () => {
      flushPendingQueue().catch(console.error);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // ── Generic error fallback for confirm_failed / unknown (Req 13.5) ────────

  const error = state.error;
  const isUnhandledError =
    error === 'confirm_failed' || error === 'unknown';

  if (isUnhandledError) {
    function handleReturnToIdle() {
      dispatch({ type: 'RESET' });
      router.push('/');
    }

    const errorMessage =
      error === 'confirm_failed'
        ? id.errors.confirmFailed
        : id.errors.generic;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--color-bg)] p-8">
        <p className="m-0 max-w-sm text-center text-xl leading-relaxed text-[var(--color-ink)]">{errorMessage}</p>
        {/* Recovery action — always present (Requirement 13.5) */}
        <DoodleButton variant="primary" onClick={handleReturnToIdle}>
          {id.errors.returnToIdle}
        </DoodleButton>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Booth app shell layout.
 *
 * Wraps all (booth) sub-routes with:
 * - BoothProvider (shared state machine)
 * - Screen Wake Lock
 * - 60-second idle timer
 * - Service Worker registration + offline queue flush wiring
 * - OfflineIndicator banner (max 40px, non-blocking)
 * - Generic error fallback screen for unhandled BoothError values
 *
 * Requirements: 1.1, 1.2, 13.1, 13.3, 13.4, 13.5
 */
export default function BoothLayout({ children }: { children: React.ReactNode }) {
  return (
    <BoothProvider>
      {/* Offline indicator is outside BoothShell so it renders in all error states too */}
      <OfflineIndicator />
      <BoothShell>
        <main className="flex min-h-screen flex-col" style={{ touchAction: 'manipulation' }}>
          {children}
        </main>
      </BoothShell>
    </BoothProvider>
  );
}
