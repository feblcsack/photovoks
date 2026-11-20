'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/fetcher';
import type { SessionSummary } from '@/lib/session-types';

export type Range = 'today' | 'week' | 'month' | 'all';
export interface SessionStats { sessions: number; prints: number; printedSessions: number; ai: number }

export function useEventSessions(code: string, range: Range, status = '', pageSize = 24) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = useCallback(
    (offset: number) => `/api/events/${code}/sessions?range=${range}&limit=${pageSize}&offset=${offset}${status ? `&status=${status}` : ''}`,
    [code, range, status, pageSize],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ sessions: SessionSummary[]; stats: SessionStats; total: number; nextOffset: number | null }>(url(0));
      setSessions(res.sessions);
      setStats(res.stats);
      setTotal(res.total);
      setNextOffset(res.nextOffset);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat');
    } finally {
      setLoading(false);
    }
  }, [url]);

  const loadMore = useCallback(async () => {
    if (nextOffset === null) return;
    setLoadingMore(true);
    try {
      const res = await api<{ sessions: SessionSummary[]; nextOffset: number | null }>(url(nextOffset));
      setSessions((xs) => [...xs, ...res.sessions.filter((s) => !xs.some((x) => x.id === s.id))]);
      setNextOffset(res.nextOffset);
    } finally {
      setLoadingMore(false);
    }
  }, [nextOffset, url]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void reload();
  }, [reload]);

  return { sessions, stats, total, nextOffset, loading, loadingMore, error, reload, loadMore };
}
