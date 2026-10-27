'use client';

import React from 'react';
import { id } from '@/i18n/id';
import type { LivePhotoStatus } from '@photovoks/shared-types';
import { SessionCard, Spinner } from './SessionCard';

interface LivePhotoSectionProps {
  status: LivePhotoStatus;
}

/** Live Photo scaffold (Req 8.3, 18.2). Neutral message on failure (Req 8.7). */
export function LivePhotoSection({ status }: LivePhotoSectionProps) {
  const t = id.session.sections.livePhoto;

  return (
    <SessionCard titleId="live-photo-section-title" title={t.title} tilt={1}>
      {status === 'failed' && <p className="m-0 py-2 text-center text-base opacity-70">{t.failed}</p>}

      {(status === 'pending' || status === 'processing') && (
        <div className="flex flex-col items-center gap-3 py-2">
          <Spinner />
          <p aria-live="polite" className="m-0 text-center text-base opacity-80">
            {status === 'pending' ? t.pending : t.processing}
          </p>
        </div>
      )}

      {status === 'done' && (
        /* MVP scaffold: show "done" state without actual video (Req 18.3) */
        <div className="flex flex-col items-center gap-2 py-2">
          <div aria-hidden="true" className="text-4xl leading-none">🎞️</div>
          <p className="m-0 text-center text-lg">{t.done}</p>
        </div>
      )}
    </SessionCard>
  );
}
