'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useBoothContext } from '../context/BoothContext';
import { DoodleButton, DoodleCard } from '@/components/doodle';
import { id } from '@/i18n/id';

/**
 * Consent screen — shown after a visitor taps the idle screen.
 *
 * Displays Bahasa Indonesia consent text including how many days photos will
 * be retained, sourced dynamically from the active Event in BoothContext.
 *
 * - "Saya Setuju" → dispatch ACCEPT_CONSENT (no-op on state, step already
 *   'consent') then navigate to /frames so the visitor can pick a frame.
 * - "Tidak"       → dispatch DECLINE_CONSENT (resets state to idle) then
 *   navigate back to / without creating any session record.
 *
 * POST /api/sessions is intentionally NOT called here. Session creation only
 * happens after frame selection AND photo capture are complete.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export default function ConsentPage() {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();

  const retentionDays = state.event?.retentionDays ?? 30;

  function handleAccept() {
    // State is already at step='consent' (set by idle page dispatch).
    // Navigate to frames — session creation does NOT happen here.
    router.push('/frames');
  }

  function handleDecline() {
    // Reset state machine fully and return to idle without creating a session.
    dispatch({ type: 'DECLINE_CONSENT' });
    router.push('/');
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100%',
        background: 'var(--color-bg)',
        padding: '2rem',
        boxSizing: 'border-box',
        gap: '2rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Decorative corner doodles (aria-hidden, no animation) ─────────── */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* Star — top-left */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="30"
          height="30"
          viewBox="0 0 30 30"
          style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', opacity: 0.35 }}
        >
          <path
            d="M15 2 L17.5 11 L27 11 L19.5 17 L22 26 L15 21 L8 26 L10.5 17 L3 11 L12.5 11 Z"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>

        {/* Dots — top-right */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="14"
          viewBox="0 0 40 14"
          style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', opacity: 0.35 }}
        >
          <circle cx="7" cy="7" r="3.5" fill="var(--color-accent)" />
          <circle cx="20" cy="7" r="3.5" fill="var(--color-accent)" />
          <circle cx="33" cy="7" r="3.5" fill="var(--color-accent)" />
        </svg>

        {/* Heart — bottom-left */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 28 28"
          style={{ position: 'absolute', bottom: '1.5rem', left: '1.5rem', opacity: 0.35 }}
        >
          <path
            d="M14 23 C14 23 3 15.5 3 8.5 C3 5 5.5 2.5 8.5 2.5 C10.5 2.5 12.5 3.8 14 6 C15.5 3.8 17.5 2.5 19.5 2.5 C22.5 2.5 25 5 25 8.5 C25 15.5 14 23 14 23 Z"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>

        {/* Curved swoosh — bottom-right */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="50"
          height="32"
          viewBox="0 0 50 32"
          style={{ position: 'absolute', bottom: '1.5rem', right: '1.5rem', opacity: 0.35 }}
        >
          <path
            d="M4 28 C12 28, 18 4, 30 8 C40 12, 44 24, 46 6"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Consent card */}
      <DoodleCard
        className="consent-card"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            maxWidth: '480px',
            padding: '1rem',
          }}
        >
          {/* Title */}
          <h1
            style={{
              fontFamily: 'var(--font-display), cursive',
              fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
              color: 'var(--color-ink)',
              margin: 0,
              textAlign: 'center',
            }}
          >
            {id.consent.title}
          </h1>

          {/* AI processing notice */}
          <p
            style={{
              fontFamily: 'var(--font-body), sans-serif',
              fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)',
              color: 'var(--color-ink)',
              margin: 0,
              lineHeight: 1.6,
              textAlign: 'center',
            }}
          >
            {id.consent.body}
          </p>

          {/* Retention period notice — dynamically sourced from active Event */}
          <p
            style={{
              fontFamily: 'var(--font-body), sans-serif',
              fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
              color: 'var(--color-ink)',
              margin: 0,
              lineHeight: 1.6,
              textAlign: 'center',
              opacity: 0.75,
            }}
          >
            {id.consent.retentionNotice(retentionDays)}
          </p>
        </div>
      </DoodleCard>

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          alignItems: 'center',
          width: '100%',
          maxWidth: '320px',
        }}
      >
        {/* Accept — explicit consent required to proceed (Req 2.3, 2.5) */}
        <DoodleButton
          variant="primary"
          onClick={handleAccept}
          style={{
            fontSize: 'clamp(1.1rem, 3vw, 1.4rem)',
            padding: '0.75rem 2.5rem',
            width: '100%',
          }}
        >
          {id.consent.accept}
        </DoodleButton>

        {/* Decline — returns to idle WITHOUT creating a session (Req 2.4) */}
        <DoodleButton
          variant="secondary"
          onClick={handleDecline}
          style={{
            fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
            padding: '0.6rem 2rem',
            width: '100%',
          }}
        >
          {id.consent.decline}
        </DoodleButton>
      </div>
    </div>
  );
}
