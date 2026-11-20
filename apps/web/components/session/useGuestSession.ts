'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/fetcher';
import type { GuestSessionData } from '@/lib/session-types';

/** Loads + polls a guest session while work (AI / print) is in progress. */
export function useGuestSession(token: string | null, initial: GuestSessionData | null = null) {
  const [data, setData] = useState<GuestSessionData | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return null;
    try {
      const next = await api<GuestSessionData>(`/api/s/${token}`);
      setData(next);
      setError(null);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat');
      return null;
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    if (token && !initial) void refresh();
  }, [token, initial, refresh]);

  const busy =
    !!data &&
    (data.session.ai.some((a) => a.status === 'pending' || a.status === 'processing') ||
      data.session.printJobs.some((p) => p.status === 'queued' || p.status === 'printing'));

  useEffect(() => {
    if (!busy) return;
    timer.current = setTimeout(() => void refresh(), 2500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [busy, data, refresh]);

  return { data, error, refresh, busy };
}
