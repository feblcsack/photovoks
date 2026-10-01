'use client';

/**
 * SketchSection — renders the AI sketch section with all possible status states.
 *
 * Status rendering:
 * - null (no job yet)    → "Generate Sketsa AI" button CTA
 * - pending / processing → spinner + progress message
 * - done                 → sketch image with download link
 * - failed / failed_safety → section hidden with a neutral message (no error details)
 *
 * Requirements: 8.4, 8.5, 8.6
 */

import React from 'react';
import { DoodleButton, DoodleCard } from '@/components/doodle';
import { id } from '@/i18n/id';
import type { SketchJobStatus } from '@photovoks/shared-types';

interface SketchSectionProps {
  /** Current sketch job status; null means no sketch job exists yet */
  status: SketchJobStatus | null;
  /** Signed URL for the 600×1800 sketch card image; only present when status = 'done' */
  cardSignedUrl: string | null;
  /** Called when the visitor taps the "Generate Sketsa AI" button */
  onGenerateSketch: () => Promise<void>;
  /** True while the generate request is in-flight */
  isGenerating: boolean;
}

export function SketchSection({ status, cardSignedUrl, onGenerateSketch, isGenerating }: SketchSectionProps) {
  // Req 8.6: hide entire section on failed or failed_safety
  if (status === 'failed' || status === 'failed_safety') {
    return (
      <section aria-labelledby="sketch-section-title">
        <h2
          id="sketch-section-title"
          style={{
            fontFamily: 'var(--font-display), cursive',
            fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
            color: 'var(--color-ink)',
            margin: '0 0 0.75rem',
            fontWeight: 700,
          }}
        >
          {id.session.sections.sketch.title}
        </h2>
        <DoodleCard>
          <p
            style={{
              fontFamily: 'var(--font-body), sans-serif',
              fontSize: '0.95rem',
              color: 'var(--color-ink)',
              opacity: 0.65,
              textAlign: 'center',
              margin: 0,
              padding: '0.5rem 0',
            }}
          >
            {/* Neutral message — no error details exposed (Req 8.6) */}
            {id.session.sections.sketch.failed}
          </p>
        </DoodleCard>
      </section>
    );
  }

  return (
    <section aria-labelledby="sketch-section-title">
      <h2
        id="sketch-section-title"
        style={{
          fontFamily: 'var(--font-display), cursive',
          fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
          color: 'var(--color-ink)',
          margin: '0 0 0.75rem',
          fontWeight: 700,
        }}
      >
        {id.session.sections.sketch.title}
      </h2>

      <DoodleCard>
        {/* null status AND not generating — show CTA button */}
        {status === null && !isGenerating && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 0',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body), sans-serif',
                fontSize: '0.9rem',
                color: 'var(--color-ink)',
                opacity: 0.7,
                textAlign: 'center',
                margin: 0,
              }}
            >
              {id.session.sections.sketch.generateHint}
            </p>
            <DoodleButton
              variant="primary"
              onClick={() => { void onGenerateSketch(); }}
              disabled={isGenerating}
              aria-busy={isGenerating}
              style={{ fontSize: '1rem', padding: '0.6rem 1.5rem', opacity: isGenerating ? 0.6 : 1 }}
            >
              {id.session.sections.sketch.generate}
            </DoodleButton>
          </div>
        )}

        {/* null status AND generating — show spinner (optimistic pending UI) */}
        {status === null && isGenerating && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 0',
            }}
          >
            <SketchSpinner />
            <p
              aria-live="polite"
              style={{
                fontFamily: 'var(--font-body), sans-serif',
                fontSize: '0.95rem',
                color: 'var(--color-ink)',
                opacity: 0.8,
                textAlign: 'center',
                margin: 0,
              }}
            >
              {id.session.sections.sketch.pending}
            </p>
          </div>
        )}

        {/* pending — show progress indicator (Req 8.4) */}
        {status === 'pending' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 0',
            }}
          >
            <SketchSpinner />
            <p
              aria-live="polite"
              style={{
                fontFamily: 'var(--font-body), sans-serif',
                fontSize: '0.95rem',
                color: 'var(--color-ink)',
                opacity: 0.8,
                textAlign: 'center',
                margin: 0,
              }}
            >
              {id.session.sections.sketch.pending}
            </p>
          </div>
        )}

        {status === 'processing' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 0',
            }}
          >
            <SketchSpinner />
            <p
              aria-live="polite"
              style={{
                fontFamily: 'var(--font-body), sans-serif',
                fontSize: '0.95rem',
                color: 'var(--color-ink)',
                opacity: 0.8,
                textAlign: 'center',
                margin: 0,
              }}
            >
              {id.session.sections.sketch.processing}
            </p>
          </div>
        )}

        {/* done — show sketch image with download (Req 8.5) */}
        {status === 'done' && cardSignedUrl && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <img
              src={cardSignedUrl}
              alt={id.session.sections.sketch.done}
              style={{
                maxWidth: '200px',
                width: '100%',
                height: 'auto',
                display: 'block',
                borderRadius: '2px',
                border: '2px solid var(--color-ink)',
              }}
            />
            <a
              href={cardSignedUrl}
              download="sketch.png"
              style={{
                display: 'inline-block',
                padding: '0.5rem 1.25rem',
                background: 'var(--color-accent)',
                color: '#ffffff',
                fontFamily: 'var(--font-display), cursive',
                fontSize: '1rem',
                borderRadius: '4px',
                textDecoration: 'none',
                fontWeight: 600,
                border: '2px solid var(--color-ink)',
              }}
            >
              {id.session.sections.sketch.done}
            </a>
          </div>
        )}

        {/* done but no URL yet — fallback */}
        {status === 'done' && !cardSignedUrl && (
          <p
            style={{
              fontFamily: 'var(--font-body), sans-serif',
              fontSize: '0.95rem',
              color: 'var(--color-ink)',
              opacity: 0.65,
              textAlign: 'center',
              margin: 0,
              padding: '0.5rem 0',
            }}
          >
            {id.session.sections.sketch.pending}
          </p>
        )}
      </DoodleCard>
    </section>
  );
}

// ── Spinner sub-component ─────────────────────────────────────────────────────

function SketchSpinner() {
  return (
    <>
      <style>{`
        @keyframes sketch-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .sketch-spinner {
          animation: sketch-spin 1.4s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .sketch-spinner { animation: none !important; }
        }
      `}</style>
      <div
        aria-hidden="true"
        className="sketch-spinner"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '4px solid rgba(232, 93, 38, 0.2)',
          borderTopColor: 'var(--color-accent)',
          flexShrink: 0,
        }}
      />
    </>
  );
}
