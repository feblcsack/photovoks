import { useEffect, useRef } from 'react';

/**
 * Requests a Screen Wake Lock to prevent the display from sleeping
 * while the booth is running. Re-acquires the lock when the page
 * becomes visible again (e.g. after tab switch or device wake).
 *
 * Gracefully handles:
 * - SSR (no navigator)
 * - Browsers that don't support the Wake Lock API
 * - Rejection (e.g. page not visible yet)
 *
 * Requirement 13.1
 */
export function useWakeLock(): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // Guard: SSR or unsupported browser
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    async function acquireLock() {
      // Avoid re-acquiring if we already hold an active lock
      if (sentinelRef.current && !sentinelRef.current.released) {
        return;
      }
      try {
        sentinelRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // Silently ignore — lock may be unavailable when page is hidden
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        acquireLock();
      }
    }

    acquireLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sentinelRef.current?.release().catch(() => undefined);
    };
  }, []);
}
