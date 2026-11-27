'use client';

/** Owner (admin) PIN login. */
import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Aperture } from 'lucide-react';
import { PinPad } from '@/components/ui/pin-pad';
import { api } from '@/lib/fetcher';

function AdminPin() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const target = next && next.startsWith('/admin') && !next.startsWith('/admin/pin') ? next : '/admin';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[380px] rounded-[22px] border border-line bg-surface px-7 py-8 shadow-panel">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-11 items-center justify-center rounded-[12px] bg-ink text-white"><Aperture className="size-5" /></span>
          <h1 className="text-xl font-extrabold tracking-tight">Portal Pemilik</h1>
          <p className="mt-1 text-sm text-muted">Masukkan PIN admin</p>
        </div>
        <div className="flex justify-center">
          <PinPad
            length={8}
            onSubmit={async (pin) => {
              try {
                await api('/api/admin/verify-pin', { method: 'POST', json: { pin } });
                // One navigation (no extra refresh round-trip). Keep the pad
                // in its loading state while the dashboard streams in
                // (admin/(portal)/loading.tsx shows instantly).
                router.replace(target);
                await new Promise((r) => setTimeout(r, 8000));
                return null;
              } catch (e) {
                const status = (e as { status?: number }).status;
                if (status === 423) return 'Terkunci sementara. Coba lagi dalam 5 menit.';
                if (status === 401) return 'PIN salah';
                return e instanceof Error ? e.message : 'Gagal masuk';
              }
            }}
          />
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-muted">
        Operator event? <Link href="/" className="font-semibold text-brand">Masuk dengan kode event</Link>
        <br />
        Lupa PIN admin: jalankan <code className="font-mono">pnpm configure --pin</code>
      </p>
    </main>
  );
}

export default function AdminPinPage() {
  return (
    <Suspense>
      <AdminPin />
    </Suspense>
  );
}
