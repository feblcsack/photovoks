'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { PinPad } from '@/components/ui/pin-pad';
import { api } from '@/lib/fetcher';

export function EventGate({ code, name, hasPin }: { code: string; name: string; hasPin: boolean }) {
  const router = useRouter();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[380px] rounded-[22px] border border-line bg-surface px-7 py-8 shadow-panel">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-11 items-center justify-center rounded-[12px] bg-brand-soft text-brand"><KeyRound className="size-5" /></span>
          <p className="font-mono text-xs tracking-[0.2em] text-muted">{code}</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-muted">{hasPin ? 'Masukkan PIN event untuk mengelola event ini.' : 'Event belum punya PIN — pemilik perlu mengaturnya.'}</p>
        </div>
        {hasPin ? (
          <div className="flex justify-center">
            <PinPad
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
          </div>
        ) : null}
      </div>
      <p className="mt-6 text-xs text-muted">
        Pemilik? <Link href={`/admin/pin?next=/admin/events`} className="font-semibold text-brand">Masuk portal pemilik</Link>
      </p>
    </main>
  );
}
