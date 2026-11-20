'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EnterCode() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const valid = /^[A-Z0-9]{4,12}$/.test(code);
  return (
    <form
      className="rounded-[20px] bg-white p-4 shadow-[0_1px_0_rgba(14,20,36,0.06),0_20px_40px_-24px_rgba(14,20,36,0.35)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/booth/${code}`);
      }}
    >
      <label htmlFor="code" className="mb-2 block text-xs font-bold tracking-wider text-muted uppercase">Kode event</label>
      <input
        id="code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
        placeholder="QC6XJ2"
        autoCapitalize="characters"
        autoComplete="off"
        className="h-14 w-full rounded-[12px] border border-line-strong bg-canvas px-4 font-mono text-2xl font-bold tracking-[0.3em] uppercase placeholder:text-faint focus:border-brand focus:outline-none"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="submit" variant="ink" size="lg" disabled={!valid}><Camera /> Buka booth</Button>
        <Button type="button" variant="secondary" size="lg" disabled={!valid} onClick={() => router.push(`/event/${code}`)}><LayoutGrid /> Kelola event</Button>
      </div>
      <p className="mt-3 text-xs text-muted">Booth & portal event meminta PIN event dari penyelenggara.</p>
    </form>
  );
}
