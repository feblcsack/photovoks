'use client';

/**
 * Capture screen — the heart of the booth flow.
 *
 * Renders a live camera preview with a transparent crop guide overlay that
 * matches the selected frame's current slot geometry. The visitor captures
 * three photos (one per slot) in sequence. Each capture is preceded by a
 * 3-2-1 countdown. After all three slots are captured the booth navigates
 * to /preview.
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBoothContext } from '../context/BoothContext';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DoodleButton } from '@/components/doodle';
import { cn } from '@/lib/utils';
import { id } from '@/i18n/id';
import { startCamera, captureFrame, stopCamera } from '@/lib/camera';
import type { SlotGeometry } from '@photovoks/shared-types';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_SLOTS = 3;
const COUNTDOWN_FROM = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

type CapturePhase =
  | 'idle'        // waiting for visitor to tap capture
  | 'countdown'   // 3-2-1 in progress
  | 'captured';   // photo taken, showing "Berikutnya" button

// ── Component ─────────────────────────────────────────────────────────────────

export default function CapturePage() {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();

  // ── Guard: redirect if no frame has been selected ─────────────────────────

  const frame = state.selectedFrame;

  // We check inside an effect to avoid a hydration mismatch from an immediate
  // redirect during render.
  useEffect(() => {
    if (!frame) {
      router.replace('/frames');
    }
  }, [frame, router]);

  // ── Camera state ──────────────────────────────────────────────────────────

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── Slot & capture state ──────────────────────────────────────────────────

  /** The index of the slot currently being captured (0, 1, or 2) */
  const [currentSlot, setCurrentSlot] = useState<number>(0);

  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_FROM);

  // ── Crop guide overlay geometry (pixel values) ────────────────────────────

  /**
   * Pixel rect of the crop guide, computed from slot fractions × rendered
   * video element dimensions. Recalculated on resize.
   */
  const [overlayRect, setOverlayRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // ── Camera start / stop ───────────────────────────────────────────────────

  const initCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await startCamera({ facingMode: 'user' });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera start failed', err);
      setCameraError(id.errors.cameraPermissionDenied);
    }
  }, []);

  useEffect(() => {
    if (!frame) return; // don't start camera if no frame selected

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void initCamera();

    return () => {
      if (streamRef.current) {
        stopCamera(streamRef.current);
        streamRef.current = null;
      }
    };
  }, [frame, initCamera]);

  // ── Crop guide overlay calculation ────────────────────────────────────────

  /**
   * Computes the pixel position of the crop overlay on the rendered
   * `<video>` element. Called on mount and on every resize.
   */
  const recalculateOverlay = useCallback(() => {
    if (!frame || !videoRef.current) return;

    const slot: SlotGeometry = frame.slotGeometry[currentSlot];
    if (!slot) return;

    const videoEl = videoRef.current;
    const rect = videoEl.getBoundingClientRect();

    // The video element may use object-fit: cover internally, but since we
    // size the element to fill the container we use its rendered dimensions
    // directly for the overlay.
    setOverlayRect({
      left: slot.x * rect.width,
      top: slot.y * rect.height,
      width: slot.w * rect.width,
      height: slot.h * rect.height,
    });
  }, [frame, currentSlot]);

  // Recalculate when video metadata loads (stream dimensions are now known)
  function handleVideoMetadata() {
    recalculateOverlay();
  }

  // Recalculate on window resize
  useEffect(() => {
    window.addEventListener('resize', recalculateOverlay);
    recalculateOverlay(); // initial calc
    return () => window.removeEventListener('resize', recalculateOverlay);
  }, [recalculateOverlay]);

  // ── Countdown & capture logic ─────────────────────────────────────────────

  /**
   * Draws the current video frame to canvas (via camera module) and
   * dispatches CAPTURE_PHOTO with the resulting Blob.
   */
  const doCapture = useCallback(async () => {
    if (!videoRef.current || !frame) return;

    const slot: SlotGeometry = frame.slotGeometry[currentSlot];

    try {
      const blob = await captureFrame(videoRef.current, slot);
      dispatch({ type: 'CAPTURE_PHOTO', slotIndex: currentSlot, blob });
      setPhase('captured');
    } catch (err) {
      console.error('captureFrame failed', err);
      setCameraError(id.errors.generic);
      setPhase('idle');
    }
  }, [frame, currentSlot, dispatch]);

  /**
   * Starts the 3-2-1 countdown and captures the frame after it completes.
   * The countdown ticks once per second.
   */
  const startCountdown = useCallback(() => {
    if (phase !== 'idle') return;

    setPhase('countdown');
    setCountdown(COUNTDOWN_FROM);

    let remaining = COUNTDOWN_FROM;

    const tick = () => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
        setTimeout(tick, 1000);
      } else {
        // Countdown complete — capture the frame
        setCountdown(0);
        doCapture();
      }
    };

    setTimeout(tick, 1000);
  }, [phase, doCapture]);

  // ── Advance to next slot ──────────────────────────────────────────────────

  function handleNext() {
    const nextSlot = currentSlot + 1;

    if (nextSlot >= TOTAL_SLOTS) {
      // All three photos captured — reducer already set step to 'preview'
      // when the last CAPTURE_PHOTO was dispatched. Navigate there.
      router.push('/preview');
    } else {
      setCurrentSlot(nextSlot);
      setPhase('idle');
      setCountdown(COUNTDOWN_FROM);
      // Recalculate overlay for the new slot
      // (will be triggered by the recalculateOverlay dependency on currentSlot)
    }
  }

  // ── Captured photo thumbnail URLs ────────────────────────────────────────

  /**
   * Object URLs for each captured Blob so we can render <img> thumbnails.
   * Revoked in the cleanup to avoid memory leaks.
   */
  const [thumbnailUrls, setThumbnailUrls] = useState<(string | null)[]>([null, null, null]);

  useEffect(() => {
    const urls = state.captures.map((blob) =>
      blob ? URL.createObjectURL(blob) : null,
    );
    setThumbnailUrls(urls);

    return () => {
      urls.forEach((u) => { if (u) URL.revokeObjectURL(u); });
    };
  }, [state.captures]);

  // ── Retake logic ─────────────────────────────────────────────────────────

  /**
   * Dispatches USE_RETAKE for the current slot and resets the capture phase
   * back to idle, allowing the visitor to re-capture. The next CAPTURE_PHOTO
   * dispatch will overwrite the existing blob for this slot.
   *
   * Requirements: 4.4, 4.5, 4.6
   */
  function handleRetake() {
    dispatch({ type: 'USE_RETAKE', slotIndex: currentSlot });
    setPhase('idle');
  }

  // ── Return to idle ────────────────────────────────────────────────────────

  function handleReturnToIdle() {
    dispatch({ type: 'RESET' });
    router.push('/');
  }

  // ── Render: camera permission error state ────────────────────────────────

  if (cameraError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
        <p className="m-0 max-w-sm text-center text-xl leading-relaxed">{cameraError}</p>
        {/* Recovery action — Req 13.5 */}
        <DoodleButton variant="primary" onClick={handleReturnToIdle}>
          {id.errors.returnToIdle}
        </DoodleButton>
      </div>
    );
  }

  // ── Render: no frame guard ────────────────────────────────────────────────

  if (!frame) {
    return null;
  }

  const slot: SlotGeometry = frame.slotGeometry[currentSlot];

  // ── Render: main capture UI ───────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-[var(--color-ink)]">
      {/* Header bar */}
      <div className="flex w-full shrink-0 items-center justify-center gap-3 border-b-[2.5px] border-[var(--color-ink)] bg-[var(--color-bg)] px-4 py-2.5">
        <ProgressDots current={currentSlot} total={TOTAL_SLOTS} done={thumbnailUrls.map((u) => u !== null)} />
        <p className="font-display m-0 text-2xl font-bold leading-none">
          {id.capture.slotProgress(currentSlot + 1, TOTAL_SLOTS)}
        </p>
      </div>

      {/* Camera preview area (live feed stays un-stylised: Req 17.2) */}
      <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-[#111]">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={handleVideoMetadata}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {/* Crop guide overlay (Req 4.1) */}
        {overlayRect && slot && <CropGuideOverlay rect={overlayRect} />}

        {/* 3-2-1 countdown (Req 4.2) */}
        <AnimatePresence>
          {phase === 'countdown' && countdown > 0 && <CountdownOverlay key={countdown} count={countdown} />}
        </AnimatePresence>

        {/* Shutter flash when the photo is taken */}
        <ShutterFlash trigger={phase === 'captured'} />

        {/* Captured thumbnails (Req 4.3) */}
        <CapturedThumbnails thumbnailUrls={thumbnailUrls} currentSlot={currentSlot} total={TOTAL_SLOTS} />
      </div>

      {/* Bottom action bar */}
      <div className="flex min-h-[92px] w-full shrink-0 items-center justify-center gap-4 border-t-[2.5px] border-[var(--color-ink)] bg-[var(--color-bg)] px-4 py-4">
        {phase === 'idle' && (
          <DoodleButton variant="primary" size="xl" onClick={startCountdown}>
            {/* Shutter label reuses the countdown string at its initial value */}
            {id.capture.countdown(COUNTDOWN_FROM)}
          </DoodleButton>
        )}

        {phase === 'countdown' && (
          <span aria-live="assertive" className="font-display min-w-12 text-center text-4xl font-bold">
            {countdown > 0 ? id.capture.countdown(countdown) : ''}
          </span>
        )}

        {phase === 'captured' && (
          <>
            {/* Retake only if not yet used for this slot (Req 4.4, 4.5, 4.6) */}
            {!state.retakesUsed[currentSlot] && (
              <DoodleButton variant="secondary" size="lg" onClick={handleRetake}>
                {id.capture.retake}
              </DoodleButton>
            )}
            {/* Always show advance button (Req 4.7) */}
            <DoodleButton variant="primary" size="lg" onClick={handleNext}>
              {id.capture.next}
            </DoodleButton>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressDots({ current, total, done }: { current: number; total: number; done: boolean[] }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'size-4 rounded-full border-2 border-[var(--color-ink)] transition-colors',
            done[i] ? 'bg-[var(--color-accent)]' : i === current ? 'bg-[var(--color-accent-soft)]' : 'bg-transparent',
          )}
        />
      ))}
    </div>
  );
}

/** White flash — a quick "click" feedback after the capture. */
function ShutterFlash({ trigger }: { trigger: boolean }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <AnimatePresence>
      {trigger && (
        <motion.div
          key="flash"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 bg-white"
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * Thumbnails of captured photos, bottom-left of the camera area (Req 4.3).
 * The slot being captured pulses.
 */
function CapturedThumbnails({
  thumbnailUrls,
  currentSlot,
  total,
}: {
  thumbnailUrls: (string | null)[];
  currentSlot: number;
  total: number;
}) {
  return (
    <div
      aria-label="Foto yang sudah diambil"
      className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-row gap-2"
    >
      {Array.from({ length: total }).map((_, i) => {
        const url = thumbnailUrls[i] ?? null;
        const isCurrent = i === currentSlot;
        const isCaptured = url !== null;

        return (
          <motion.div
            key={i}
            aria-label={isCaptured ? `Foto ${i + 1}` : `Slot ${i + 1} belum diambil`}
            className={cn(
              'flex h-[74px] w-14 shrink-0 items-center justify-center overflow-hidden border-[2.5px] bg-black/50',
              '[border-radius:8px_4px_8px_4px/4px_8px_4px_8px]',
              isCurrent ? 'border-white' : 'border-white/40',
            )}
            animate={isCurrent && !isCaptured ? { scale: [1, 1.07, 1] } : { scale: 1 }}
            transition={isCurrent && !isCaptured ? { duration: 1.2, repeat: Infinity } : { type: 'spring', stiffness: 300, damping: 18 }}
          >
            {isCaptured ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={`Foto ${i + 1}`} className="block h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true" className={cn('font-display select-none text-2xl leading-none', isCurrent ? 'text-white' : 'text-white/40')}>
                {i + 1}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Crop guide: dark mask with a clear cut-out matching the slot geometry,
 * plus a dashed hand-drawn corner outline (Req 4.1).
 */
function CropGuideOverlay({ rect }: { rect: { left: number; top: number; width: number; height: number } }) {
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%,
            0% ${rect.top}px,
            ${rect.left}px ${rect.top}px,
            ${rect.left}px ${rect.top + rect.height}px,
            ${rect.left + rect.width}px ${rect.top + rect.height}px,
            ${rect.left + rect.width}px ${rect.top}px,
            0% ${rect.top}px
          )`,
          background: 'rgba(0, 0, 0, 0.55)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          border: '3px dashed rgba(255, 255, 255, 0.9)',
          borderRadius: '10px 6px 12px 6px / 6px 12px 6px 10px',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

/** Big pop-in number; AnimatePresence remounts it every tick (Req 4.2). */
function CountdownOverlay({ count }: { count: number }) {
  return (
    <motion.div
      aria-live="assertive"
      aria-atomic="true"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.4 }}
      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
    >
      <span
        data-animate
        className="font-display select-none text-white font-bold leading-none [font-size:clamp(7rem,22vw,14rem)] [paint-order:stroke_fill] [-webkit-text-stroke:10px_var(--color-ink)] [text-shadow:6px_8px_0_var(--color-accent)]"
      >
        {id.capture.countdown(count)}
      </span>
    </motion.div>
  );
}
