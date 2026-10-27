'use client';

/**
 * Preview screen — shown immediately after all 3 photos are captured.
 *
 * Layout (top → bottom):
 *  1. Header: "Pratinjau Strip"
 *  2. Row of 3 individual photo thumbnails — tappable to select AI sketch source
 *     Active selection shown with accent border + "Untuk sketsa AI" badge
 *  3. Composited strip preview (photos drawn into frame, 600×1800 scaled to fit)
 *     Shows a spinner while compositing runs
 *  4. Action bar: "Foto Ulang" (secondary) + "Cetak" (primary)
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBoothContext } from '../context/BoothContext';
import { motion } from 'framer-motion';
import { DoodleButton, PageTransition } from '@/components/doodle';
import { cn } from '@/lib/utils';
import { id } from '@/i18n/id';
import { composeStrip, composeSheet } from '@/lib/canvas/compose';
import { createBrowserClient } from '@/lib/supabase/client';
import type { SlotGeometry } from '@photovoks/shared-types';

// ── Component ─────────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();

  const captures = state.captures;
  const frame = state.selectedFrame;

  // ── Guard: redirect if captures or frame are missing ─────────────────────
  useEffect(() => {
    const allCaptured = captures.every((c) => c !== null);
    if (!allCaptured || !frame) {
      router.replace('/capture');
    }
  }, [captures, frame, router]);

  // ── Default sketch selection to middle photo on mount (Req 5.2) ──────────
  useEffect(() => {
    dispatch({ type: 'SET_SKETCH_PHOTO', index: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Object URLs for the 3 captured blobs ─────────────────────────────────
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([null, null, null]);

  useEffect(() => {
    const urls = captures.map((blob) =>
      blob ? URL.createObjectURL(blob) : null,
    );
    setPhotoUrls(urls);
    return () => {
      urls.forEach((u) => { if (u) URL.revokeObjectURL(u); });
    };
  }, [captures]);

  // ── Composited strip ──────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stripComposing, setStripComposing] = useState(true);
  const [stripError, setStripError] = useState(false);
  const [stripBlobUrl, setStripBlobUrl] = useState<string | null>(null);

  const compositeStrip = useCallback(async () => {
    if (!frame || captures.some((c) => c === null)) return;

    setStripComposing(true);
    setStripError(false);

    try {
      const supabase = createBrowserClient();
      const { data: urlData, error: urlError } = await supabase.storage
        .from('frames')
        .createSignedUrl(frame.storagePath, 600);

      if (urlError || !urlData?.signedUrl) {
        throw new Error('Failed to generate signed URL for frame');
      }

      const frameResponse = await fetch(urlData.signedUrl);
      if (!frameResponse.ok) throw new Error(`Frame fetch failed: ${frameResponse.status}`);
      const frameBlob = await frameResponse.blob();

      const photoBlobs = captures as Blob[];
      const geometry: SlotGeometry[] = frame.slotGeometry;
      const stripBlob = await composeStrip(photoBlobs, frameBlob, geometry);

      // Also compose the sheet in the background (needed for printing)
      // Use tearLineOffsetPx from event state if available, default to 0
      const tearOffset = state.event?.tearLineOffsetPx ?? 0;
      const sheetBlob = await composeSheet(stripBlob, tearOffset);

      // Store both blobs in context so composing/page.tsx can skip recomposition
      dispatch({ type: 'STORE_COMPOSED_STRIP', stripBlob, sheetBlob });

      // Revoke previous blob URL if any
      setStripBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(stripBlob);
      });

      // Draw to canvas for pixel-accurate preview
      const canvas = canvasRef.current;
      if (canvas) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(img.src);
          setStripComposing(false);
        };
        img.onerror = () => {
          URL.revokeObjectURL(img.src);
          setStripError(true);
          setStripComposing(false);
        };
        img.src = URL.createObjectURL(stripBlob);
      } else {
        setStripComposing(false);
      }
    } catch (err) {
      console.error('Strip composition failed', err);
      setStripError(true);
      setStripComposing(false);
    }
  }, [frame, captures, state.event, dispatch]);

  useEffect(() => {
    void compositeStrip();
    return () => {
      // Cleanup strip blob URL on unmount
      setStripBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [compositeStrip]);

  // ── Sketch photo selection (Req 5.3) ──────────────────────────────────────
  function handlePhotoTap(index: number) {
    dispatch({ type: 'SET_SKETCH_PHOTO', index });
  }

  const selectedIndex = state.selectedPhotoIndex;

  // ── Back — discard photos and return to capture (Req 5.5) ────────────────
  function handleBack() {
    const currentFrame = state.selectedFrame;
    dispatch({ type: 'RESET' });
    if (currentFrame) {
      dispatch({ type: 'SELECT_FRAME', frame: currentFrame });
    }
    router.push('/capture');
  }

  // ── Confirm — proceed to composing/upload (Req 5.4) ──────────────────────
  function handleConfirm() {
    dispatch({ type: 'CONFIRM_PREVIEW' });
    router.push('/composing');
  }

  // ── Error / not-ready guards ──────────────────────────────────────────────
  if (!frame) return null;

  // ── Derived: strip display size (portrait 1:3) ────────────────────────────
  // We render the strip at a fixed display width and let height follow 1:3
  const STRIP_DISPLAY_W = 160;
  const STRIP_DISPLAY_H = STRIP_DISPLAY_W * 3; // 480

  return (
    <PageTransition className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col items-center gap-5 overflow-y-auto px-4 pb-2 pt-5 md:flex-row md:items-center md:justify-center md:gap-14">
        {/* ── Left / top: pick the photo used for the AI sketch ─────────── */}
        <section aria-labelledby="photos-section-label" className="flex flex-col items-center gap-3">
          <h1 className="font-display m-0 text-[clamp(1.8rem,4vw,2.6rem)] font-bold leading-none">{id.preview.title}</h1>
          <p id="photos-section-label" className="font-display m-0 text-xl opacity-75">{id.preview.sketchHint}</p>

          <div className="flex flex-row items-start justify-center gap-4">
            {[0, 1, 2].map((i) => {
              const url = photoUrls[i];
              const isSelected = i === selectedIndex;
              const slotAspect = frame.slotGeometry[i] ? frame.slotGeometry[i].w / frame.slotGeometry[i].h : 3 / 4;
              const thumbW = 104;
              const thumbH = Math.round(thumbW / slotAspect);

              return (
                <motion.button
                  key={i}
                  type="button"
                  data-plain
                  aria-label={`${id.preview.photoLabel(i + 1)}${isSelected ? ' — ' + id.preview.selectedForSketch : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => handlePhotoTap(i)}
                  whileTap={{ scale: 0.95 }}
                  animate={{ rotate: isSelected ? 0 : i % 2 ? 2 : -2, y: isSelected ? -6 : 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                  className={cn(
                    'relative shrink-0 cursor-pointer overflow-hidden border-[2.5px] border-[var(--color-ink)] p-0',
                    '[border-radius:10px_5px_10px_5px/5px_10px_5px_10px] bg-black/10',
                    isSelected
                      ? '[box-shadow:0_0_0_3px_var(--color-accent),4px_6px_0_var(--color-ink)]'
                      : '[box-shadow:3px_4px_0_var(--color-ink)]',
                  )}
                  style={{ width: thumbW, height: thumbH }}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={id.preview.photoLabel(i + 1)} className="block h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-black/10">
                      <span aria-hidden="true" className="font-display text-3xl opacity-40">{i + 1}</span>
                    </div>
                  )}

                  <span aria-hidden="true" className="font-display absolute left-1 top-1 rounded bg-[var(--color-ink)]/70 px-1.5 py-0.5 text-sm leading-none text-white">
                    {i + 1}
                  </span>

                  {isSelected && (
                    <motion.span
                      aria-hidden="true"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="font-display absolute bottom-1 right-1 rounded border-2 border-[var(--color-ink)] bg-[var(--color-accent)] px-1.5 py-0.5 text-base font-bold leading-none text-white"
                    >
                      AI
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* ── Right / bottom: composited strip ──────────────────────────── */}
        <section aria-labelledby="strip-section-label" className="flex flex-col items-center gap-2">
          <p id="strip-section-label" className="font-display m-0 text-xl opacity-75">{id.preview.stripTitle}</p>

          <div
            className="relative shrink-0 overflow-hidden border-[3px] border-[var(--color-ink)] bg-[var(--color-paper)] [border-radius:8px_4px_8px_4px/4px_8px_4px_8px] [box-shadow:5px_7px_0_var(--color-ink)]"
            style={{ width: STRIP_DISPLAY_W, height: STRIP_DISPLAY_H }}
          >
            {/* Canvas always rendered so compositeStrip can draw into it */}
            <canvas
              ref={canvasRef}
              width={STRIP_DISPLAY_W}
              height={STRIP_DISPLAY_H}
              aria-label={id.preview.stripTitle}
              style={{
                display: 'block',
                width: STRIP_DISPLAY_W,
                height: STRIP_DISPLAY_H,
                opacity: stripComposing ? 0 : 1,
                transition: 'opacity 0.25s ease',
              }}
            />

            {stripComposing && !stripError && (
              <div aria-live="polite" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--color-bg)]">
                <div className="doodle-spinner !size-10 !border-[4px]" aria-hidden="true" />
                <p className="font-display m-0 px-2 text-center text-lg opacity-70">{id.preview.composing}</p>
              </div>
            )}

            {stripError && <StripErrorFallback photoUrls={photoUrls} />}
          </div>
        </section>
      </div>

      {/* ── Action bar ───────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-3 border-t-[2.5px] border-[var(--color-ink)] bg-[var(--color-bg)] p-4 sm:flex-row sm:justify-center">
        {/* Foto Ulang — back to capture (Req 5.5) */}
        <DoodleButton variant="secondary" size="lg" onClick={handleBack} disabled={stripComposing} style={{ minWidth: 220 }}>
          {id.preview.back}
        </DoodleButton>
        {/* Cetak — proceed to composing/upload (Req 5.4) */}
        <DoodleButton variant="primary" size="lg" onClick={handleConfirm} disabled={stripComposing} style={{ minWidth: 260 }}>
          {id.preview.confirm}
        </DoodleButton>
      </div>
    </PageTransition>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Fallback when strip compositing fails: the 3 raw photos stacked. */
function StripErrorFallback({ photoUrls }: { photoUrls: (string | null)[] }) {
  return (
    <div className="absolute inset-0 flex flex-col">
      {photoUrls.map((url, i) => (
        <div key={i} className={cn('flex-1 overflow-hidden', i < 2 && 'border-b-2 border-[var(--color-ink)]/20')}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`Foto ${i + 1}`} className="block h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black/10">
              <span className="text-xl text-black/30">{i + 1}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
