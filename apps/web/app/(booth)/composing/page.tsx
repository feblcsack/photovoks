'use client';

/**
 * Composing screen — orchestrates strip/sheet composition and upload.
 *
 * On mount this screen:
 * 1. Creates a session record via POST /api/sessions (before any upload)
 * 2. Runs composeStrip + composeSheet on the captured photos
 * 3. Uploads all 5 assets directly to Supabase Storage via signed URLs
 *    (does NOT route through Vercel)
 * 4. Calls POST /api/sessions/[sessionId]/confirm to create the print job
 * 5. Dispatches UPLOAD_COMPLETE and navigates to /end
 *
 * On network errors at any step, entries are enqueued to IndexedDB with
 * exponential backoff (2s base, max 5 retries). After max retries,
 * UPLOAD_FAILED is dispatched.
 *
 * Requirements: 6.3, 6.4, 6.5, 6.7, 6.8
 */

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBoothContext } from '../context/BoothContext';
import { motion, useReducedMotion } from 'framer-motion';
import { DoodleButton, DoodleBackdrop } from '@/components/doodle';
import { id } from '@/i18n/id';
import { composeStrip, composeSheet } from '@/lib/canvas/compose';
import { enqueue } from '@/lib/offline/queue';
import { createBrowserClient } from '@/lib/supabase/client';
import type { SlotGeometry } from '@photovoks/shared-types';

// ── Client-side structured logger ─────────────────────────────────────────────

function clientLog(entry: {
  level: 'info' | 'warn' | 'error';
  event: string;
  sessionId?: string;
  details?: Record<string, unknown>;
}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadStep =
  | 'idle'
  | 'creating_session'
  | 'composing'
  | 'uploading'
  | 'confirming'
  | 'done'
  | 'error';

interface SessionCreateResponse {
  sessionId: string;
  sessionToken: string;
  uploadUrls: {
    photo0: string;
    photo1: string;
    photo2: string;
    strip: string;
    sheet: string;
  };
}

interface ConfirmResponse {
  printJobId: string;
  sketchJobId: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async operation with exponential backoff.
 * Throws the last error if all retries are exhausted.
 *
 * @param operation   Async function to execute.
 * @param maxRetries  Maximum number of retries (0 = no retry, 1 attempt total).
 */
async function withBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Uploads a Blob to a signed Supabase Storage URL via a PUT request.
 * Does NOT route through Vercel API routes (Requirement 6.3).
 */
async function uploadToSignedUrl(
  signedUrl: string,
  blob: Blob,
  contentType: string,
): Promise<void> {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(
      `Upload failed: ${response.status} ${response.statusText}`,
    );
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ComposingPage() {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();

  const [step, setStep] = useState<UploadStep>('idle');

  // Guard against double-execution in React Strict Mode
  const hasStarted = useRef(false);

  // ── Guard: redirect if required state is missing ──────────────────────────

  const captures = state.captures;
  const frame = state.selectedFrame;
  const event = state.event;

  // ── Upload orchestration ──────────────────────────────────────────────────

  async function runUploadOrchestration(): Promise<void> {
    const allCaptured = captures.every((c) => c !== null);
    if (!allCaptured || !frame || !event) return;

    const photoBlobs = captures as Blob[];
    const geometry: SlotGeometry[] = frame.slotGeometry;

    // ── Step 1: Create session record FIRST (Requirement 6.4) ──────────────

    setStep('creating_session');

    let sessionData: SessionCreateResponse;
    try {
      sessionData = await withBackoff(async () => {
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: event.id }),
        });

        if (!response.ok) {
          throw new Error(`Session creation failed: ${response.status}`);
        }

        return response.json() as Promise<SessionCreateResponse>;
      });
    } catch (err) {
      // Enqueue to IndexedDB for later retry (Requirement 6.7)
      await enqueue({
        type: 'session',
        payload: { eventId: event.id },
        sessionId: '',
        retries: 0,
      }).catch(console.error);
      throw err;
    }

    const { sessionId, sessionToken, uploadUrls } = sessionData;

    // ── Log photos captured lifecycle event (Requirement 16.1) ────────────
    clientLog({
      level: 'info',
      event: 'session.photos_captured',
      sessionId,
      details: { photoCount: photoBlobs.length },
    });

    // ── Step 2: Compose strip and sheet ────────────────────────────────────

    setStep('composing');

    let stripBlob: Blob;
    let sheetBlob: Blob;

    // Use pre-composed blobs from the preview screen if available —
    // this eliminates duplicate canvas work and makes the flow feel instant.
    if (state.composedStripBlob && state.composedSheetBlob) {
      stripBlob = state.composedStripBlob;
      sheetBlob = state.composedSheetBlob;

      clientLog({
        level: 'info',
        event: 'session.strip_composed',
        sessionId,
        details: { frameId: frame.id, source: 'preview_cache' },
      });
    } else {
      // Fallback: compose from scratch (e.g. user navigated directly to /composing)
      const supabase = createBrowserClient();
      const { data: frameUrlData, error: frameUrlError } = await supabase.storage
        .from('frames')
        .createSignedUrl(frame.storagePath, 600);

      if (frameUrlError || !frameUrlData?.signedUrl) {
        throw new Error('Failed to generate signed URL for frame PNG');
      }

      const frameResponse = await fetch(frameUrlData.signedUrl);
      if (!frameResponse.ok) {
        throw new Error(`Failed to fetch frame PNG: ${frameResponse.status}`);
      }
      const frameBlob = await frameResponse.blob();

      stripBlob = await composeStrip(photoBlobs, frameBlob, geometry);
      sheetBlob = await composeSheet(stripBlob, event.tearLineOffsetPx);

      clientLog({
        level: 'info',
        event: 'session.strip_composed',
        sessionId,
        details: { frameId: frame.id, source: 'composing_page' },
      });
    }

    // ── Step 3: Upload 5 assets directly to Supabase Storage ───────────────
    // Does NOT route through Vercel (Requirement 6.3)

    setStep('uploading');

    const uploads: Array<{ url: string; blob: Blob; contentType: string; label: string }> = [
      { url: uploadUrls.photo0, blob: photoBlobs[0], contentType: 'image/png', label: 'photo_0' },
      { url: uploadUrls.photo1, blob: photoBlobs[1], contentType: 'image/png', label: 'photo_1' },
      { url: uploadUrls.photo2, blob: photoBlobs[2], contentType: 'image/png', label: 'photo_2' },
      { url: uploadUrls.strip,  blob: stripBlob,     contentType: 'image/png', label: 'strip'   },
      { url: uploadUrls.sheet,  blob: sheetBlob,     contentType: 'image/jpeg', label: 'sheet'  },
    ];

    for (const upload of uploads) {
      try {
        await withBackoff(() =>
          uploadToSignedUrl(upload.url, upload.blob, upload.contentType),
        );
      } catch (err) {
        // Enqueue failed upload for offline retry (Requirement 6.7)
        await enqueue({
          type: 'upload',
          payload: {
            signedUrl: upload.url,
            label: upload.label,
            sessionId,
            contentType: upload.contentType,
          },
          sessionId,
          retries: 0,
        }).catch(console.error);
        throw err;
      }
    }

    // ── Log upload lifecycle event (Requirement 16.1) ──────────────────────
    clientLog({
      level: 'info',
      event: 'session.uploaded',
      sessionId,
      details: { assetCount: uploads.length },
    });

    // ── Step 4: Confirm the session (creates print job + sketch job) ────────
    // Print job creation is idempotent per Requirement 6.8

    setStep('confirming');

    let confirmData: ConfirmResponse;
    try {
      confirmData = await withBackoff(async () => {
        const response = await fetch(`/api/sessions/${sessionId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Confirm failed: ${response.status}`);
        }

        return response.json() as Promise<ConfirmResponse>;
      });
    } catch (err) {
      // Enqueue confirm for retry
      await enqueue({
        type: 'confirm',
        payload: { sessionId, sessionToken },
        sessionId,
        retries: 0,
      }).catch(console.error);
      throw err;
    }

    // ── Step 5: Success ─────────────────────────────────────────────────────

    setStep('done');
    dispatch({
      type: 'UPLOAD_COMPLETE',
      printJobId: confirmData.printJobId,
      sessionId,
      sessionToken,
    });
    router.push('/end');
  }

  // ── Guard: redirect / kick off orchestration ──────────────────────────────

  useEffect(() => {
    const allCaptured = captures.every((c) => c !== null);
    if (!allCaptured || !frame || !event) {
      router.replace('/');
      return;
    }

    if (hasStarted.current) return;
    hasStarted.current = true;

    runUploadOrchestration().catch((err) => {
      console.error('Upload orchestration failed', err);
      setStep('error');
      dispatch({ type: 'UPLOAD_FAILED', error: err instanceof Error ? err : new Error(String(err)) });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Return to idle (error recovery) ──────────────────────────────────────

  function handleReturnToIdle() {
    dispatch({ type: 'RESET' });
    router.push('/');
  }

  // ── Step label mapping ────────────────────────────────────────────────────

  function getStepLabel(currentStep: UploadStep): string {
    switch (currentStep) {
      case 'creating_session':
        return id.composing.processing;
      case 'composing':
        return id.composing.title;
      case 'uploading':
        return id.composing.uploading;
      case 'confirming':
        return id.composing.processing;
      default:
        return id.composing.processing;
    }
  }

  // ── Render: error state ───────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8">
        <DoodleBackdrop density="calm" />
        <p className="relative z-10 m-0 max-w-sm text-center text-xl leading-relaxed">{id.errors.uploadFailedMaxRetries}</p>
        {/* Recovery action (Requirement 13.5) */}
        <DoodleButton variant="primary" onClick={handleReturnToIdle} className="relative z-10">
          {id.errors.returnToIdle}
        </DoodleButton>
      </div>
    );
  }

  // ── Render: loading / progress state ─────────────────────────────────────
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <DoodleBackdrop density="calm" />
      <ComposingSpinner />
      <motion.p
        key={getStepLabel(step)}
        aria-live="polite"
        aria-atomic="true"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display relative z-10 m-0 text-center text-[clamp(1.6rem,4vw,2.4rem)] font-bold"
      >
        {getStepLabel(step)}
      </motion.p>
    </div>
  );
}

// ── Spinner sub-component ─────────────────────────────────────────────────────

/** A little camera that wobbles while the strip uploads. Static for reduced motion. */
function ComposingSpinner() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      data-animate
      className="relative z-10 grid size-24 place-items-center rounded-full border-[3px] border-[var(--color-ink)] bg-[var(--color-accent-soft)] [box-shadow:4px_5px_0_var(--color-ink)]"
      animate={reduce ? undefined : { rotate: [-6, 6, -6], scale: [1, 1.06, 1] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg width="52" height="44" viewBox="0 0 40 34" fill="none" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="10" width="36" height="22" rx="4" />
        <circle cx="20" cy="21" r="6" />
        <path d="M13 10 L15 4 L25 4 L27 10" />
      </svg>
    </motion.div>
  );
}
