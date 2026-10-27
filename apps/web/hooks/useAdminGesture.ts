import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Detects the admin entry gesture: 5 taps in the top-right quadrant
 * (x > 80%, y < 20% of viewport) within a 3-second rolling window.
 *
 * On detection: navigates to /admin/pin and resets the counter.
 *
 * Requirements 1.3, 11.1
 * Property 1: Admin gesture requires exact count and timing
 */
export function useAdminGesture(): void {
  const router = useRouter();
  const tapTimestampsRef = useRef<number[]>([]);

  useEffect(() => {
    const REQUIRED_TAPS = 5;
    const WINDOW_MS = 3000;

    function handlePointerDown(event: PointerEvent) {
      const inTopRight =
        event.clientX > window.innerWidth * 0.8 &&
        event.clientY < window.innerHeight * 0.2;

      if (!inTopRight) return;

      const now = Date.now();
      // Add current timestamp and evict entries outside the 3-second window
      tapTimestampsRef.current.push(now);
      tapTimestampsRef.current = tapTimestampsRef.current.filter(
        (ts) => now - ts <= WINDOW_MS,
      );

      if (tapTimestampsRef.current.length === REQUIRED_TAPS) {
        tapTimestampsRef.current = [];
        router.push('/admin/pin');
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [router]);
}
