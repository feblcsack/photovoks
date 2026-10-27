'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBoothContext } from '../context/BoothContext';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DoodleBackdrop, DoodleButton } from '@/components/doodle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { id } from '@/i18n/id';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Frame, SlotGeometry } from '@photovoks/shared-types';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Raw DB row returned by Supabase */
interface FrameRow {
  id: string;
  event_id: string;
  name: string;
  storage_path: string;
  slot_geometry: SlotGeometry[];
  is_active: boolean;
  sort_order: number;
}

/** Frame enriched with a short-lived signed preview URL */
interface FrameWithUrl extends Frame {
  signedUrl: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function rowToFrame(row: FrameRow): Frame {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    storagePath: row.storage_path,
    slotGeometry: row.slot_geometry,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Frame selection screen.
 *
 * Fetches active frames for the active event from Supabase, renders them as
 * film-strip thumbnails using DoodleCard. Tapping a thumbnail opens a
 * full-frame preview overlay; confirming the preview dispatches SELECT_FRAME
 * and navigates to /capture.
 *
 * If no active frames exist for the event, an error state is shown with a
 * "Kembali ke Awal" CTA that returns the visitor to idle.
 *
 * POST /api/sessions is NOT called here — session creation happens later in
 * the composing step after all three photos have been captured.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export default function FramesPage() {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();

  const [frames, setFrames] = useState<FrameWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  /** Index of the frame currently shown in the carousel, and slide direction */
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const reduce = useReducedMotion();

  // ── Fetch frames ─────────────────────────────────────────────────────────────

  const fetchFrames = useCallback(async () => {
    const eventId = state.event?.id;
    if (!eventId) {
      // No active event in context — show error state
      setFetchError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(false);

    try {
      const supabase = createBrowserClient();

      // 1. Fetch active frames for this event, ordered by sort_order
      const { data: rows, error: fetchErr } = await supabase
        .from('frames')
        .select('id, event_id, name, storage_path, slot_geometry, is_active, sort_order')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (fetchErr) {
        console.error('frames fetch error', fetchErr);
        setFetchError(true);
        setLoading(false);
        return;
      }

      const frameRows = (rows ?? []) as FrameRow[];

      // 2. Generate short-lived signed URLs for preview images (10 min)
      const enriched: FrameWithUrl[] = await Promise.all(
        frameRows.map(async (row) => {
          const { data: urlData } = await supabase.storage
            .from('frames')
            .createSignedUrl(row.storage_path, 600); // 10-minute validity

          return {
            ...rowToFrame(row),
            signedUrl: urlData?.signedUrl ?? null,
          };
        })
      );

      setFrames(enriched);
    } catch (err) {
      console.error('unexpected error fetching frames', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [state.event?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFrames();
  }, [fetchFrames]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const total = frames.length;
  const current = frames[index] ?? null;

  function go(delta: 1 | -1) {
    if (total < 2) return;
    setDirection(delta);
    setIndex((i) => (i + delta + total) % total);
  }

  // Arrow keys on a keyboard-equipped iPad / laptop
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Enter') handleConfirmSelection();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, index, frames]);

  function handleConfirmSelection() {
    if (!current) return;
    // Dispatch SELECT_FRAME — sets step to 'capture' in reducer (Req 3.3)
    dispatch({ type: 'SELECT_FRAME', frame: current });
    router.push('/capture');
  }

  function handleReturnToIdle() {
    dispatch({ type: 'RESET' });
    router.push('/');
  }

  // ── No active frames error state (Req 3.4) ────────────────────────────────

  const hasNoFrames = !loading && !fetchError && frames.length === 0;
  const showError = !loading && (fetchError || hasNoFrames);

  if (loading) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-5">
        <div className="doodle-spinner" aria-hidden="true" />
        <p className="font-display m-0 text-3xl" aria-live="polite">{id.composing.processing}</p>
      </div>
    );
  }

  if (showError) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8">
        <DoodleBackdrop density="calm" />
        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/samples/heartsCutoutStripSample.png" alt="" aria-hidden="true" className="h-40 w-auto -rotate-6 border-[2.5px] border-[var(--color-ink)] opacity-60 grayscale" />
          <p className="m-0 max-w-md text-xl leading-relaxed">{id.frames.noFrames}</p>
          <DoodleButton variant="secondary" onClick={handleReturnToIdle}>
            {id.frames.returnToIdle}
          </DoodleButton>
        </div>
      </div>
    );
  }

  // ── Carousel ──────────────────────────────────────────────────────────────

  const slide = {
    enter: (d: number) => ({ x: reduce ? 0 : d * 140, opacity: 0, rotate: reduce ? 0 : d * 4, scale: 0.92 }),
    center: { x: 0, opacity: 1, rotate: 0, scale: 1 },
    exit: (d: number) => ({ x: reduce ? 0 : d * -140, opacity: 0, rotate: reduce ? 0 : d * -4, scale: 0.92 }),
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center gap-4 overflow-hidden px-4 py-6">
      <DoodleBackdrop density="calm" />

      {/* Title + hint */}
      <header className="relative z-10 text-center">
        <h1 className="font-display m-0 text-[clamp(2rem,5vw,3.2rem)] font-bold leading-none">{id.frames.title}</h1>
        <p className="font-display m-0 mt-1 text-[clamp(1.1rem,2.5vw,1.5rem)] opacity-70">{id.frames.hint}</p>
      </header>

      {/* Sketchy "monitor" with side arrows */}
      <section
        aria-roledescription="carousel"
        aria-label={id.frames.preview}
        className="relative z-10 flex w-full max-w-3xl flex-1 items-center justify-center gap-3 sm:gap-8"
      >
        <Button variant="secondary" size="icon" onClick={() => go(-1)} disabled={total < 2} aria-label="Bingkai sebelumnya" className="shrink-0">
          <ChevronLeft className="size-7" />
        </Button>

        <div className="relative flex h-[min(58vh,520px)] w-[min(78vw,330px)] items-center justify-center border-[3px] border-[var(--color-ink)] bg-[var(--color-paper)] p-4 [border-radius:14px_8px_16px_8px/8px_16px_8px_14px] [box-shadow:5px_6px_0_var(--color-ink)]">
          <div className="absolute inset-2 border-[2px] border-[var(--color-ink)] [border-radius:8px_5px_9px_5px/5px_9px_5px_8px]" aria-hidden="true" />
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            {current && (
              <motion.div
                key={current.id}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                drag={total > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.4}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60) go(1);
                  else if (info.offset.x > 60) go(-1);
                }}
                className="relative z-10 flex h-full items-center justify-center"
              >
                {current.signedUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={current.signedUrl}
                    alt={current.name}
                    draggable={false}
                    className="max-h-full w-auto max-w-full object-contain [filter:drop-shadow(2px_4px_0_rgba(26,26,26,0.25))]"
                  />
                ) : (
                  <div aria-hidden="true" className="aspect-[1/3] h-full max-h-full border-2 border-dashed border-[var(--color-ink)] bg-[var(--color-line)]" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Button variant="secondary" size="icon" onClick={() => go(1)} disabled={total < 2} aria-label="Bingkai berikutnya" className="shrink-0">
          <ChevronRight className="size-7" />
        </Button>
      </section>

      {/* Name + dots */}
      <div className="relative z-10 flex flex-col items-center gap-2" aria-live="polite">
        <p className="font-display m-0 text-3xl font-bold leading-none">{current?.name}</p>
        {total > 1 && (
          <div className="flex items-center gap-2" role="tablist" aria-label={id.frames.title}>
            {frames.map((f, i) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                data-plain
                aria-selected={i === index}
                aria-label={f.name}
                onClick={() => { setDirection(i > index ? 1 : -1); setIndex(i); }}
                className={cn(
                  'size-3.5 rounded-full border-2 border-[var(--color-ink)] transition-colors',
                  i === index ? 'bg-[var(--color-accent)]' : 'bg-transparent',
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-3 pb-2">
        <DoodleButton variant="success" size="xl" onClick={handleConfirmSelection} style={{ width: '100%' }}>
          {id.frames.confirm}
        </DoodleButton>
        <DoodleButton variant="secondary" size="sm" onClick={handleReturnToIdle}>
          {id.frames.returnToIdle}
        </DoodleButton>
      </div>
    </div>
  );
}
