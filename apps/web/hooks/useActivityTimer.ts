import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (Requirement 11.5)

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'keydown',
  'pointerdown',
  'touchstart',
];

/**
 * Monitors user activity and signs out the admin after 10 minutes of
 * inactivity, redirecting to the PIN entry screen.
 *
 * Mount this hook in admin layout components to enforce the requirement that
 * the admin session expires on idle.
 *
 * On timeout:
 * 1. Clears the `admin_token` cookie.
 * 2. Calls `supabase.auth.signOut()` (best-effort — admin may not have a
 *    Supabase Auth session, but this ensures any lingering sessions are cleared).
 * 3. Redirects to `/admin/pin`.
 *
 * Requirements: 11.5
 */
export function useActivityTimer(): void {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOut = useCallback(async () => {
    // Clear the admin JWT cookie
    document.cookie =
      'admin_token=; Path=/; Max-Age=0; SameSite=Strict';

    // Best-effort Supabase Auth sign-out
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Non-fatal — proceed to redirect regardless
    }

    console.info('[useActivityTimer] Admin session expired due to inactivity.');
    router.push('/admin/pin');
  }, [router]);

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void signOut();
      }, TIMEOUT_MS);
    }

    // Start the timer immediately
    resetTimer();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [signOut]);
}
