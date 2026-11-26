'use client';

/**
 * "PILIH KARAKTER" — a console character-select screen: live 3D buddy on a
 * pedestal (drag to spin), portrait grid with a "?" random tile, stat bars,
 * and an announcer call-out on confirm. Keyboard: ← → ↑ ↓, Enter, Esc.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Mascot3D, useMascotPortraits } from '@/components/mascot/Mascot3D';
import { MASCOTS, MASCOT_IDS, randomMascot, type MascotId } from '@/lib/mascots';
import { sfx } from '@/lib/sfx';
import { cn } from '@/lib/utils';
import { PixelIcon } from './retro';

export function CharacterSelect({
  initial,
  onPick,
  onBack,
  subtitle = 'Pemandu ini akan menemanimu sampai selesai',
  className,
}: {
  initial?: MascotId;
  onPick: (id: MascotId) => void;
  onBack?: () => void;
  subtitle?: string;
  className?: string;
}) {
  const [cur, setCur] = useState<MascotId>(initial ?? 'kaget');
  const [emote, setEmote] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [announce, setAnnounce] = useState<MascotId | null>(null);
  const portraits = useMascotPortraits();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const m = MASCOTS[cur];

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const choose = (id: MascotId) => {
    if (announce) return;
    sfx.tick();
    setCur(id);
    setEmote((e) => e + 1);
  };

  const roll = () => {
    if (rolling || announce) return;
    setRolling(true);
    let id = cur;
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      timers.current.push(
        setTimeout(() => {
          id = randomMascot(id);
          setCur(id);
          sfx.tick();
          if (i === steps - 1) {
            setRolling(false);
            setEmote((e) => e + 1);
            sfx.select();
          }
        }, 60 + i * i * 9),
      );
    }
  };

  const confirm = () => {
    if (announce || rolling) return;
    sfx.tada();
    setAnnounce(cur);
    setEmote((e) => e + 1);
    timers.current.push(setTimeout(() => onPick(cur), 1100));
  };

  // Keyboard navigation (desktop / Bluetooth keyboards at the booth)
  const keyRef = useRef({ choose, confirm, onBack, cur });
  useEffect(() => {
    keyRef.current = { choose, confirm, onBack, cur };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      const i = MASCOT_IDS.indexOf(k.cur);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') k.choose(MASCOT_IDS[(i + 1) % MASCOT_IDS.length]);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') k.choose(MASCOT_IDS[(i + MASCOT_IDS.length - 1) % MASCOT_IDS.length]);
      else if (e.key === 'Enter') k.confirm();
      else if (e.key === 'Escape') k.onBack?.();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={cn('kiosk fixed inset-0 z-30 flex flex-col overflow-hidden bg-[#132E9A] text-white', className)}>
      {/* Backdrop: checkerboard + perspective floor grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:repeating-conic-gradient(#2747C9_0_25%,#1F3BAA_0_50%)] [background-size:72px_72px] opacity-80" />
      <div aria-hidden className="pointer-events-none absolute inset-x-[-30%] bottom-[-10%] h-[55%] origin-bottom [transform:perspective(500px)_rotateX(62deg)] [background-image:linear-gradient(rgb(158_216_255/0.6)_2px,transparent_2px),linear-gradient(90deg,rgb(158_216_255/0.6)_2px,transparent_2px)] [background-size:64px_64px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_30%_55%,rgb(158_216_255/0.35),transparent_70%)]" />

      {/* Header band */}
      <header className="relative z-10 flex items-center gap-3 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3 border-y-[3px] border-r-[3px] border-ink bg-brand py-2 pr-8 pl-4 shadow-[4px_4px_0_var(--color-ink)] [clip-path:polygon(0_0,100%_0,calc(100%-22px)_100%,0_100%)] sm:pl-6">
          <span className="rounded-[4px] border-2 border-ink bg-sun px-1.5 font-pixel text-[13px] font-bold text-ink">P1</span>
          <h1 className="text-[clamp(22px,4vw,40px)] leading-none tracking-wide text-white uppercase italic [text-shadow:2px_2px_0_#1A1410]">Pilih karakter</h1>
        </div>
        <p className="hidden font-pixel text-[15px] text-white/85 [text-shadow:1px_1px_0_#1A1410] md:block">{subtitle}</p>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 px-3 pt-2 pb-2 sm:px-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:grid-rows-1 md:gap-6">
        {/* Stage + info */}
        <section className="relative flex min-h-0 flex-col items-center md:justify-center">
          <div className="pointer-events-none absolute top-[6%] left-1/2 aspect-square w-[min(92%,62vh)] -translate-x-1/2 rounded-full border-[6px] border-white/25 bg-white/5" />
          <div className="relative min-h-0 w-full flex-1 md:max-h-[64vh]">
            <Mascot3D id={cur} pedestal draggable emote={emote} className="absolute inset-0 size-full cursor-grab active:cursor-grabbing" />
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 font-pixel text-[12px] text-white/70">↔ geser untuk memutar</span>
          </div>
          <div className="w-full max-w-md">
            <div className="flex items-end gap-3">
              <p key={cur} className="animate-pop font-display text-[clamp(30px,5vw,52px)] leading-none italic [text-shadow:3px_3px_0_#1A1410]" style={{ color: '#FFD43B' }}>
                {m.name}
              </p>
              <span className="mb-1 rounded-[4px] border-2 border-ink px-1.5 font-pixel text-[12px] font-bold text-ink" style={{ background: '#9ED8FF' }}>{m.kind}</span>
            </div>
            <p className="mt-1 text-[14px] text-white/85">{m.tagline}</p>
            <div className="mt-2 hidden grid-cols-2 gap-x-4 gap-y-1.5 rounded-[14px] border-[3px] border-ink bg-[#0C1E6E]/80 p-3 shadow-[4px_4px_0_var(--color-ink)] sm:grid">
              {m.stats.map(([label, v]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 font-pixel text-[13px] text-white/85">{label}</span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-ink">
                    <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${v * 10}%`, background: 'linear-gradient(#FFE27A,#F2B705)' }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Roster */}
        <section className="flex min-h-0 flex-col justify-center gap-3">
          <div className="grid grid-cols-5 gap-2 sm:gap-3 md:grid-cols-2">
            {MASCOT_IDS.map((id, i) => {
              const sel = id === cur;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => choose(id)}
                  onDoubleClick={confirm}
                  aria-pressed={sel}
                  aria-label={MASCOTS[id].name}
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-[14px] border-[3px] border-ink shadow-[3px_3px_0_var(--color-ink)] transition md:aspect-[4/3.4]',
                    sel ? 'select-glow z-10 scale-[1.03]' : 'opacity-90 hover:opacity-100',
                    i % 2 ? 'md:translate-y-3' : '',
                  )}
                  style={{ background: `linear-gradient(160deg, #FFFDF6 0%, ${MASCOTS[id].color}55 100%)` }}
                >
                  {portraits?.[id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={portraits[id]} alt="" className="absolute inset-0 size-full object-cover object-top" draggable={false} />
                  ) : (
                    <span className="skeleton absolute inset-0" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 hidden bg-ink/80 py-1 text-center font-pixel text-[13px] font-semibold md:block">{MASCOTS[id].name}</span>
                  {sel ? (
                    <>
                      <span className="absolute top-1 left-1 rounded-[4px] border-2 border-ink bg-sun px-1 font-pixel text-[11px] font-bold text-ink">P1</span>
                      <PixelIcon name="cursor" className="cursor-bob absolute right-1 bottom-1 size-7 md:bottom-8" />
                    </>
                  ) : null}
                </button>
              );
            })}
            <button
              type="button"
              onClick={roll}
              aria-label="Pilih acak"
              className="relative flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] border-[3px] border-ink bg-sun text-ink shadow-[3px_3px_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none md:col-span-2 md:aspect-auto md:h-16 md:flex-row md:gap-3"
            >
              <span className={cn('flex size-[min(40px,60%)] items-center justify-center rounded-[6px] border-2 border-ink bg-[#F2B705] font-display text-xl text-white [text-shadow:1px_1px_0_#1A1410] md:size-10', rolling && 'animate-spin')}>?</span>
              <span className="font-pixel text-[12px] font-bold md:text-[18px]">ACAK</span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            {onBack ? (
              <Button variant="win" size="lg" onClick={() => { sfx.back(); onBack(); }}>
                <ArrowLeft /> Kembali
              </Button>
            ) : <span />}
            <Button variant="win-go" size="xl" className="min-w-44 text-xl" onClick={confirm} disabled={rolling}>
              <Check /> Pilih!
            </Button>
          </div>
        </section>
      </div>

      <footer className="relative z-10 flex items-center justify-center gap-5 border-t-[3px] border-ink bg-ink/70 px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))] font-pixel text-[13px] text-white/85">
        <span><b className="text-sun">Ketuk</b> pilih</span>
        <span><b className="text-sun">Ketuk 2×</b> / Pilih! konfirmasi</span>
        <span className="hidden sm:inline"><b className="text-sun">?</b> acak</span>
      </footer>

      {announce ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-ink/30">
          <p className="animate-pop -rotate-6 font-display text-[clamp(48px,11vw,140px)] leading-none text-sun uppercase italic [text-shadow:5px_5px_0_#C4201A,9px_9px_0_#1A1410]">
            {MASCOTS[announce].name}!
          </p>
        </div>
      ) : null}
    </div>
  );
}
