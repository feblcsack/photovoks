/**
 * Tests for useAdminGesture hook
 *
 * Property 1: Admin gesture requires exact count and timing
 * Validates: Requirements 1.3, 11.1
 *
 * The hook navigates to /admin/pin when exactly 5 taps land in the
 * top-right quadrant (x > 80% width, y < 20% height) within a 3-second
 * rolling window. Navigation is triggered once and the counter resets.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as fc from 'fast-check';
import { useAdminGesture } from '../useAdminGesture';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Viewport dimensions used for all tests */
const VIEWPORT = { width: 1000, height: 800 };

/** A tap coordinate that IS in the top-right quadrant */
const IN_ZONE = { x: VIEWPORT.width * 0.85, y: VIEWPORT.height * 0.10 };

/** A tap coordinate that is NOT in the top-right quadrant */
const OUT_ZONE = { x: VIEWPORT.width * 0.50, y: VIEWPORT.height * 0.50 };

/**
 * Fire a synthetic PointerEvent on document, advancing fake-timer time
 * by `offsetMs` milliseconds relative to the last tap.
 */
function fireTap(
  coords: { x: number; y: number },
  offsetMs = 0,
): void {
  vi.advanceTimersByTime(offsetMs);
  const event = new PointerEvent('pointerdown', {
    bubbles: true,
    clientX: coords.x,
    clientY: coords.y,
  });
  document.dispatchEvent(event);
}

/** Fire `count` in-zone taps spaced `gapMs` apart (default 100 ms each). */
function fireInZoneTaps(count: number, gapMs = 100): void {
  for (let i = 0; i < count; i++) {
    fireTap(IN_ZONE, i === 0 ? 0 : gapMs);
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();

  // Set a predictable viewport size
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: VIEWPORT.width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: VIEWPORT.height,
  });

  mockPush.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('useAdminGesture — unit tests', () => {
  it('does not navigate on fewer than 5 in-zone taps', () => {
    for (let count = 0; count < 5; count++) {
      // Each iteration gets a fresh hook and timer state
      vi.useFakeTimers();
      mockPush.mockClear();
      const { unmount } = renderHook(() => useAdminGesture());
      fireInZoneTaps(count);
      expect(mockPush).not.toHaveBeenCalled();
      unmount();
      vi.useRealTimers();
    }
    // Restore fake timers for subsequent tests in this describe block
    vi.useFakeTimers();
  });

  it('navigates to /admin/pin on exactly 5 in-zone taps within 3 seconds', () => {
    renderHook(() => useAdminGesture());
    fireInZoneTaps(5);
    expect(mockPush).toHaveBeenCalledExactlyOnceWith('/admin/pin');
  });

  it('does not navigate when 5 taps are outside the top-right quadrant', () => {
    renderHook(() => useAdminGesture());
    for (let i = 0; i < 5; i++) {
      fireTap(OUT_ZONE, 100);
    }
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when the 5th tap falls outside the 3-second window', () => {
    renderHook(() => useAdminGesture());

    // Taps 1-4: at t=0, 100, 200, 300 ms
    fireInZoneTaps(4, 100);
    // Advance to t=3100 — first tap at t=0 is now 3100 ms ago, evicted by >3000 filter
    vi.advanceTimersByTime(2800);
    // 5th tap at t=3100: buffer has taps at t=100, 200, 300, 3100 = only 4 in window
    fireTap(IN_ZONE);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('triggers navigation exactly once for exactly 5 taps — 6th tap does not immediately re-trigger', () => {
    renderHook(() => useAdminGesture());

    fireInZoneTaps(5); // triggers navigation + resets counter
    expect(mockPush).toHaveBeenCalledOnce();

    // Immediately fire a 6th tap — counter was reset, so 1 tap in buffer
    fireTap(IN_ZONE, 50);
    expect(mockPush).toHaveBeenCalledOnce(); // still only once
  });

  it('navigates again after a full second trigger-reset-5-taps cycle', () => {
    renderHook(() => useAdminGesture());

    fireInZoneTaps(5); // first trigger
    expect(mockPush).toHaveBeenCalledTimes(1);

    fireInZoneTaps(5, 100); // second trigger after counter reset
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('mixed in-zone and out-zone taps only count the in-zone ones', () => {
    renderHook(() => useAdminGesture());

    // 3 in-zone, 5 out-zone, 2 more in-zone — total in-zone = 5 but spread
    // out over more than 3 s won't trigger; tight version should trigger at exactly 5 in-zone
    fireInZoneTaps(3, 100);       // 3 in-zone taps
    fireTap(OUT_ZONE, 100);       // out of zone (ignored)
    fireTap(OUT_ZONE, 100);       // out of zone (ignored)
    fireTap(IN_ZONE, 100);        // 4th in-zone tap
    fireTap(IN_ZONE, 100);        // 5th in-zone tap — triggers
    expect(mockPush).toHaveBeenCalledExactlyOnceWith('/admin/pin');
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('useAdminGesture — property tests (Property 1)', () => {
  /**
   * Property: any sequence with fewer than 5 in-zone taps in a 3-second
   * window never triggers navigation.
   */
  it('Property 1a — fewer than 5 in-zone taps never trigger navigation', () => {
    fc.assert(
      fc.property(
        // Generate 0–4 in-zone taps, each spaced 100–500 ms apart (all within 3 s)
        fc.integer({ min: 0, max: 4 }),
        (tapCount) => {
          const { unmount } = renderHook(() => useAdminGesture());
          mockPush.mockClear();

          fireInZoneTaps(tapCount, 200);

          const result = mockPush.mock.calls.length === 0;
          unmount();
          return result;
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Property: exactly 5 in-zone taps within the window ALWAYS triggers
   * navigation to /admin/pin exactly once.
   */
  it('Property 1b — exactly 5 in-zone taps in ≤3 s always trigger navigation once', () => {
    fc.assert(
      fc.property(
        // Gaps between consecutive taps: 5 gaps, each 1–500 ms, total must be ≤ 3000 ms
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 5, maxLength: 5 }).filter(
          (gaps) => gaps.reduce((a, b) => a + b, 0) <= 3000,
        ),
        (gaps) => {
          const { unmount } = renderHook(() => useAdminGesture());
          mockPush.mockClear();

          // Fire 5 taps with the given inter-tap gaps
          fireTap(IN_ZONE, 0);
          for (let i = 0; i < 4; i++) {
            fireTap(IN_ZONE, gaps[i]);
          }

          const result =
            mockPush.mock.calls.length === 1 &&
            mockPush.mock.calls[0][0] === '/admin/pin';
          unmount();
          return result;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: taps entirely outside the top-right quadrant never trigger
   * navigation, regardless of count or timing.
   */
  it('Property 1c — out-of-zone taps never trigger navigation', () => {
    // Generate out-of-zone integer pixel coordinates
    // Condition for IN-zone: x > 80% width AND y < 20% height
    // So OUT-of-zone means: x <= 80% width OR y >= 20% height (or both)
    const xThreshold = Math.floor(VIEWPORT.width * 0.8);  // 800
    const yThreshold = Math.floor(VIEWPORT.height * 0.2); // 160

    const outOfZoneCoord = fc.oneof(
      // x is at or left of the 80% threshold (anywhere on y)
      fc.record({
        x: fc.integer({ min: 0, max: xThreshold }),
        y: fc.integer({ min: 0, max: VIEWPORT.height - 1 }),
      }),
      // x is in right zone but y is at or below the 20% threshold
      fc.record({
        x: fc.integer({ min: xThreshold + 1, max: VIEWPORT.width - 1 }),
        y: fc.integer({ min: yThreshold, max: VIEWPORT.height - 1 }),
      }),
    );

    fc.assert(
      fc.property(
        fc.array(outOfZoneCoord, { minLength: 5, maxLength: 20 }),
        (taps) => {
          const { unmount } = renderHook(() => useAdminGesture());
          mockPush.mockClear();

          for (const tap of taps) {
            fireTap(tap, 100);
          }

          const result = mockPush.mock.calls.length === 0;
          unmount();
          return result;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: 5 in-zone taps spread over MORE than 3 seconds never
   * trigger navigation (rolling window eviction).
   */
  it('Property 1d — 5 in-zone taps spread over >3 s never trigger navigation', () => {
    fc.assert(
      fc.property(
        // Gaps totalling strictly more than 3000 ms for 4 inter-tap gaps (5 taps)
        fc.array(fc.integer({ min: 1, max: 2000 }), { minLength: 4, maxLength: 4 }).filter(
          (gaps) => gaps.reduce((a, b) => a + b, 0) > 3000,
        ),
        (gaps) => {
          const { unmount } = renderHook(() => useAdminGesture());
          mockPush.mockClear();

          fireTap(IN_ZONE, 0);
          for (const gap of gaps) {
            fireTap(IN_ZONE, gap);
          }

          const result = mockPush.mock.calls.length === 0;
          unmount();
          return result;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: after a successful trigger the counter resets; a single
   * additional tap immediately after never triggers a second navigation.
   */
  it('Property 1e — counter resets after trigger; 6th tap alone does not re-navigate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        (delayAfterTrigger) => {
          const { unmount } = renderHook(() => useAdminGesture());
          mockPush.mockClear();

          fireInZoneTaps(5, 100); // trigger
          vi.advanceTimersByTime(delayAfterTrigger);
          fireTap(IN_ZONE); // one more tap — should NOT trigger again

          const result = mockPush.mock.calls.length === 1;
          unmount();
          return result;
        },
      ),
      { numRuns: 50 },
    );
  });
});
