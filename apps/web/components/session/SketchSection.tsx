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
import { DoodleButton } from '@/components/doodle';
import { DownloadLink, SessionCard, Spinner } from './SessionCard';
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
  const t = id.session.sections.sketch;

  // Failed — neutral message, no error details exposed (Req 8.6)
  if (status === 'failed' || status === 'failed_safety') {
    return (
      <SessionCard titleId="sketch-section-title" title={t.title} tilt={0.8}>
        <p className="m-0 py-2 text-center text-base opacity-70">{t.failed}</p>
      </SessionCard>
    );
  }

  const inProgress = (status === null && isGenerating) || status === 'pending' || status === 'processing';

  return (
    <SessionCard titleId="sketch-section-title" title={t.title} tilt={0.8}>
      {/* No sketch yet — CTA to start one */}
      {status === null && !isGenerating && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="m-0 text-center text-base opacity-75">{t.generateHint}</p>
          <DoodleButton
            variant="primary"
            size="default"
            onClick={() => { void onGenerateSketch(); }}
            disabled={isGenerating}
            aria-busy={isGenerating}
          >
            {t.generate}
          </DoodleButton>
        </div>
      )}

      {/* Generating / pending / processing — progress indicator (Req 8.4) */}
      {inProgress && (
        <div className="flex flex-col items-center gap-3 py-2">
          <Spinner />
          <p aria-live="polite" className="m-0 text-center text-base opacity-80">
            {status === 'processing' ? t.processing : t.pending}
          </p>
        </div>
      )}

      {/* Done — image + download (Req 8.5) */}
      {status === 'done' && cardSignedUrl && (
        <div className="flex flex-col items-center gap-4 py-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardSignedUrl}
            alt={t.done}
            className="block h-auto w-full max-w-[220px] border-[2.5px] border-[var(--color-ink)] bg-white [box-shadow:4px_6px_0_var(--color-ink)]"
          />
          <DownloadLink href={cardSignedUrl} filename="sketch.png">
            {t.done}
          </DownloadLink>
        </div>
      )}

      {/* Done but URL not ready yet */}
      {status === 'done' && !cardSignedUrl && (
        <p className="m-0 py-2 text-center text-base opacity-70">{t.pending}</p>
      )}
    </SessionCard>
  );
}
