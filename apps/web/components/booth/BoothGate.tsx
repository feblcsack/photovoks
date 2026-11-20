'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { PinPad } from '@/components/ui/pin-pad';
import { api } from '@/lib/fetcher';

/** Operator unlocks a booth device with the event PIN (once per device/day). */
export function BoothGate({ code, eventName, hasPin }: { code: string; eventName: string; hasPin: boolean }) {
  const router = useRouter();
  return (
    <main className="kiosk flex min-h-dvh flex-col items-center justify-center bg-[#0B0F1A] px-6 py-10 text-white">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-white/10"><Lock className="size-5" /></span>
        <p className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">Booth · {code}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{eventName}</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">{hasPin ? 'Masukkan PIN event untuk mengaktifkan booth di perangkat ini.' : 'Event ini belum punya PIN. Atur PIN di portal pemilik terlebih dahulu.'}</p>
      </div>
      {hasPin ? (
        <PinPad
          dark
          length={8}
          onSubmit={async (pin) => {
            try {
              await api(`/api/events/${code}/unlock`, { method: 'POST', json: { pin } });
              router.refresh();
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : 'PIN salah';
            }
          }}
        />
      ) : (
        <Link href="/admin" className="rounded-ctl bg-white px-4 py-2.5 text-sm font-bold text-ink">Buka portal pemilik</Link>
      )}
      <Link href="/" className="mt-10 text-sm text-white/50 hover:text-white">← Ganti kode event</Link>
    </main>
  );
}
