import { useEffect, useRef } from 'react';

/**
 * Monitors user activity (pointerdown, pointermove, keydown) and calls
 * `onTimeout` after `timeoutMs` ms of inactivity.
 *
 * The timer is reset on every qualifying event.
 * Used in the booth shell to dispatch RESET after 60 seconds of idle.
 *
 * Requirement 1.2
 */
export function useIdleTimer(timeoutMs: number, onTimeout: () => void): void {
  // Keep a stable ref to onTimeout so we don't re-register listeners on every render
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onTimeoutRef.current();
      }, timeoutMs);
    }

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown'];

    // Start timer immediately
    resetTimer();

    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [timeoutMs]);
}
