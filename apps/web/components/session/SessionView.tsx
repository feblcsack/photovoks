'use client';

/**
 * SessionView — client component that drives the session page UI.
 *
 * Receives server-side fetched initialData then takes over with live updates
 * via a Supabase Realtime subscription on channel `session:{sessionId}`.
 *
 * Subscriptions (postgres_changes on UPDATE):
 * - sketch_jobs WHERE session_id=eq.{sessionId} → updates sketch status + card URL
 * - print_jobs  WHERE session_id=eq.{sessionId} → updates strip/sketch print status
 * - sessions    WHERE id=eq.{sessionId}          → updates live_photo_status
 *
 * Requirements: 8.1, 8.4–8.10, 8.12, 12.1, 18.2
 */

import React, { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import type { SketchJobStatus, LivePhotoStatus, PrintJobStatus } from '@photovoks/shared-types';
import { motion, useReducedMotion } from 'framer-motion';
import { Float, Heart, Sparkle, Star } from '@/components/doodle';
import { id } from '@/i18n/id';

import { StripSection } from './StripSection';
import { SketchSection } from './SketchSection';
import { LivePhotoSection } from './LivePhotoSection';
import { RequestPrintButton } from './RequestPrintButton';

import type { SessionStatusData } from '@/app/s/[token]/page';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionViewProps {
  initialData: SessionStatusData;
  /** The raw token string from the URL — used as Bearer for print requests */
  token: string;
  sessionId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionView({ initialData, token, sessionId }: SessionViewProps) {
  const { session, sketchJob, printJob, printStationOnline } = initialData;

  // ── Live-updated state (seeded from SSR data) ─────────────────────────────

  const [sketchStatus, setSketchStatus] = useState<SketchJobStatus | null>(
    sketchJob?.status ?? null,
  );
  const [sketchCardSignedUrl, setSketchCardSignedUrl] = useState<string | null>(
    sketchJob?.cardSignedUrl ?? null,
  );
  const [livePhotoStatus, setLivePhotoStatus] = useState<LivePhotoStatus>(
    session.livePhotoStatus,
  );
  // Strip print job status (for future use / display)
  const [stripPrintJobStatus, setStripPrintJobStatus] = useState<PrintJobStatus | null>(
    printJob?.type === 'strip' ? (printJob.status as PrintJobStatus) : null,
  );
  // Sketch print job — starts null, updated when visitor requests print
  const [sketchPrintJobId, setSketchPrintJobId] = useState<string | null>(null);
  const [sketchPrintJobStatus, setSketchPrintJobStatus] = useState<PrintJobStatus | null>(null);

  // Generate sketch loading state
  const [isGeneratingSketch, setIsGeneratingSketch] = useState(false);

  const reduce = useReducedMotion();

  // Guard against double-subscription in React Strict Mode
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Supabase Realtime subscription ───────────────────────────────────────

  useEffect(() => {
    if (channelRef.current) return;

    let supabase: ReturnType<typeof createBrowserClient>;
    try {
      supabase = createBrowserClient();
    } catch {
      // Missing env vars — Realtime unavailable, SSR data will have to suffice
      return;
    }

    const channel = supabase.channel(`session:${sessionId}`);
    channelRef.current = channel;

    channel
      // ── sketch_jobs changes ─────────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sketch_jobs',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const row = payload.new as {
            status?: SketchJobStatus;
            card_path?: string | null;
          };

          if (row.status) {
            setSketchStatus(row.status);
          }

          // When sketch becomes done, generate a signed URL for the card
          if (row.status === 'done' && row.card_path) {
            try {
              const { data } = await supabase.storage
                .from('sketches')
                .createSignedUrl(row.card_path, 3600);
              if (data?.signedUrl) {
                setSketchCardSignedUrl(data.signedUrl);
              }
            } catch {
              // Signed URL fetch failed — card will not display
            }
          }
        },
      )
      // ── print_jobs changes ──────────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'print_jobs',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            type?: 'strip' | 'sketch';
            status?: PrintJobStatus;
          };

          if (row.type === 'strip' && row.status) {
            setStripPrintJobStatus(row.status);
          }
          if (row.type === 'sketch' && row.status) {
            setSketchPrintJobStatus(row.status);
          }
        },
      )
      // ── sessions changes (live_photo_status) ────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as { live_photo_status?: LivePhotoStatus };
          if (row.live_photo_status) {
            setLivePhotoStatus(row.live_photo_status);
          }
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {
          // Ignore cleanup errors
        }
        channelRef.current = null;
      }
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Print job created callback ────────────────────────────────────────────

  function handlePrintJobCreated(printJobId: string) {
    setSketchPrintJobId(printJobId);
    // Optimistically set to queued — Realtime will confirm
    setSketchPrintJobStatus('queued');
  }

  // ── Generate sketch callback ──────────────────────────────────────────────

  const handleGenerateSketch = async (): Promise<void> => {
    setIsGeneratingSketch(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/generate-sketch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // Optimistically set to pending — Realtime subscription will provide updates
        setSketchStatus('pending');
      } else {
        console.error('generate-sketch failed', res.status);
      }
    } catch (err) {
      console.error('generate-sketch error', err);
    } finally {
      setIsGeneratingSketch(false);
    }
  };

  // Suppress unused var warning — sketchPrintJobId may be used for future display
  void sketchPrintJobId;
  void stripPrintJobStatus;

  // ── Render ────────────────────────────────────────────────────────────────
  // Scrapbook layout: sticker header, then taped/tilted paper cards.
  return (
    <div className="relative mx-auto w-full max-w-[480px] overflow-hidden px-[clamp(1rem,5vw,2rem)] pb-16 pt-[clamp(1.5rem,6vw,2.5rem)]">
      {/* Page heading with stickers */}
      <header className="relative mb-[clamp(1.5rem,5vw,2.25rem)] text-center">
        <Float style={{ top: '-4px', left: '2%' }} duration={3.4}><Star size={30} /></Float>
        <Float style={{ top: '6px', right: '3%' }} delay={0.7} duration={3.8}><Heart size={28} /></Float>
        <Float style={{ bottom: '-6px', left: '14%' }} delay={1.2} duration={4} opacity={0.45}><Sparkle size={22} /></Float>

        <motion.h1
          initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="font-display m-0 inline-block border-[2.5px] border-[var(--color-ink)] bg-[var(--color-paper)] px-6 py-2 text-[clamp(2.2rem,9vw,3.2rem)] font-bold leading-none text-[var(--color-accent)] [border-radius:var(--doodle-radius)] [box-shadow:var(--doodle-shadow)]"
        >
          {id.session.title}
        </motion.h1>
      </header>

      <div className="flex flex-col gap-[clamp(1.75rem,6vw,2.5rem)]">
        {/* Strip — always shown (Req 8.2) */}
        <StripSection stripSignedUrl={session.stripSignedUrl} />

        {/* Sketch — all states, neutral message when failed (Req 8.4–8.6) */}
        <SketchSection
          status={sketchStatus}
          cardSignedUrl={sketchCardSignedUrl}
          onGenerateSketch={handleGenerateSketch}
          isGenerating={isGeneratingSketch}
        />

        {/* Request Print — only when sketch is done (Req 8.8–8.10) */}
        {sketchStatus === 'done' && (
          <motion.section
            aria-label={id.session.printRequest.button}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            <RequestPrintButton
              sessionToken={token}
              initialOnline={printStationOnline}
              sketchJobDone={sketchStatus === 'done'}
              sketchPrintJobStatus={sketchPrintJobStatus}
              onPrintJobCreated={handlePrintJobCreated}
            />
          </motion.section>
        )}

        {/* Live Photo scaffold — always shown (Req 8.3, 18.2) */}
        <LivePhotoSection status={livePhotoStatus} />
      </div>
    </div>
  );
}
