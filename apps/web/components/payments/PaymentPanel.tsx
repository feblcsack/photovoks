'use client';

/**
 * Pay-before-you-play panel, shared by the booth (photo session) and the
 * guest page (AI generation).
 *
 *   QRIS  → creates an Aulaa payment and opens Aulaa's QRIS popup
 *           (embed.js). A QR of the payment page is shown as a fallback so a
 *           guest can also pay from their phone. Status is polled.
 *   Cash  → shows a 4-letter code; the operator approves it in the portal
 *           (Pembayaran). The panel continues as soon as it is approved.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Banknote, QrCode, RefreshCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PixelIcon, WinPanel, WinWindow } from '@/components/os/retro';
import { WordArt } from '@/components/brand/WordArt';
import { api } from '@/lib/fetcher';
import { sfx } from '@/lib/sfx';
import { formatRupiah } from '@/lib/settings-shared';
import type { PaymentMethod, PaymentRequirement, PaymentView } from '@/lib/payments/types';
import { cn } from '@/lib/utils';

interface AulaaCheckout {
  checkout: { open: (link: string, opts: { onSuccess?: (p: unknown) => void; onClose?: (info: { paid: boolean; reason: string }) => void; theme?: 'light' | 'dark' }) => { close: () => void } | void };
}
declare global {
  interface Window {
    Aulaa?: AulaaCheckout;
  }
}

let embedPromise: Promise<boolean> | null = null;
function loadAulaaEmbed(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Aulaa) return Promise.resolve(true);
  embedPromise ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://payment.aulaa.co/embed.js';
    s.async = true;
    s.onload = () => resolve(!!window.Aulaa);
    s.onerror = () => {
      embedPromise = null;
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return embedPromise;
}

const POLL_MS = 3000;

export function PaymentPanel({
  title = 'Bayar dulu, ya!',
  what,
  requirement,
  create,
  onPaid,
  onCancel,
  kiosk = false,
  className,
}: {
  title?: string;
  /** e.g. "1 sesi foto" / "1 gambar AI" */
  what: string;
  requirement: PaymentRequirement;
  create: (method: PaymentMethod) => Promise<PaymentView>;
  onPaid: (payment: PaymentView) => void;
  onCancel: () => void;
  /** Booth: big touch targets, QR fallback for phones. */
  kiosk?: boolean;
  className?: string;
}) {
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [busy, setBusy] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const popup = useRef<{ close: () => void } | null>(null);
  const done = useRef(false);

  const finish = useCallback(
    (p: PaymentView) => {
      if (done.current) return;
      done.current = true;
      popup.current?.close();
      sfx.tada();
      setTimeout(() => onPaid(p), 1300);
    },
    [onPaid],
  );

  const openQris = useCallback(async (link: string) => {
    const ok = await loadAulaaEmbed();
    if (!ok || !window.Aulaa) return false;
    const handle = window.Aulaa.checkout.open(link, {
      theme: 'light',
      onClose: () => setPopupOpen(false),
    });
    popup.current = handle || null;
    setPopupOpen(true);
    return true;
  }, []);

  const start = useCallback(
    async (method: PaymentMethod) => {
      setBusy(method);
      setError(null);
      try {
        const p = await create(method);
        setPayment(p);
        if (p.usable) finish(p);
        else if (method === 'qris' && p.paymentLink) void openQris(p.paymentLink);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal membuat pembayaran');
        sfx.error();
      } finally {
        setBusy(null);
      }
    },
    [create, finish, openQris],
  );

  // Single method → start right away (no extra tap).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || requirement.methods.length !== 1) return;
    autoStarted.current = true;
    void start(requirement.methods[0]);
  }, [requirement.methods, start]);

  // Poll status until paid / approved / failed.
  useEffect(() => {
    if (!payment || payment.status !== 'pending') return;
    const t = setInterval(async () => {
      try {
        const res = await api<{ payment: PaymentView }>(`/api/payments/${payment.token}`);
        if (res.payment.status !== payment.status) setPayment(res.payment);
        if (res.payment.usable) finish(res.payment);
        else if (res.payment.status !== 'pending') sfx.error();
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [payment, finish]);

  const cancel = async () => {
    popup.current?.close();
    if (payment?.status === 'pending') await api(`/api/payments/${payment.token}`, { method: 'DELETE' }).catch(() => {});
    onCancel();
  };

  const paid = !!payment?.usable;
  const failed = payment && !paid && payment.status !== 'pending';

  return (
    <WinWindow title="Kasir.exe" icon="info" className={cn('w-full max-w-lg', className)} bodyClassName="p-4" onClose={() => void cancel()} closeLabel="Batal">
      {paid ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <WordArt variant="rainbow" className="text-[clamp(48px,10vw,84px)]">LUNAS!</WordArt>
          <p className="font-pixel text-[15px]">Terima kasih! Lanjut ya…</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center text-center">
            <WordArt variant="sunset" className={kiosk ? 'text-[clamp(34px,6vw,56px)]' : 'text-[34px]'}>{title}</WordArt>
            <p className="mt-2 font-pixel text-[14px] text-ink-2">{what}</p>
            <p className="mt-1 font-techno text-[clamp(30px,6vw,46px)] font-bold tracking-wide text-brand tabular-nums">{formatRupiah(requirement.amount)}</p>
          </div>

          {!payment ? (
            <div className={cn('mt-4 grid gap-2', requirement.methods.length > 1 && 'sm:grid-cols-2')}>
              {requirement.methods.includes('qris') ? (
                <Button variant="win-go" size={kiosk ? 'xl' : 'lg'} onClick={() => void start('qris')} loading={busy === 'qris'} disabled={!!busy}>
                  <QrCode /> QRIS
                </Button>
              ) : null}
              {requirement.methods.includes('cash') ? (
                <Button variant="win" size={kiosk ? 'xl' : 'lg'} onClick={() => void start('cash')} loading={busy === 'cash'} disabled={!!busy}>
                  <Banknote /> Bayar di kasir
                </Button>
              ) : null}
            </div>
          ) : payment.method === 'qris' && !failed ? (
            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="win-go" size="lg" onClick={() => payment.paymentLink && void openQris(payment.paymentLink)}>
                  <QrCode /> {popupOpen ? 'QRIS terbuka' : 'Tampilkan QRIS'}
                </Button>
                {payment.paymentLink ? (
                  <a href={payment.paymentLink} target="_blank" rel="noreferrer" className="contents">
                    <Button variant="win" size="lg">Buka halaman bayar</Button>
                  </a>
                ) : null}
              </div>
              {kiosk && payment.paymentLink ? (
                <WinPanel className="flex items-center gap-3">
                  <div className="bg-white p-1.5"><QRCodeSVG value={payment.paymentLink} size={112} marginSize={0} /></div>
                  <p className="max-w-[200px] text-left font-pixel text-[13px] leading-snug text-ink-2">Popup QRIS tidak muncul? Scan kode ini pakai HP untuk membuka halaman bayar.</p>
                </WinPanel>
              ) : null}
              <Waiting text="Menunggu pembayaran QRIS… (dicek otomatis)" />
            </div>
          ) : payment.method === 'cash' && !failed ? (
            <div className="mt-4 flex flex-col items-center gap-3">
              <p className="font-pixel text-[14px]">Tunjukkan kode ini ke kasir / operator:</p>
              <div className="flex gap-2" aria-label={`Kode bayar ${payment.shortCode}`}>
                {payment.shortCode.split('').map((ch, i) => (
                  <span key={i} className="bevel-in flex size-14 items-center justify-center bg-win-light font-techno text-3xl font-black sm:size-16 sm:text-4xl">{ch}</span>
                ))}
              </div>
              <Waiting text="Menunggu konfirmasi operator…" />
            </div>
          ) : null}

          {failed ? (
            <div className="mt-4 flex flex-col items-center gap-3 text-center">
              <PixelIcon name="warning" className="size-10" />
              <p className="font-pixel text-[15px] font-bold">
                {payment!.status === 'declined' ? 'Pembayaran ditolak operator.' : payment!.status === 'expired' ? 'Waktu bayar habis.' : 'Pembayaran tidak berhasil.'}
              </p>
              <Button variant="win-primary" size="lg" onClick={() => setPayment(null)}><RefreshCcw /> Coba lagi</Button>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-center text-sm font-semibold text-danger">{error}</p> : null}

          <div className="mt-4 flex justify-center">
            <Button variant="win" onClick={() => void cancel()}><X /> Batal</Button>
          </div>
        </>
      )}
    </WinWindow>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 font-pixel text-[13px] text-ink-2">
      <Spinner className="size-4" /> {text}
    </p>
  );
}
