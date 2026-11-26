'use client';

/**
 * "Photovoks 98" — a Windows-98-flavoured kit built from the Photovoks palette
 * (cream-silver face, cobalt title bars, sky + lime desktop). Used across the
 * guest flow: booth, QR page, landing. Everything is SVG/CSS (no downloads).
 */
import React, { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { pixelRects, type PixelIconName } from '@/lib/pixel-icons';
import { cn } from '@/lib/utils';

// ── Icons ────────────────────────────────────────────────────────────────────

export function PixelIcon({ name, className, title, style }: { name: PixelIconName; className?: string; title?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className={cn('shrink-0', className)} style={style} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {pixelRects(name).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

// ── Window ───────────────────────────────────────────────────────────────────

export function WinWindow({
  title,
  icon,
  children,
  className,
  bodyClassName,
  onClose,
  closeLabel = 'Tutup',
  active = true,
  status,
  menu,
  controls = true,
  style,
}: {
  title: React.ReactNode;
  icon?: PixelIconName | React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  onClose?: () => void;
  closeLabel?: string;
  active?: boolean;
  /** Status bar text/content (bottom, sunken panes). */
  status?: React.ReactNode;
  /** Menu bar items ("File  Edit  Lihat"). Decorative. */
  menu?: string[];
  controls?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <section className={cn('bevel-out flex min-w-0 flex-col bg-win p-[3px] text-ink', className)} style={style}>
      <header className={cn('flex h-8 shrink-0 items-center gap-1.5 pr-1 pl-1.5 text-white select-none', active ? 'win-title' : 'win-title-idle')}>
        {icon ? <span className="flex size-5 shrink-0 items-center justify-center">{typeof icon === 'string' ? <PixelIcon name={icon as PixelIconName} className="size-4" /> : icon}</span> : null}
        <h2 className="min-w-0 flex-1 truncate font-pixel text-[15px] leading-none font-semibold">{title}</h2>
        {controls ? (
          <span className="flex shrink-0 gap-0.5" aria-hidden={!onClose}>
            <TitleBtn label="Kecilkan"><Minus className="size-3" strokeWidth={3.5} /></TitleBtn>
            <TitleBtn label="Besarkan"><Square className="size-2.5" strokeWidth={3.5} /></TitleBtn>
            <TitleBtn label={closeLabel} onClick={onClose} className="ml-0.5"><X className="size-3.5" strokeWidth={3.5} /></TitleBtn>
          </span>
        ) : onClose ? (
          <TitleBtn label={closeLabel} onClick={onClose}><X className="size-3.5" strokeWidth={3.5} /></TitleBtn>
        ) : null}
      </header>
      {menu?.length ? (
        <nav className="flex gap-3 px-2 py-1 font-pixel text-[13px] text-ink-2" aria-hidden>
          {menu.map((m) => (
            <span key={m}><u>{m.slice(0, 1)}</u>{m.slice(1)}</span>
          ))}
        </nav>
      ) : null}
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
      {status ? <footer className="bevel-in mt-[3px] flex min-h-6 items-center gap-2 px-2 py-0.5 font-pixel text-[12px] text-ink-2">{status}</footer> : null}
    </section>
  );
}

function TitleBtn({ children, label, onClick, className }: { children: React.ReactNode; label: string; onClick?: () => void; className?: string }) {
  if (!onClick) {
    return <span className={cn('bevel-out flex h-[22px] w-6 items-center justify-center bg-win text-ink', className)}>{children}</span>;
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn('bevel-out flex h-[22px] w-6 items-center justify-center bg-win text-ink active:bevel-in', className)}>
      {children}
    </button>
  );
}

/** Sunken white panel (list views, text areas). */
export function WinPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bevel-in bg-win-light p-2', className)}>{children}</div>;
}

// ── Taskbar ──────────────────────────────────────────────────────────────────

export function useClock(): string {
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':'));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Taskbar({ children, start, tray, className }: { children?: React.ReactNode; start?: React.ReactNode; tray?: React.ReactNode; className?: string }) {
  const clock = useClock();
  return (
    <div className={cn('bevel-out flex h-12 shrink-0 items-center gap-1.5 bg-win px-1.5 pb-[env(safe-area-inset-bottom)]', className)}>
      {start ?? <StartButton />}
      <span className="mx-0.5 h-8 w-[3px] border-x border-r-win-light border-l-win-shadow" aria-hidden />
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">{children}</div>
      <div className="bevel-in flex h-9 shrink-0 items-center gap-2 px-2.5 font-pixel text-[14px]">
        {tray}
        <span className="tabular-nums" suppressHydrationWarning>{clock}</span>
      </div>
    </div>
  );
}

export function StartButton({ onClick, label = 'Mulai', className }: { onClick?: () => void; label?: string; className?: string }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn('bevel-out flex h-9 shrink-0 items-center gap-1.5 bg-win px-2.5 font-pixel text-[16px] font-bold active:bevel-in', className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/photovoks-logo-sm.png" alt="" className="h-6 w-auto" draggable={false} />
      {label}
    </Tag>
  );
}

export function TaskItem({ children, active, icon, onClick, href, className }: { children: React.ReactNode; active?: boolean; icon?: PixelIconName; onClick?: () => void; href?: string; className?: string }) {
  const cls = cn(
    'flex h-9 max-w-48 min-w-0 shrink-0 items-center gap-1.5 px-2 font-pixel text-[14px]',
    active ? 'bevel-in bg-win-mid font-bold [background-image:repeating-conic-gradient(#fffdf6_0_25%,transparent_0_50%)] [background-size:2px_2px]' : 'bevel-out bg-win',
    className,
  );
  const inner = (
    <>
      {icon ? <PixelIcon name={icon} className="size-4" /> : null}
      <span className="truncate">{children}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

// ── Desktop ──────────────────────────────────────────────────────────────────

export function DesktopIcon({ icon, label, onClick, selected, className, children }: { icon: PixelIconName; label: string; onClick?: () => void; selected?: boolean; className?: string; children?: React.ReactNode }) {
  const inner = (
    <>
      <span className="relative">
        <PixelIcon name={icon} className={cn('size-12 drop-shadow-[2px_2px_0_rgb(26_20_16/0.35)]', selected && 'opacity-80 [filter:sepia(1)_hue-rotate(190deg)_saturate(4)]')} />
        {children}
      </span>
      <span className={cn('max-w-24 px-1 text-center font-pixel text-[13px] leading-tight text-white [text-shadow:1px_1px_0_#1A1410]', selected && 'win-focus bg-cobalt')}>{label}</span>
    </>
  );
  const cls = cn('flex w-24 flex-col items-center gap-1 p-1 outline-none', className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// ── Feedback ─────────────────────────────────────────────────────────────────

/** Yellow help balloon (with tail) — the buddy's speech bubble. */
export function Balloon({ children, title, onClose, tail = 'bottom-left', className, style }: { children: React.ReactNode; title?: React.ReactNode; onClose?: () => void; tail?: 'bottom-left' | 'bottom-right' | 'left' | 'right'; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('balloon-in relative rounded-[10px] border-2 border-ink bg-tip px-3 py-2 text-ink shadow-[3px_3px_0_rgb(26_20_16/0.35)]', className)} style={style} role="status">
      {title ? <p className="mb-0.5 flex items-center gap-1 pr-5 font-pixel text-[13px] font-bold">{title}</p> : null}
      <div className="text-[14px] leading-snug">{children}</div>
      {onClose ? (
        <button type="button" aria-label="Tutup tips" onClick={onClose} className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-[4px] text-ink-2 hover:bg-ink/10">
          <X className="size-3.5" strokeWidth={3} />
        </button>
      ) : null}
      <span
        aria-hidden
        className={cn(
          'absolute size-3.5 rotate-45 border-ink bg-tip',
          tail === 'bottom-left' && '-bottom-[9px] left-6 border-r-2 border-b-2',
          tail === 'bottom-right' && 'right-6 -bottom-[9px] border-r-2 border-b-2',
          tail === 'left' && 'top-1/2 -left-[9px] -translate-y-1/2 border-b-2 border-l-2',
          tail === 'right' && 'top-1/2 -right-[9px] -translate-y-1/2 border-t-2 border-r-2',
        )}
      />
    </div>
  );
}

/** Chunky block progress bar. `value` undefined → indeterminate marching blocks. */
export function ProgressBlocks({ value, className }: { value?: number; className?: string }) {
  return (
    <div className={cn('bevel-in h-6 overflow-hidden bg-win-light p-[3px]', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {value === undefined ? (
        <div className="boot-bar h-full w-full" />
      ) : (
        <div className="h-full transition-[width] duration-300 [background:repeating-linear-gradient(90deg,var(--color-cobalt)_0_14px,transparent_14px_17px)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      )}
    </div>
  );
}

// ── Wallpapers ───────────────────────────────────────────────────────────────

/**
 * Rolling green hill under a cloudy sky — the retro desktop wallpaper (an
 * original drawing in the app palette), with a faint CRT dot screen on top.
 */
export function HillsWallpaper({ className, dots = true }: { className?: string; dots?: boolean }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="hw-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1F5FD6" />
            <stop offset=".55" stopColor="#4F95EE" />
            <stop offset="1" stopColor="#9ED8FF" />
          </linearGradient>
          <linearGradient id="hw-hill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#B9E85A" />
            <stop offset=".35" stopColor="#7FC23E" />
            <stop offset="1" stopColor="#3F7360" />
          </linearGradient>
          <linearGradient id="hw-hill2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9FD45A" />
            <stop offset="1" stopColor="#4E8F45" />
          </linearGradient>
          <radialGradient id="hw-cloud" cx=".5" cy=".4" r=".6">
            <stop offset="0" stopColor="#fff" stopOpacity=".95" />
            <stop offset=".7" stopColor="#fff" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#hw-sky)" />
        {[
          [180, 160, 260, 70], [420, 120, 200, 55], [760, 210, 320, 80], [1120, 130, 260, 66], [1400, 230, 240, 60], [980, 330, 220, 50], [260, 330, 240, 52],
        ].map(([x, y, w, h], i) => (
          <g key={i} opacity={0.9}>
            <ellipse cx={x} cy={y} rx={w / 2} ry={h / 2} fill="url(#hw-cloud)" />
            <ellipse cx={x - w * 0.22} cy={y + h * 0.12} rx={w * 0.3} ry={h * 0.42} fill="url(#hw-cloud)" />
            <ellipse cx={x + w * 0.25} cy={y + h * 0.1} rx={w * 0.28} ry={h * 0.4} fill="url(#hw-cloud)" />
          </g>
        ))}
        <path d="M0 700 C 300 600 520 640 760 690 S 1300 640 1600 700 V1000 H0Z" fill="url(#hw-hill2)" />
        <path d="M0 780 C 260 620 640 560 980 640 C 1220 696 1420 720 1600 690 V1000 H0Z" fill="url(#hw-hill)" />
        <path d="M0 780 C 260 620 640 560 980 640" fill="none" stroke="#E6FFA0" strokeOpacity=".5" strokeWidth="6" />
      </svg>
      {dots ? <div className="absolute inset-0 opacity-[0.16] [background-image:radial-gradient(#0C1E6E_0.8px,transparent_1.1px)] [background-size:4px_4px]" /> : null}
    </div>
  );
}

/** Deep-blue console menu backdrop with drifting ribbons (frame picker). */
export function XmbBackdrop({ className }: { className?: string }) {
  const ribbons = [
    { d: 26, o: 0.5, y: 0, w: 2.2 },
    { d: 34, o: 0.35, y: 30, w: 1.4 },
    { d: 21, o: 0.28, y: -24, w: 3 },
    { d: 40, o: 0.22, y: 58, w: 1 },
  ];
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(120%_90%_at_30%_20%,#3D63E8_0%,#2747C9_30%,#132E9A_60%,#0C1E6E_100%)]', className)}>
      {ribbons.map((r, i) => (
        <div key={i} className="xmb-bob absolute inset-x-0 top-[38%] h-[36%]" style={{ ['--d' as string]: `${8 + i * 3}s`, translate: `0 ${r.y}px` }}>
          <svg viewBox="0 0 2400 300" preserveAspectRatio="none" className="xmb-wave h-full w-[200%]" style={{ ['--d' as string]: `${r.d}s` }}>
            {Array.from({ length: 9 }).map((_, k) => (
              <path
                key={k}
                d={`M0 ${150 + k * 4} C 300 ${40 + k * 12}, 600 ${260 - k * 9}, 1200 ${150 + k * 4} S 2100 ${40 + k * 12}, 2400 ${150 + k * 4}`}
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity={r.o * (1 - k / 11)}
                strokeWidth={r.w}
              />
            ))}
          </svg>
        </div>
      ))}
      <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#fff_0.7px,transparent_1px)] [background-size:3px_3px]" />
    </div>
  );
}

// ── CRT television ───────────────────────────────────────────────────────────

/** Glossy red retro TV bezel; children fill the (rounded) screen. */
export function CrtTv({ children, className, screenClassName, style, label = 'VOKS-98' }: { children: React.ReactNode; className?: string; screenClassName?: string; style?: React.CSSProperties; label?: string }) {
  return (
    <div
      className={cn('relative rounded-[34px] border-[3px] border-ink p-[clamp(12px,2.4vmin,22px)] shadow-[6px_8px_0_rgb(26_20_16/0.45)]', className)}
      style={{
        background: 'linear-gradient(160deg,#E8554D 0%,#C4201A 38%,#9E1712 72%,#C4201A 100%)',
        ...style,
      }}
    >
      {/* plastic gloss */}
      <span aria-hidden className="pointer-events-none absolute inset-x-[8%] top-[5px] h-[30%] rounded-[30px] bg-gradient-to-b from-white/35 to-transparent" />
      <div className={cn('relative overflow-hidden rounded-[22px] border-[3px] border-ink bg-black shadow-[inset_0_0_0_3px_#3a0b08]', screenClassName)}>
        {children}
        <span aria-hidden className="pointer-events-none absolute inset-0 crt-lines opacity-40" />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[19px] shadow-[inset_0_0_40px_rgba(0,0,0,0.55)]" />
        <span aria-hidden className="pointer-events-none absolute -top-[30%] -left-[20%] h-[70%] w-[70%] rotate-[-20deg] rounded-full bg-white/10 blur-md" />
      </div>
      <span aria-hidden className="absolute bottom-[3px] left-1/2 -translate-x-1/2 font-pixel text-[10px] tracking-[0.3em] text-white/70">{label}</span>
    </div>
  );
}

// ── Desktop decorations (original vector art) ────────────────────────────────

export function Goldfish({ className, style, flip }: { className?: string; style?: React.CSSProperties; flip?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 120 70" className={cn('pointer-events-none', className)} style={{ transform: flip ? 'scaleX(-1)' : undefined, ...style }}>
      <defs>
        <linearGradient id="gf" x1="0" x2="1">
          <stop offset="0" stopColor="#FFB547" />
          <stop offset=".6" stopColor="#FF7A1A" />
          <stop offset="1" stopColor="#E85A0C" />
        </linearGradient>
      </defs>
      <path d="M20 35 L2 14 Q10 35 2 56 Z" fill="#FF8A2A" stroke="#1A1410" strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="62" cy="35" rx="42" ry="24" fill="url(#gf)" stroke="#1A1410" strokeWidth="3" />
      <path d="M50 12 Q62 0 78 12" fill="#FF8A2A" stroke="#1A1410" strokeWidth="2.5" />
      <path d="M58 52 Q62 66 72 56" fill="#FF8A2A" stroke="#1A1410" strokeWidth="2.5" />
      <path d="M74 22 Q70 35 74 48" fill="none" stroke="#1A1410" strokeWidth="2" opacity=".5" />
      <circle cx="88" cy="30" r="6" fill="#fff" stroke="#1A1410" strokeWidth="2" />
      <circle cx="89.5" cy="30" r="3" fill="#1A1410" />
      <path d="M98 42 q4 2 6 -1" fill="none" stroke="#1A1410" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="54" cy="26" rx="14" ry="4" fill="#fff" opacity=".45" />
    </svg>
  );
}

export function Bubbles({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const b: Array<[number, number, number]> = [[30, 70, 22], [62, 38, 13], [78, 72, 9], [48, 14, 8]];
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={cn('pointer-events-none', className)} style={style}>
      {b.map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" />
          <path d={`M${x - r * 0.55} ${y - r * 0.2} a ${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.45} ${-r * 0.4}`} stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

export function SwearBubble({ className, text = '#@%&!' }: { className?: string; text?: string }) {
  return (
    <span aria-hidden className={cn('pointer-events-none relative inline-block border-2 border-ink bg-white px-1.5 py-0.5 font-pixel text-[13px] font-bold text-ink', className)}>
      {text}
      <span className="absolute -bottom-[7px] left-2 size-2.5 rotate-45 border-r-2 border-b-2 border-ink bg-white" />
    </span>
  );
}
