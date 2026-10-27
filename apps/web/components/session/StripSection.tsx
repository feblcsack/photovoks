'use client';

import React from 'react';
import { id } from '@/i18n/id';
import { DownloadLink, SessionCard, Spinner } from './SessionCard';

interface StripSectionProps {
  stripSignedUrl: string | null;
}

/** Strip section — always visible (Req 8.2). Download uses native behaviour. */
export function StripSection({ stripSignedUrl }: StripSectionProps) {
  return (
    <SessionCard titleId="strip-section-title" title={id.session.sections.strip.title} tilt={-1.2} taped>
      {stripSignedUrl ? (
        <div className="flex flex-col items-center gap-4 py-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stripSignedUrl}
            alt={id.session.sections.strip.title}
            className="block h-auto w-full max-w-[210px] border-[2.5px] border-[var(--color-ink)] bg-white [box-shadow:4px_6px_0_var(--color-ink)]"
          />
          <DownloadLink href={stripSignedUrl} filename="strip.png">
            {id.session.downloadStrip}
          </DownloadLink>
        </div>
      ) : (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="m-0 text-center text-base opacity-70">{id.composing.processing}</p>
        </div>
      )}
    </SessionCard>
  );
}
