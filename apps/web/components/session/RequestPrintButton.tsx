'use client';

/**
 * RequestPrintButton — lets the visitor print their AI doodle at the booth.
 * Station online state + job status come from the parent's status polling.
 */
import React, { useState } from 'react';
import { DoodleButton } from '@/components/doodle';
import { id } from '@/i18n/id';
import type { PrintJobStatus } from '@photovoks/shared-types';

interface RequestPrintButtonProps {
  sessionToken: string;
  stationOnline: boolean;
  sketchPrintJobStatus: PrintJobStatus | null;
  onRequested?: () => void | Promise<void>;
}

export function RequestPrintButton({
  sessionToken,
  stationOnline,
  sketchPrintJobStatus,
  onRequested,
}: RequestPrintButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const t = id.session.printRequest;

  const alreadyRequested =
    sketchPrintJobStatus === 'queued' ||
    sketchPrintJobStatus === 'printing' ||
    sketchPrintJobStatus === 'printed';
  const disabled = !stationOnline || isSubmitting || alreadyRequested;

  async function handleRequestPrint() {
    if (disabled) return;
    setIsSubmitting(true);
    setSubmitError(false);
    try {
      const res = await fetch('/api/print-jobs/sketch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      await onRequested?.();
    } catch {
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  let message: string | null = null;
  if (sketchPrintJobStatus === 'queued') message = t.queued;
  else if (sketchPrintJobStatus === 'printing') message = t.printing;
  else if (sketchPrintJobStatus === 'printed') message = t.printed;
  else if (sketchPrintJobStatus === 'failed' || submitError) message = t.failed;
  else if (!stationOnline) message = t.stationOffline;

  return (
    <div className="flex flex-col items-center gap-2">
      {!alreadyRequested && (
        <DoodleButton
          variant="primary"
          onClick={handleRequestPrint}
          disabled={disabled}
          aria-busy={isSubmitting}
          className={disabled ? 'cursor-not-allowed opacity-50' : undefined}
        >
          {isSubmitting ? t.queued : t.button}
        </DoodleButton>
      )}
      {message && (
        <p
          role="status"
          aria-live="polite"
          className={`m-0 text-center text-[0.95rem] ${
            sketchPrintJobStatus === 'printed' ? 'font-semibold text-[var(--color-accent)]' : 'opacity-75'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
