'use client';

/**
 * Offline Indicator Banner
 *
 * A non-blocking banner displayed at the top of the booth UI when the
 * device has no network connectivity. Uses `window.online` / `window.offline`
 * events to toggle visibility.
 *
 * - Maximum CSS height: 40px (Requirement 13.4)
 * - `pointer-events: none` when hidden so it never blocks interactions
 * - Text sourced from i18n `offline.indicator` (Requirement 17.4)
 * - `position: fixed` so it sits above all booth content at z-index 1000
 *
 * Requirements: 13.4, 17.4
 */

import React, { useEffect, useState } from 'react';
import { id } from '@/i18n/id';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOffline(!navigator.onLine);

    function handleOffline() {
      setIsOffline(true);
    }

    function handleOnline() {
      setIsOffline(false);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={isOffline ? id.offline.indicator : undefined}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        // Max height constraint per Requirement 13.4
        maxHeight: '40px',
        height: isOffline ? '40px' : '0px',
        overflow: 'hidden',
        zIndex: 1000,
        // Pointer events passthrough when hidden so it never blocks interactions
        pointerEvents: isOffline ? 'auto' : 'none',
        transition: 'height 0.2s ease',
        // Use data-animate so prefers-reduced-motion disables the transition
        // (globals.css handles [data-animate] { transition: none !important })
      }}
      data-animate
    >
      {/* Inner content — fixed 40px, vertically centred */}
      <div
        style={{
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-ink)',
          color: '#ffffff',
          fontFamily: 'var(--font-body), sans-serif',
          fontSize: '0.85rem',
          fontWeight: 500,
          letterSpacing: '0.01em',
          gap: '0.5rem',
          paddingLeft: '1rem',
          paddingRight: '1rem',
        }}
      >
        {/* Small dot indicator */}
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#ff6b6b',
            flexShrink: 0,
          }}
        />
        {id.offline.indicator}
      </div>
    </div>
  );
}
