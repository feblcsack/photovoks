'use client';

/**
 * SessionView — visitor's page after scanning the QR code.
 *
 * Live updates come from polling GET /api/sessions/[token]/status while
 * something is in progress (doodle generating, print queued). Polling works
 * with RLS fully locked down — no anon database access is needed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Float, Heart, Sparkle, Star } from '@/components/doodle';
import { id } from '@/i18n/id';
import type { SessionStatusData } from '@/lib/session-status';

import { StripSection } from './StripSection';
import { SketchSection } from './SketchSection';
import { RequestPrintButton } from './RequestPrintButton';

const FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 20_000;

interface SessionViewProps {
  initialData: SessionStatusData;
  /** Raw token from the URL — the visitor's only credential */
  token: string;
}

export function SessionView({ initialData, token }: SessionViewProps) {
  const [data, setData] = useState<SessionStatusData>(initialData);
  const [isGeneratingSketch, setIsGeneratingSketch] = useState(false);
  const [sketchRequestError, setSketchRequestError] = useState(false);
  const reduce = useReducedMotion();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(token)}/status`, { cache: 'no-store' });
      if (res.ok) setData((await res.json()) as SessionStatusData);
    } catch {
      // offline — keep last known state
    }
  }, [token]);

  const sketchStatus = data.sketchJob?.status ?? null;
  const sketchPrintStatus = data.sketchPrintJob?.status ?? null;
  const busy =
    isGeneratingSketch ||
    sketchStatus === 'pending' ||
    sketchStatus === 'processing' ||
    sketchPrintStatus === 'queued' ||
    sketchPrintStatus === 'printing';

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, busy ? FAST_POLL_MS : SLOW_POLL_MS);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  async function handleGenerateSketch(): Promise<void> {
    setIsGeneratingSketch(true);
    setSketchRequestError(false);
    try {
      const res = await fetch(`/api/sessions/${data.session.id}/generate-sketch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) setSketchRequestError(true);
      await refresh();
    } catch {
      setSketchRequestError(true);
    } finally {
      setIsGeneratingSketch(false);
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[480px] overflow-hidden px-[clamp(1rem,5vw,2rem)] pb-16 pt-[clamp(1.5rem,6vw,2.5rem)]">
      <header className="relative mb-[clamp(1.5rem,5vw,2.25rem)] text-center">
        <Float style={{ top: '-4px', left: '2%' }} duration={3.4}><Star size={30} /></Float>
        <Float style={{ top: '6px', right: '3%' }} delay={0.7} duration={3.8}><Heart size={28} /></Float>
        <Float style={{ bottom: '-6px', left: '14%' }} delay={1.2} duration={4} opacity={0.45}><Sparkle size={22} /></Float>

        <motion.h1
          initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="font-display m-0 inline-block border-[2.5px] border-[var(--color-ink)] bg-[var(--color-paper)] px-6 py-2 text-[clamp(2.2rem,9vw,3.2rem)] font-bold leading-none text-[var(--color-accent)] [border-radius:var(--doodle-radius)] [box-shadow:var(--doodle-shadow)]"
        >
          {id.session.title}
        </motion.h1>
      </header>

      <div className="flex flex-col gap-[clamp(1.75rem,6vw,2.5rem)]">
        <StripSection stripSignedUrl={data.session.stripSignedUrl} />

        <SketchSection
          aiEnabled={data.aiEnabled}
          status={sketchStatus}
          errorReason={data.sketchJob?.errorReason ?? null}
          canRetry={(data.sketchJob?.retryCount ?? 0) < 2}
          cardSignedUrl={data.sketchJob?.cardSignedUrl ?? null}
          onGenerateSketch={handleGenerateSketch}
          isGenerating={isGeneratingSketch}
          requestError={sketchRequestError}
        />

        {sketchStatus === 'done' && (
          <motion.section
            aria-label={id.session.printRequest.button}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            <RequestPrintButton
              sessionToken={token}
              stationOnline={data.printStationOnline}
              sketchPrintJobStatus={sketchPrintStatus}
              onRequested={refresh}
            />
          </motion.section>
        )}
      </div>
    </div>
  );
}
