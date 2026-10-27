'use client';

/**
 * RequestPrintButton — heartbeat-gated sketch print request button.
 *
 * Behavior:
 * - Polls GET /api/admin/status every 30 s to get the latest heartbeat timestamp
 * - Computes isStationOnline = (Date.now() - lastHeartbeatMs) < 90_000
 * - Disables the button when the print station is offline
 * - On tap, POSTs to /api/print-jobs/sketch (Bearer {sessionToken}) — idempotent
 * - Displays sketch print job status (queued/printing/printed/failed)
 * - Status updates come via Realtime props passed down from SessionView
 *
 * Requirements: 8.8, 8.9, 8.10, 12.1
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DoodleButton } from '@/components/doodle';
import { id } from '@/i18n/id';
import type { PrintJobStatus } from '@photovoks/shared-types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Station is offline if heartbeat is older than this threshold (Req 8.8, 9.11) */
const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;

/** Poll admin status every 30 seconds (Req 15.5) */
const POLL_INTERVAL_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminStatusResponse {
  printStationOnline: boolean;
  lastHeartbeatAt: string | null;
}

interface RequestPrintButtonProps {
  /** Session token used as Bearer auth for the print request (Req 12.1) */
  sessionToken: string;
  /** Initial online status from SSR — will be updated by polling */
  initialOnline: boolean;
  /** Sketch job must be 'done' to allow printing */
  sketchJobDone: boolean;
  /** Current sketch print job status from Realtime (null = not yet requested) */
  sketchPrintJobStatus: PrintJobStatus | null;
  /** Called when a print job is successfully created — passes the job id */
  onPrintJobCreated?: (printJobId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RequestPrintButton({
  sessionToken,
  initialOnline,
  sketchJobDone,
  sketchPrintJobStatus,
  onPrintJobCreated,
}: RequestPrintButtonProps) {
  const [isStationOnline, setIsStationOnline] = useState(initialOnline);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Heartbeat polling (Req 8.8) ───────────────────────────────────────────

  const pollHeartbeat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data: AdminStatusResponse = await res.json();

      if (data.lastHeartbeatAt) {
        const lastMs = new Date(data.lastHeartbeatAt).getTime();
        setIsStationOnline(Date.now() - lastMs < HEARTBEAT_ONLINE_THRESHOLD_MS);
      } else {
        setIsStationOnline(false);
      }
    } catch {
      // Network error — keep current online status, don't crash
    }
  }, []);

  useEffect(() => {
    // Immediate first poll to correct SSR data quickly
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void pollHeartbeat();

    pollTimerRef.current = setInterval(pollHeartbeat, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [pollHeartbeat]);

  // ── Print request handler (Req 8.9, 12.1) ────────────────────────────────

  async function handleRequestPrint() {
    if (!isStationOnline || isSubmitting || !sketchJobDone) return;

    setIsSubmitting(true);
    setSubmitError(false);

    try {
      const res = await fetch('/api/print-jobs/sketch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const data: { printJobId: string } = await res.json();
      onPrintJobCreated?.(data.printJobId);
    } catch {
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Derive button text & state ────────────────────────────────────────────

  const isButtonDisabled =
    !isStationOnline ||
    !sketchJobDone ||
    isSubmitting ||
    // Already queued/printing/printed — no need to re-request
    sketchPrintJobStatus === 'queued' ||
    sketchPrintJobStatus === 'printing' ||
    sketchPrintJobStatus === 'printed';

  // ── Status message (Req 8.10) ─────────────────────────────────────────────

  function getStatusMessage(): string | null {
    if (sketchPrintJobStatus === 'queued') return id.session.printRequest.queued;
    if (sketchPrintJobStatus === 'printing') return id.session.printRequest.printing;
    if (sketchPrintJobStatus === 'printed') return id.session.printRequest.printed;
    if (sketchPrintJobStatus === 'failed' || submitError)
      return id.session.printRequest.failed;
    return null;
  }

  const statusMessage = getStatusMessage();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <DoodleButton
        variant="primary"
        onClick={handleRequestPrint}
        disabled={isButtonDisabled}
        aria-disabled={isButtonDisabled}
        aria-label={
          !isStationOnline
            ? id.session.printRequest.stationOffline
            : id.session.printRequest.button
        }
        style={{
          opacity: isButtonDisabled ? 0.5 : 1,
          cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        {isSubmitting ? id.session.printRequest.queued : id.session.printRequest.button}
      </DoodleButton>

      {/* Offline message */}
      {!isStationOnline && (
        <p
          role="status"
          style={{
            fontFamily: 'var(--font-body), sans-serif',
            fontSize: '0.85rem',
            color: 'var(--color-ink)',
            opacity: 0.65,
            margin: 0,
            fontStyle: 'italic',
          }}
        >
          {id.session.printRequest.stationOffline}
        </p>
      )}

      {/* Realtime status message (Req 8.10) */}
      {statusMessage && (
        <p
          aria-live="polite"
          aria-atomic="true"
          style={{
            fontFamily: 'var(--font-body), sans-serif',
            fontSize: '0.9rem',
            color:
              sketchPrintJobStatus === 'printed'
                ? 'var(--color-accent)'
                : 'var(--color-ink)',
            fontWeight: sketchPrintJobStatus === 'printed' ? 600 : 400,
            margin: 0,
          }}
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
}
