'use client';

/**
 * Operator/admin payments desk: approve or decline cash payments, watch
 * QRIS payments come in. Polls a small JSON list (paused in background tabs)
 * and beeps when a new payment is waiting.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote, Check, QrCode, RefreshCcw, Volume2, VolumeX, X } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader, Stat } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, formatDateTime, timeAgo } from '@/lib/fetcher';
import { sfx } from '@/lib/sfx';
import { formatRupiah } from '@/lib/settings-shared';
import { PAYMENT_STATUS_LABEL, type PaymentAdminView, type PaymentStatus } from '@/lib/payments/types';

interface ListResponse {
  ok: boolean;
  payments: PaymentAdminView[];
  totals: { revenue: number; paidCount: number; pending: number };
}

const TONE: Record<PaymentStatus, 'ok' | 'warn' | 'danger' | 'neutral' | 'brand'> = {
  pending: 'warn',
  paid: 'ok',
  approved: 'ok',
  declined: 'danger',
  expired: 'neutral',
  cancelled: 'neutral',
  failed: 'danger',
};

export function PaymentsManager({ scope, code }: { scope: 'event' | 'admin'; code?: string }) {
  const toast = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const seen = useRef<Set<string> | null>(null);
  const url = scope === 'event' ? `/api/events/${code}/payments` : '/api/admin/payments';

  const load = useCallback(async () => {
    try {
      const res = await api<ListResponse>(url);
      const pendingIds = res.payments.filter((p) => p.status === 'pending').map((p) => p.id);
      if (seen.current && sound && pendingIds.some((id) => !seen.current!.has(id))) sfx.beep(true);
      seen.current = new Set(pendingIds);
      setData(res);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memuat pembayaran', 'error');
    }
  }, [url, sound, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch + polling
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(p: PaymentAdminView, action: 'approve' | 'decline') {
    setBusy(p.id);
    try {
      await api(url, { method: 'PATCH', json: { id: p.id, action } });
      toast(action === 'approve' ? `Disetujui · ${p.shortCode}` : `Ditolak · ${p.shortCode}`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    } finally {
      setBusy(null);
    }
  }

  const pending = data?.payments.filter((p) => p.status === 'pending') ?? [];
  const history = data?.payments.filter((p) => p.status !== 'pending') ?? [];

  return (
    <div>
      <PageHeader
        title="Pembayaran"
        description={scope === 'event' ? 'Setujui pembayaran tunai tamu. QRIS terkonfirmasi otomatis.' : 'Semua pembayaran dari semua event.'}
        actions={
          <>
            <Button variant="ghost" onClick={() => setSound((s) => !s)} aria-pressed={sound}>{sound ? <Volume2 /> : <VolumeX />} Bunyi</Button>
            <Button variant="secondary" onClick={() => void load()}><RefreshCcw /> Refresh</Button>
          </>
        }
      />
      {data && !data.ok ? (
        <p className="mb-5 rounded-[12px] bg-warn-soft px-4 py-3 text-sm text-warn">Tabel pembayaran belum ada. Jalankan migrasi <code>…10_v5_payments_storage_devpanel.sql</code> (lihat Portal Pemilik › Developer).</p>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Pendapatan hari ini" value={formatRupiah(data?.totals.revenue ?? 0)} />
        <Stat label="Transaksi lunas" value={data?.totals.paidCount ?? 0} unit="hari ini" />
        <Stat label="Menunggu" value={pending.length} unit="pembayaran" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel>
          <PanelHeader title="Menunggu konfirmasi" description="Cocokkan kode di layar booth / HP tamu, terima uangnya, lalu Setujui." />
          {!pending.length ? (
            <EmptyState icon={<Banknote />} title="Tidak ada yang menunggu" description="Pembayaran tunai baru muncul di sini otomatis (dengan bunyi)." />
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="flex gap-1" aria-label={`Kode ${p.shortCode}`}>
                    {p.shortCode.split('').map((ch, i) => (
                      <span key={i} className="flex size-11 items-center justify-center rounded-[8px] border-2 border-ink bg-sun font-techno text-xl font-black">{ch}</span>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-techno text-xl font-bold">{formatRupiah(p.amount)}</p>
                    <p className="text-xs text-muted">
                      {p.purpose === 'ai' ? 'Gambar AI' : 'Sesi foto'} · {p.method === 'qris' ? 'QRIS (menunggu)' : 'Tunai'}
                      {scope === 'admin' && p.eventName ? ` · ${p.eventName}` : ''} · {timeAgo(p.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => void decide(p, 'approve')} loading={busy === p.id}><Check /> Setujui</Button>
                    <Button variant="danger-ghost" onClick={() => void decide(p, 'decline')} disabled={busy === p.id}><X /> Tolak</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Riwayat" />
          {!history.length ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Belum ada.</p>
          ) : (
            <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
              {history.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  {p.method === 'qris' ? <QrCode className="size-4 text-muted" /> : <Banknote className="size-4 text-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {formatRupiah(p.amount)} · {p.purpose === 'ai' ? 'AI' : 'Sesi'} <span className="font-mono text-xs text-muted">{p.shortCode}</span>
                    </p>
                    <p className="truncate text-xs text-muted">{formatDateTime(p.createdAt)}{scope === 'admin' && p.eventName ? ` · ${p.eventName}` : ''}{p.decidedBy ? ` · oleh ${p.decidedBy}` : ''}</p>
                  </div>
                  <Badge tone={TONE[p.status]} dot>{PAYMENT_STATUS_LABEL[p.status]}{p.consumed ? ' · dipakai' : ''}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
