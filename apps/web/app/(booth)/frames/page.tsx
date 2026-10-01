'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBoothContext } from '../context/BoothContext';
import { DoodleButton, DoodleCard } from '@/components/doodle';
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

  /** The frame currently being previewed in the overlay (null = no overlay) */
  const [previewFrame, setPreviewFrame] = useState<FrameWithUrl | null>(null);

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

  function handleThumbnailTap(frame: FrameWithUrl) {
    // Show the full-frame preview overlay before confirming (Req 3.2)
    setPreviewFrame(frame);
  }

  function handleConfirmSelection() {
    if (!previewFrame) return;
    // Dispatch SELECT_FRAME — sets step to 'capture' in reducer (Req 3.3)
    dispatch({ type: 'SELECT_FRAME', frame: previewFrame });
    router.push('/capture');
  }

  function handleCancelPreview() {
    setPreviewFrame(null);
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--color-bg)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-display), cursive',
            fontSize: '1.5rem',
            color: 'var(--color-ink)',
          }}
        >
          {/* Loading indicator — uses composing.processing text (generic loading) */}
          {id.composing.processing}
        </p>
      </div>
    );
  }

  if (showError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--color-bg)',
          gap: '2rem',
          padding: '2rem',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body), sans-serif',
            fontSize: '1.1rem',
            color: 'var(--color-ink)',
            textAlign: 'center',
          }}
        >
          {id.frames.noFrames}
        </p>
        <DoodleButton variant="secondary" onClick={handleReturnToIdle}>
          {id.frames.returnToIdle}
        </DoodleButton>
      </div>
    );
  }

  // ── Main frame list + preview overlay ────────────────────────────────────────

  return (
    <>
      {/* ── Frame selection screen ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'var(--color-bg)',
          padding: '2rem 1rem',
          boxSizing: 'border-box',
          gap: '2rem',
        }}
      >
        {/* Title + hint header */}
        <div
          style={{
            position: 'relative',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {/* Decorative star — top-left of title */}
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            style={{
              position: 'absolute',
              top: '-12px',
              left: '-20px',
              opacity: 0.55,
            }}
          >
            <path
              d="M11 1 L13 8 L20 8 L14.5 12.5 L16.5 20 L11 16 L5.5 20 L7.5 12.5 L2 8 L9 8 Z"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>

          {/* Decorative star — top-right of title */}
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-18px',
              opacity: 0.5,
            }}
          >
            <path
              d="M9 1 L10.5 6.5 L16 6.5 L11.5 10 L13 16 L9 13 L5 16 L6.5 10 L2 6.5 L7.5 6.5 Z"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>

          <h1
            style={{
              fontFamily: 'var(--font-display), cursive',
              fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
              color: 'var(--color-ink)',
              margin: 0,
              textAlign: 'center',
            }}
          >
            {id.frames.title}
          </h1>

          {/* Hint text below title */}
          <p
            style={{
              fontFamily: 'var(--font-display), cursive',
              fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
              color: 'var(--color-ink)',
              opacity: 0.7,
              margin: 0,
              textAlign: 'center',
            }}
          >
            {id.frames.hint}
          </p>
        </div>

        {/* Film-strip thumbnail grid — horizontal scroll on small screens */}
        <div
          role="list"
          aria-label={id.frames.title}
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '1.25rem',
            overflowX: 'auto',
            padding: '0.5rem 0.25rem',
            maxWidth: '100%',
            alignItems: 'flex-start',
            // Smooth momentum scroll on iOS
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {frames.map((frame) => (
            <FrameThumbnail
              key={frame.id}
              frame={frame}
              onTap={() => handleThumbnailTap(frame)}
            />
          ))}
        </div>
      </div>

      {/* ── Full-frame preview overlay (Req 3.2) ──────────────────────────── */}
      {previewFrame && (
        <FramePreviewOverlay
          frame={previewFrame}
          onConfirm={handleConfirmSelection}
          onCancel={handleCancelPreview}
        />
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FrameThumbnailProps {
  frame: FrameWithUrl;
  onTap: () => void;
}

/**
 * A film-strip-style thumbnail cutout for a single frame.
 * Tapping opens the full-frame preview overlay.
 */
function FrameThumbnail({ frame, onTap }: FrameThumbnailProps) {
  return (
    <div
      role="listitem"
      style={{
        flexShrink: 0,
        width: '140px',
        cursor: 'pointer',
      }}
    >
      <DoodleCard>
        <>
          <style>{`
            .frame-thumb-btn { transition: transform 0.18s ease; }
            .frame-thumb-btn:hover, .frame-thumb-btn:focus-visible { transform: scale(1.04); }
            @media (prefers-reduced-motion: reduce) {
              .frame-thumb-btn { transition: none !important; transform: none !important; }
            }
          `}</style>
          <button
            className="frame-thumb-btn"
            onClick={onTap}
            aria-label={frame.name}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              width: '100%',
            }}
          >
            {/* Frame image — portrait aspect ratio mimics 600×1800 strip */}
            <div
              style={{
                width: '120px',
                aspectRatio: '1 / 3',
                overflow: 'hidden',
                background: '#e0ddd4',
                position: 'relative',
              }}
            >
              {frame.signedUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={frame.signedUrl}
                  alt={frame.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                /* Placeholder when signed URL is unavailable */
                <div
                  aria-hidden="true"
                  style={{
                    width: '100%',
                    height: '100%',
                    background: '#d0cdc4',
                  }}
                />
              )}
            </div>

            {/* Frame name */}
            <span
              style={{
                fontFamily: 'var(--font-display), cursive',
                fontSize: '0.85rem',
                color: 'var(--color-ink)',
                textAlign: 'center',
                wordBreak: 'break-word',
              }}
            >
              {frame.name}
            </span>
          </button>
        </>
      </DoodleCard>
    </div>
  );
}

interface FramePreviewOverlayProps {
  frame: FrameWithUrl;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Full-screen overlay showing the selected frame at a larger size.
 * The visitor must tap "Pilih Bingkai Ini" to confirm selection.
 * Tapping "Kembali" dismisses the overlay without selecting.
 */
function FramePreviewOverlay({ frame, onConfirm, onCancel }: FramePreviewOverlayProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={id.frames.preview}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '2rem 1rem',
        gap: '1.5rem',
      }}
    >
      {/* Frame name */}
      <h2
        style={{
          fontFamily: 'var(--font-display), cursive',
          fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
          color: '#ffffff',
          margin: 0,
          textAlign: 'center',
        }}
      >
        {frame.name}
      </h2>

      {/* Full preview image — portrait, up to 60vh tall */}
      <div
        style={{
          maxHeight: '60vh',
          maxWidth: '200px',
          aspectRatio: '1 / 3',
          overflow: 'hidden',
          background: '#2a2a2a',
        }}
      >
        {frame.signedUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={frame.signedUrl}
            alt={frame.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{ width: '100%', height: '100%', background: '#3a3a3a' }}
          />
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          alignItems: 'center',
          width: '100%',
          maxWidth: '280px',
        }}
      >
        {/* Confirm — dispatches SELECT_FRAME and navigates to capture */}
        <DoodleButton
          variant="primary"
          onClick={onConfirm}
          style={{
            fontSize: 'clamp(1.1rem, 3vw, 1.4rem)',
            padding: '0.7rem 2rem',
            width: '100%',
          }}
        >
          {id.frames.confirm}
        </DoodleButton>

        {/* Back — dismiss overlay without selecting */}
        <DoodleButton
          variant="secondary"
          onClick={onCancel}
          style={{
            fontSize: '1rem',
            padding: '0.5rem 1.5rem',
            width: '100%',
            color: '#ffffff',
          }}
        >
          {id.frames.back}
        </DoodleButton>
      </div>
    </div>
  );
}
