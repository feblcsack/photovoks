'use client';
import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: Tone; message: string }

const Ctx = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className={cn('pointer-events-auto flex max-w-md animate-pop items-center gap-2.5 rounded-[12px] px-4 py-3 text-sm font-medium text-white shadow-pop', t.tone === 'error' ? 'bg-danger' : t.tone === 'info' ? 'bg-ink' : 'bg-[#0F2A1C]')}>
            {t.tone === 'error' ? <AlertCircle className="size-[18px] shrink-0" /> : t.tone === 'info' ? <Info className="size-[18px] shrink-0" /> : <CheckCircle2 className="size-[18px] shrink-0 text-[#4ADE80]" />}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
