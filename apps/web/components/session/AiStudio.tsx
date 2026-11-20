'use client';

import React, { useMemo, useState } from 'react';
import { Download, ImageIcon, PenLine, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { AI_STYLES, aiStyleLabel, CUSTOM_STYLE_ID, GUEST_PROMPT_ID, GUEST_PROMPT_MAX } from '@/lib/ai/styles';
import { api } from '@/lib/fetcher';
import type { AiGenerationView, GuestSessionData } from '@/lib/session-types';
import { cn } from '@/lib/utils';

const FAIL_TEXT: Record<string, string> = {
  not_configured: 'AI belum dikonfigurasi.',
  auth: 'API key AI ditolak.',
  insufficient_credits: 'Kredit AI habis.',
  safety: 'Ditolak filter keamanan AI.',
  rate_limited: 'AI sedang sibuk.',
  timeout: 'AI terlalu lama merespons.',
  daily_cap_reached: 'Batas harian AI tercapai.',
  empty_response: 'Model tidak mengembalikan gambar.',
  bad_request: 'Model menolak permintaan.',
};

const PROMPT_IDEAS = ['jadi astronot di luar angkasa', 'lukisan minyak gaya klasik', 'karakter game pixel art', 'poster film tahun 80-an'];

export function AiStudio({ token, data, refresh, onPrint, dark = false, compact = false }: { token: string; data: GuestSessionData; refresh: () => Promise<unknown>; onPrint?: (gen: AiGenerationView) => void; dark?: boolean; compact?: boolean }) {
  const toast = useToast();
  const { session, event, aiConfigured } = data;
  const styles = useMemo(() => {
    const list = AI_STYLES.filter((s) => event.aiStyles.includes(s.id)).map((s) => ({ id: s.id, label: s.label, description: s.description, swatch: s.swatch }));
    if (event.aiStyles.includes(CUSTOM_STYLE_ID) && event.hasCustomStyle) list.unshift({ id: CUSTOM_STYLE_ID, label: 'Gaya event', description: 'Gaya khusus dari penyelenggara', swatch: ['#1A2C8F', '#FFD43B'] });
    if (event.aiGuestPrompt) list.push({ id: GUEST_PROMPT_ID, label: 'Tulis sendiri', description: 'Ketik ide kamu', swatch: ['#FFFFFF', '#1B1B1F'] });
    return list;
  }, [event]);
  const [styleId, setStyleId] = useState(styles[0]?.id ?? '');
  const [shot, setShot] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const isPrompt = styleId === GUEST_PROMPT_ID;
  const promptOk = !isPrompt || prompt.trim().length >= 3;

  const used = session.ai.filter((a) => a.status !== 'failed' && a.status !== 'failed_safety' && !a.id.startsWith('legacy')).length;
  const remaining = Math.max(0, event.aiPerSession - used);
  const results = [...session.ai].reverse();
  const current = results.find((r) => r.id === active) ?? results[0] ?? null;

  if (!event.aiEnabled) return null;
  if (!aiConfigured) {
    return <p className={cn('rounded-[12px] px-4 py-3 text-sm', dark ? 'bg-white/5 text-white/60' : 'bg-canvas text-muted')}>Gaya AI belum diaktifkan oleh penyelenggara (API key belum dikonfigurasi).</p>;
  }

  async function generate() {
    setSubmitting(true);
    try {
      const res = await api<{ id: string }>(`/api/s/${token}/ai`, { method: 'POST', json: { styleId, shotIndex: shot, ...(isPrompt ? { prompt: prompt.trim() } : {}) } });
      setActive(res.id);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memulai AI', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function retry(id: string) {
    try {
      await api(`/api/s/${token}/ai`, { method: 'POST', json: { retryId: id } });
      setActive(id);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal mencoba ulang', 'error');
    }
  }

  const muted = dark ? 'text-white/55' : 'text-muted';

  return (
    <div className="@container">
    <div className={cn('grid gap-5', !compact && '@3xl:grid-cols-[1fr_1fr]')}>
      <div className="min-w-0">
        <p className={cn('mb-2 text-xs font-bold tracking-wider uppercase', muted)}>1 · Pilih foto</p>
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
          {session.urls.shots.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setShot(i)}
              className={cn('relative h-20 w-16 shrink-0 overflow-hidden rounded-[10px] ring-offset-2 transition', shot === i ? 'ring-3 ring-ai' : 'opacity-70 hover:opacity-100', dark && 'ring-offset-[#0B0F1A]')}
              aria-label={`Foto ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
        <p className={cn('mb-2 text-xs font-bold tracking-wider uppercase', muted)}>2 · Pilih gaya</p>
        <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyleId(s.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-[12px] border p-2.5 text-left transition',
                styleId === s.id ? 'border-ai bg-ai-soft text-ink' : dark ? 'border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]' : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              {s.id === GUEST_PROMPT_ID ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-current/20"><PenLine className="size-4" /></span>
              ) : (
                <span className="relative size-8 shrink-0 overflow-hidden rounded-full" style={{ background: s.swatch[0] }}>
                  <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: s.swatch[1] }} />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold">{s.label}</span>
                <span className={cn('block truncate text-[11px]', styleId === s.id ? 'text-muted' : muted)}>{s.description}</span>
              </span>
            </button>
          ))}
        </div>
        {isPrompt ? (
          <div className="mt-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, GUEST_PROMPT_MAX))}
              rows={3}
              placeholder="Contoh: kami jadi tokoh kartun di pantai saat senja"
              aria-label="Tulis permintaan gaya"
              className={cn('w-full resize-none rounded-[12px] border px-3 py-2.5 text-sm outline-none focus:ring-3', dark ? 'border-white/15 bg-white/[0.04] text-white placeholder:text-white/35 focus:ring-white/10' : 'border-line-strong bg-surface placeholder:text-faint focus:border-brand focus:ring-brand/15')}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {PROMPT_IDEAS.map((idea) => (
                <button key={idea} type="button" onClick={() => setPrompt(idea)} className={cn('h-7 rounded-full px-2.5 text-[12px]', dark ? 'bg-white/[0.08] text-white/80' : 'bg-ink/[0.05] text-ink-2 hover:bg-ink/10')}>{idea}</button>
              ))}
              <span className={cn('ml-auto text-[11px] tabular-nums', muted)}>{prompt.length}/{GUEST_PROMPT_MAX}</span>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <Button variant="ai" size="lg" onClick={generate} loading={submitting} disabled={!styleId || remaining === 0 || !promptOk}>
            Buat gambar
          </Button>
          <span className={cn('text-xs', muted)}>{remaining > 0 ? `Sisa ${remaining} kali` : 'Kuota AI sesi ini habis'}</span>
        </div>
      </div>

      <div className="min-w-0">
        {current ? (
          <div>
            <div className={cn('relative mx-auto flex aspect-[3/4] max-h-[60vh] items-center justify-center overflow-hidden rounded-[14px]', dark ? 'bg-white/[0.04]' : 'bg-canvas')}>
              {current.status === 'done' && current.url ? (
                <div className="grid size-full grid-cols-2 gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={session.urls.shots[current.shotIndex] ?? session.urls.shots[0]} alt="Asli" className="size-full object-cover" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={current.url} alt="Hasil AI" className="size-full object-cover" />
                  <Badge tone="dark" className="absolute top-2 left-2">Asli</Badge>
                  <Badge tone="ai" className="absolute top-2 left-[calc(50%+8px)]">{aiStyleLabel(current.styleId)}</Badge>
                </div>
              ) : current.status === 'pending' || current.status === 'processing' ? (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <Spinner className="size-7 text-ai" />
                  <p className="text-sm font-semibold">Sedang membuat gambar…</p>
                  <p className={cn('text-xs', muted)}>Biasanya 10–40 detik. Halaman ini akan memperbarui otomatis.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <p className="text-sm font-semibold text-danger">{FAIL_TEXT[current.error ?? ''] ?? 'Gagal membuat gambar.'}</p>
                  {current.status === 'failed' ? (
                    <Button size="sm" variant={dark ? 'ink' : 'secondary'} onClick={() => retry(current.id)}>
                      <RefreshCw /> Coba lagi
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
            {current.status === 'done' && current.url ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={current.url} download={`photovoks-ai-${current.styleId}.png`} target="_blank" rel="noreferrer">
                  <Button variant={dark ? 'ink' : 'secondary'} size="sm">
                    <Download /> Unduh
                  </Button>
                </a>
                {onPrint ? (
                  <Button variant={dark ? 'ink' : 'secondary'} size="sm" onClick={() => onPrint(current)}>
                    <Printer /> Cetak
                  </Button>
                ) : null}
              </div>
            ) : null}
            {results.length > 1 ? (
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                {results.map((r) => (
                  <button key={r.id} type="button" onClick={() => setActive(r.id)} className={cn('relative h-16 w-14 shrink-0 overflow-hidden rounded-[8px]', current.id === r.id ? 'ring-2 ring-ai' : 'opacity-70')}>
                    {r.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.url} alt="" className="size-full object-cover" />
                    ) : (
                      <span className={cn('flex size-full items-center justify-center text-[10px]', dark ? 'bg-white/5' : 'bg-canvas')}>{r.status === 'failed' || r.status === 'failed_safety' ? '✕' : '…'}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={cn('flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed px-6 text-center', dark ? 'border-white/15 text-white/50' : 'border-line-strong text-muted')}>
            <ImageIcon className="size-7" />
            <p className="text-sm">Hasil akan muncul di sini. Bandingkan dengan foto asli, lalu unduh atau cetak.</p>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
