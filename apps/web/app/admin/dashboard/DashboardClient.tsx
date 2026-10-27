'use client';

/**
 * Admin Dashboard — Client Component
 *
 * Displays:
 * - Print station online/offline status badge (based on 90-second heartbeat threshold)
 * - Print job counts table (queued / printing / printed / failed / cancelled)
 * - "Reset Session" button — abandons the current active booth session
 * - "Reprint Last Strip" button — creates a new queued job for the last printed strip
 * - "Clear Queue" button — cancels all queued print jobs
 * - "Switch Active Event" section — event dropdown with active-session guard
 *
 * Auto-refreshes every 30 seconds AND subscribes to Supabase Realtime so
 * job counts and print-station status update instantly when jobs change.
 * Uses plain/clean admin styling (not doodle style) per Requirement 17.2.
 *
 * Requirements: 9.11, 11.6
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  printStation: {
    isOnline: boolean;
    lastHeartbeatAt: string | null;
  };
  jobCounts: {
    queued: number;
    printing: number;
    printed: number;
    failed: number;
    cancelled: number;
  };
  activeSession: { id: string; status: string; created_at: string } | null;
  activeEvent: { id: string; name: string; status: string } | null;
}

interface EventOption {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
}

interface DashboardClientProps {
  initialData: DashboardData;
  events: EventOption[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '—';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s yang lalu`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} mnt yang lalu`;
  return `${Math.floor(diffMins / 60)} jam yang lalu`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardClient({ initialData, events }: DashboardClientProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [selectedEventId, setSelectedEventId] = useState(
    initialData.activeEvent?.id ?? ''
  );

  // Action states
  const [resetting, setResetting] = useState(false);
  const [reprinting, setReprinting] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);
  const [switchingEvent, setSwitchingEvent] = useState(false);

  // Feedback messages
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Realtime channel ref (prevent double-subscription in Strict Mode)
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Data refresh ────────────────────────────────────────────────────────────

  const refreshData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard');
      if (!res.ok) return;
      const fresh = (await res.json()) as DashboardData;
      setData(fresh);
    } catch {
      // Silently ignore refresh errors; stale data is fine
    }
  }, []);

  // 30-second polling fallback
  useEffect(() => {
    const id = setInterval(() => {
      void refreshData();
    }, 30_000);
    return () => clearInterval(id);
  }, [refreshData]);

  // ── Supabase Realtime subscription — instant updates ───────────────────────

  useEffect(() => {
    if (channelRef.current) return; // already subscribed

    let supabase: ReturnType<typeof createBrowserClient>;
    try {
      supabase = createBrowserClient();
    } catch {
      return; // missing env vars, fall back to polling
    }

    const channel = supabase.channel('admin-dashboard');
    channelRef.current = channel;

    channel
      // Any change to print_jobs → refresh counts immediately
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs' },
        () => { void refreshData(); },
      )
      // Heartbeat row update → refresh station online status
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_station_heartbeat' },
        () => { void refreshData(); },
      )
      // Session changes → update active session display
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        () => { void refreshData(); },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
        channelRef.current = null;
      }
    };
  }, [refreshData]);

  function showMessage(type: 'success' | 'error', text: string) {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  }

  // ── Action handlers ─────────────────────────────────────────────────────────

  async function handleResetSession() {
    if (!data.activeSession) return;
    if (!confirm('Reset sesi pengunjung saat ini? Sesi akan ditandai sebagai abandoned.')) return;

    setResetting(true);
    try {
      const res = await fetch('/api/admin/reset-session', { method: 'POST' });
      if (res.ok) {
        showMessage('success', 'Sesi berhasil direset.');
        void refreshData();
      } else {
        const body = (await res.json()) as { error?: string };
        showMessage('error', body.error ?? 'Gagal mereset sesi.');
      }
    } catch {
      showMessage('error', 'Kesalahan jaringan. Coba lagi.');
    } finally {
      setResetting(false);
    }
  }

  async function handleReprintStrip() {
    if (!confirm('Cetak ulang strip terakhir?')) return;

    setReprinting(true);
    try {
      const res = await fetch('/api/admin/reprint-strip', { method: 'POST' });
      if (res.ok) {
        showMessage('success', 'Pekerjaan cetak ulang berhasil dibuat.');
        void refreshData();
      } else {
        const body = (await res.json()) as { error?: string };
        showMessage('error', body.error ?? 'Gagal membuat cetak ulang.');
      }
    } catch {
      showMessage('error', 'Kesalahan jaringan. Coba lagi.');
    } finally {
      setReprinting(false);
    }
  }

  async function handleClearQueue() {
    const queuedCount = data.jobCounts.queued;
    if (queuedCount === 0) return;
    if (
      !confirm(
        `Batalkan semua ${queuedCount} pekerjaan cetak yang antri? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return;

    setClearingQueue(true);
    try {
      const res = await fetch('/api/admin/clear-queue', { method: 'POST' });
      if (res.ok) {
        const body = (await res.json()) as { cancelledCount: number };
        showMessage('success', `${body.cancelledCount} pekerjaan cetak dibatalkan.`);
        void refreshData();
      } else {
        const body = (await res.json()) as { error?: string };
        showMessage('error', body.error ?? 'Gagal membersihkan antrian.');
      }
    } catch {
      showMessage('error', 'Kesalahan jaringan. Coba lagi.');
    } finally {
      setClearingQueue(false);
    }
  }

  async function handleSwitchEvent() {
    if (!selectedEventId || selectedEventId === data.activeEvent?.id) return;

    setSwitchingEvent(true);
    try {
      const res = await fetch('/api/admin/switch-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEventId }),
      });

      if (res.ok) {
        showMessage('success', 'Event aktif berhasil diganti.');
        void refreshData();
      } else {
        const body = (await res.json()) as {
          error?: string;
          message?: string;
        };
        if (body.error === 'active_session') {
          showMessage(
            'error',
            body.message ??
              'Tidak dapat mengganti event: sesi pengunjung sedang berlangsung.'
          );
          // Reset dropdown back to current active event
          setSelectedEventId(data.activeEvent?.id ?? '');
        } else {
          showMessage('error', body.error ?? 'Gagal mengganti event.');
        }
      }
    } catch {
      showMessage('error', 'Kesalahan jaringan. Coba lagi.');
    } finally {
      setSwitchingEvent(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const hasActiveSession = !!data.activeSession;
  const hasPrintedStrip = (data.jobCounts.printed ?? 0) > 0;
  const hasQueuedJobs = data.jobCounts.queued > 0;
  const isSwitchBlocked = hasActiveSession;
  const isSwitchChanged = selectedEventId !== (data.activeEvent?.id ?? '');

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Action feedback banner */}
      {actionMessage && (
        <div
          role="alert"
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            actionMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* ── Print Station Status ─────────────────────────────────────────── */}
      <section aria-labelledby="station-heading">
        <h2 id="station-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Status Print Station
        </h2>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
              data.printStation.isOnline
                ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
                : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20'
            }`}
            aria-label={`Print station ${data.printStation.isOnline ? 'online' : 'offline'}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                data.printStation.isOnline ? 'bg-green-500' : 'bg-red-500'
              }`}
              aria-hidden="true"
            />
            {data.printStation.isOnline ? 'Online' : 'Offline'}
          </span>
          <span className="text-sm text-gray-500">
            Heartbeat terakhir:{' '}
            <span className="font-medium text-gray-700">
              {formatRelativeTime(data.printStation.lastHeartbeatAt)}
            </span>
          </span>
        </div>
      </section>

      {/* ── Job Counts ───────────────────────────────────────────────────── */}
      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          Pekerjaan Cetak
          <span
            aria-label="Update otomatis"
            title="Data diperbarui otomatis via Realtime"
            className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
            Live
          </span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(
            [
              { label: 'Antri', key: 'queued', color: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20' },
              { label: 'Mencetak', key: 'printing', color: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
              { label: 'Selesai', key: 'printed', color: 'bg-green-50 text-green-700 ring-green-600/20' },
              { label: 'Gagal', key: 'failed', color: 'bg-red-50 text-red-700 ring-red-600/20' },
              { label: 'Dibatalkan', key: 'cancelled', color: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
            ] as const
          ).map(({ label, key, color }) => (
            <div
              key={key}
              className={`rounded-lg px-3 py-2.5 ring-1 ring-inset ${color} flex flex-col items-center`}
            >
              <span className="text-2xl font-bold tabular-nums">
                {data.jobCounts[key] ?? 0}
              </span>
              <span className="text-xs font-medium mt-1">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Quick Actions ────────────────────────────────────────────────── */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Tindakan Cepat
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">

          {/* Reset Session */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Reset Sesi</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {hasActiveSession
                  ? `Sesi aktif: ${data.activeSession!.status}`
                  : 'Tidak ada sesi aktif saat ini.'}
              </p>
            </div>
            <button
              type="button"
              disabled={!hasActiveSession || resetting}
              onClick={() => void handleResetSession()}
              className="w-full rounded-md px-3 py-1.5 text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {resetting ? 'Mereset…' : 'Reset Sesi'}
            </button>
          </div>

          {/* Reprint Last Strip */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Cetak Ulang Strip Terakhir</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Buat pekerjaan cetak baru untuk strip terakhir yang sudah dicetak.
              </p>
            </div>
            <button
              type="button"
              disabled={!hasPrintedStrip || reprinting}
              onClick={() => void handleReprintStrip()}
              className="w-full rounded-md px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {reprinting ? 'Mencetak…' : 'Cetak Ulang'}
            </button>
          </div>

          {/* Clear Queue */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Bersihkan Antrian</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {hasQueuedJobs
                  ? `${data.jobCounts.queued} pekerjaan dalam antrian.`
                  : 'Antrian kosong.'}
              </p>
            </div>
            <button
              type="button"
              disabled={!hasQueuedJobs || clearingQueue}
              onClick={() => void handleClearQueue()}
              className="w-full rounded-md px-3 py-1.5 text-sm font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {clearingQueue ? 'Membersihkan…' : 'Bersihkan Antrian'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Switch Active Event ──────────────────────────────────────────── */}
      <section aria-labelledby="event-heading">
        <h2 id="event-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Event Aktif
        </h2>
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">

          {/* Active session warning banner */}
          {isSwitchBlocked && (
            <div
              role="alert"
              className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800 flex items-start gap-2"
            >
              <span aria-hidden="true" className="mt-0.5 text-yellow-600">⚠</span>
              <span>
                Penggantian event diblokir: sesi pengunjung sedang berlangsung (
                <span className="font-mono text-xs">{data.activeSession!.status}</span>).
                Reset atau tunggu sesi selesai sebelum mengganti event.
              </span>
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="event-select"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Pilih Event
              </label>
              <select
                id="event-select"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                disabled={isSwitchBlocked || switchingEvent}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">— Pilih event —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                    {ev.status === 'active' ? ' (aktif)' : ev.status === 'archived' ? ' (arsip)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={
                !selectedEventId ||
                !isSwitchChanged ||
                isSwitchBlocked ||
                switchingEvent
              }
              onClick={() => void handleSwitchEvent()}
              className="flex-shrink-0 rounded-md px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {switchingEvent ? 'Mengganti…' : 'Ganti Event'}
            </button>
          </div>

          {data.activeEvent && (
            <p className="text-xs text-gray-500">
              Event aktif saat ini:{' '}
              <span className="font-medium text-gray-700">{data.activeEvent.name}</span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
