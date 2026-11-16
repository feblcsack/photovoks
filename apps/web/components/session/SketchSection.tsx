'use client';

/**
 * SketchSection — the "Doodle AI" card on the visitor's session page.
 *
 *  null                 → CTA "Buat Doodle AI"
 *  pending / processing → spinner + progress text
 *  done                 → doodle image + download
 *  failed               → friendly message (+ retry when allowed)
 *  failed_safety        → friendly message, no retry
 */
import React from 'react';
import { DoodleButton } from '@/components/doodle';
import { DownloadLink, SessionCard, Spinner } from './SessionCard';
import { id } from '@/i18n/id';
import type { SketchJobStatus } from '@photovoks/shared-types';

interface SketchSectionProps {
  aiEnabled: boolean;
  status: SketchJobStatus | null;
  errorReason: string | null;
  canRetry: boolean;
  cardSignedUrl: string | null;
  onGenerateSketch: () => Promise<void>;
  isGenerating: boolean;
  requestError: boolean;
}

export function SketchSection({
  aiEnabled,
  status,
  errorReason,
  canRetry,
  cardSignedUrl,
  onGenerateSketch,
  isGenerating,
  requestError,
}: SketchSectionProps) {
  const t = id.session.sections.sketch;

  if (!aiEnabled && status !== 'done') {
    return (
      <SessionCard titleId="sketch-section-title" title={t.title} tilt={0.8}>
        <p className="m-0 py-2 text-center text-base opacity-70">{t.disabled}</p>
      </SessionCard>
    );
  }

  if (status === 'failed' || status === 'failed_safety') {
    const message =
      status === 'failed_safety' ? t.failedSafety : errorReason === 'daily_cap_reached' ? t.dailyCap : t.failed;
    const retryable = status === 'failed' && errorReason !== 'daily_cap_reached' && canRetry;
    return (
      <SessionCard titleId="sketch-section-title" title={t.title} tilt={0.8}>
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="m-0 text-center text-base opacity-75">{message}</p>
          {retryable && (
            <DoodleButton
              variant="secondary"
              size="default"
              onClick={() => void onGenerateSketch()}
              disabled={isGenerating}
              aria-busy={isGenerating}
            >
              {t.retry}
            </DoodleButton>
          )}
        </div>
      </SessionCard>
    );
  }

  const inProgress = isGenerating || status === 'pending' || status === 'processing';

  return (
    <SessionCard titleId="sketch-section-title" title={t.title} tilt={0.8}>
      {status === null && !isGenerating && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="m-0 text-center text-base opacity-75">{t.generateHint}</p>
          <DoodleButton variant="primary" size="default" onClick={() => void onGenerateSketch()}>
            {t.generate}
          </DoodleButton>
          {requestError && (
            <p role="alert" className="m-0 text-center text-sm text-[var(--color-danger)]">
              {t.failed}
            </p>
          )}
        </div>
      )}

      {inProgress && status !== 'done' && (
        <div className="flex flex-col items-center gap-3 py-2">
          <Spinner />
          <p aria-live="polite" className="m-0 text-center text-base opacity-80">
            {status === 'pending' ? t.pending : t.processing}
          </p>
        </div>
      )}

      {status === 'done' && cardSignedUrl && (
        <div className="flex flex-col items-center gap-4 py-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardSignedUrl}
            alt={t.title}
            className="block h-auto w-full max-w-[220px] border-[2.5px] border-[var(--color-ink)] bg-white [box-shadow:4px_6px_0_var(--color-ink)]"
          />
          <DownloadLink href={cardSignedUrl} filename="photovoks-doodle.png">
            {t.done}
          </DownloadLink>
        </div>
      )}

      {status === 'done' && !cardSignedUrl && (
        <p className="m-0 py-2 text-center text-base opacity-70">{t.pending}</p>
      )}
    </SessionCard>
  );
}
