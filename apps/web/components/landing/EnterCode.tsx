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
      className="p-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/booth/${code}`);
      }}
    >
      <label htmlFor="code" className="mb-1.5 block font-pixel text-[14px] font-semibold"><u>K</u>ode event:</label>
      <input
        id="code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
        placeholder="QC6XJ2"
        autoCapitalize="characters"
        autoComplete="off"
        className="bevel-in h-14 w-full bg-white px-4 font-mono text-2xl font-bold tracking-[0.3em] uppercase placeholder:text-faint focus:outline-none"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="submit" variant="win-go" size="lg" disabled={!valid}><Camera /> Buka booth</Button>
        <Button type="button" variant="win" size="lg" disabled={!valid} onClick={() => router.push(`/event/${code}`)}><LayoutGrid /> Kelola event</Button>
      </div>
      <p className="mt-3 text-xs text-ink-2">Booth & portal event meminta PIN event dari penyelenggara.</p>
    </form>
  );
}
