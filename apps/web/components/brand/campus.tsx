'use client';

/**
 * UI Depok campus pieces in the Photovoks sticker style (flat fills, ink
 * outline, hard shadow): the Rektorat tower, the yellow "bikun" campus bus,
 * trees, clouds and the little plane with its dotted flight path.
 * Original drawings — no official logos. Pure SVG (zero egress).
 */
import React from 'react';
import { cn } from '@/lib/utils';

const INK = '#1A1410';
const ROOF = '#9B3D2E';
const ROOF_DARK = '#74281D';
const WALL = '#F4E6C8';
const WALL_SHADE = '#E2CFA6';
const GLASS = '#2B3A5C';

// ── Rektorat ─────────────────────────────────────────────────────────────────

/** The tiered Rektorat tower with its pyramid roof, spire and low pavilions. */
export function Rektorat({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const tiers = Array.from({ length: 9 }, (_, i) => 132 + i * 15);
  return (
    <svg viewBox="0 0 240 320" className={cn('block', className)} style={style} role="img" aria-label="Gedung Rektorat UI">
      <g stroke={INK} strokeWidth={2.2} strokeLinejoin="round">
        {/* hard shadow */}
        <path d="M58 132 L190 132 L196 290 L52 290 Z" fill={INK} opacity={0.18} stroke="none" transform="translate(6 6)" />
        {/* spire */}
        <path d="M120 6 L120 44" strokeWidth={3} />
        <circle cx={120} cy={8} r={3} fill={INK} />
        {/* top pyramid */}
        <path d="M120 40 L66 112 L174 112 Z" fill={ROOF} />
        <path d="M120 40 L120 112 L174 112 Z" fill={ROOF_DARK} />
        <path d="M120 40 L96 112 M120 40 L146 112" stroke={INK} strokeWidth={1} opacity={0.5} />
        {/* crest band */}
        <rect x={74} y={112} width={92} height={22} fill={WALL} />
        <circle cx={120} cy={123} r={8} fill="#FFD43B" />
        <path d="M113 123 q7 -9 14 0 q-7 9 -14 0z" fill="#C9A227" strokeWidth={1.2} />
        {[80, 92, 140, 152].map((x) => (
          <rect key={x} x={x} y={117} width={8} height={10} fill={GLASS} strokeWidth={1.2} />
        ))}
        {/* stacked tiers: eave roof + window band */}
        {tiers.map((y, i) => {
          const w = 128 + i * 2.2;
          const l = 120 - w / 2;
          return (
            <g key={y}>
              <rect x={l + 3} y={y + 4} width={w - 6} height={11} fill={i % 2 ? WALL : WALL_SHADE} />
              {Array.from({ length: Math.floor((w - 14) / 10) }, (_, k) => (
                <rect key={k} x={l + 8 + k * 10} y={y + 6.5} width={6} height={6} fill={GLASS} strokeWidth={1} />
              ))}
              <path d={`M${l + 6} ${y - 2} L${l + w - 6} ${y - 2} L${l + w + 5} ${y + 5} L${l - 5} ${y + 5} Z`} fill={ROOF} />
            </g>
          );
        })}
        {/* glass stair core */}
        <rect x={112} y={136} width={16} height={140} fill="#3D5487" />
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M112 ${142 + i * 15} L128 ${150 + i * 15}`} stroke="#9ED8FF" strokeWidth={1} />
        ))}
        {/* pavilions with pyramid roofs */}
        <rect x={4} y={278} width={232} height={30} fill={WALL} />
        {[16, 40, 64, 152, 176, 200, 224].map((x) => (
          <rect key={x} x={x - 3} y={284} width={6} height={24} fill={WALL_SHADE} strokeWidth={1.2} />
        ))}
        <path d="M2 280 L46 252 L90 280 Z" fill={ROOF} />
        <path d="M150 280 L194 252 L238 280 Z" fill={ROOF} />
        <path d="M46 252 L46 280 L90 280 Z M194 252 L194 280 L238 280 Z" fill={ROOF_DARK} />
        <rect x={96} y={288} width={48} height={20} fill={GLASS} />
        <path d="M0 308 H240" strokeWidth={3} />
      </g>
    </svg>
  );
}

// ── Bikun (yellow campus bus) ────────────────────────────────────────────────

/** Side view of the yellow campus bus with green leaf livery. Faces right. */
export function Bikun({ className, style, moving = false }: { className?: string; style?: React.CSSProperties; moving?: boolean }) {
  const wheel = (cx: number) => (
    <g>
      <circle cx={cx} cy={92} r={15} fill={INK} />
      <g className={moving ? 'bikun-wheel' : undefined} style={{ transformOrigin: `${cx}px 92px` }}>
        <circle cx={cx} cy={92} r={8} fill="#E7B416" stroke={INK} strokeWidth={1.5} />
        <path d={`M${cx - 7} 92 H${cx + 7} M${cx} 85 V99`} stroke={INK} strokeWidth={1.5} />
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 300 112" className={cn('block', className)} style={style} role="img" aria-label="Bis kuning UI (bikun)">
      <g stroke={INK} strokeWidth={2.4} strokeLinejoin="round">
        <path d="M14 86 H290" stroke={INK} opacity={0.2} strokeWidth={8} strokeLinecap="round" />
        {/* AC unit on the roof */}
        <rect x={60} y={6} width={92} height={10} rx={3} fill="#FFE27A" />
        <rect x={86} y={8} width={20} height={4} fill="#E25B3A" strokeWidth={1} />
        {/* body */}
        <path d="M10 22 Q10 14 20 14 H262 Q280 14 286 30 L292 60 Q294 68 294 76 V86 Q294 92 288 92 H12 Q8 92 8 86 Z" fill="#FFD43B" />
        {/* green leaf livery */}
        <g strokeWidth={1.6}>
          <path d="M18 84 C30 56 54 50 70 58 C60 72 44 84 18 84Z" fill="#2FA36B" />
          <path d="M60 84 C74 60 98 58 112 64 C102 76 86 84 60 84Z" fill="#45C07F" />
          <path d="M118 84 C130 52 168 46 190 56 C178 74 154 84 118 84Z" fill="#2FA36B" />
          <path d="M186 84 C200 66 226 62 240 70 C228 80 212 84 186 84Z" fill="#45C07F" />
          <path d="M246 84 C252 72 266 68 276 72 C270 80 260 84 246 84Z" fill="#2FA36B" />
        </g>
        {/* windows */}
        <rect x={18} y={22} width={206} height={24} rx={3} fill={GLASS} />
        {[58, 100, 142, 184].map((x) => (
          <path key={x} d={`M${x} 22 V46`} strokeWidth={2} />
        ))}
        <path d="M24 42 L40 26 M66 42 L82 26 M150 42 L166 26" stroke="#9ED8FF" strokeWidth={1.6} opacity={0.8} />
        {/* door + windshield */}
        <rect x={232} y={22} width={22} height={60} rx={2} fill={GLASS} />
        <path d="M262 20 H276 Q284 22 288 40 L290 50 H262 Z" fill={GLASS} />
        <path d="M268 24 L280 44" stroke="#9ED8FF" strokeWidth={1.6} opacity={0.8} />
        {/* lights + bumper */}
        <circle cx={286} cy={70} r={3.5} fill="#FFF6C4" />
        <rect x={6} y={58} width={6} height={10} fill="#E25B3A" strokeWidth={1.5} />
        <path d="M262 88 H294" strokeWidth={4} />
      </g>
      <text x={124} y={55} textAnchor="middle" fontFamily="'Arial Black', Arial, sans-serif" fontWeight={900} fontSize={7.5} fill={INK} letterSpacing={0.8}>
        BIKUN · KAMPUS UI DEPOK
      </text>
      {wheel(62)}
      {wheel(240)}
    </svg>
  );
}

// ── Trees, clouds, plane ─────────────────────────────────────────────────────

export function Trees({ className, style, count = 4 }: { className?: string; style?: React.CSSProperties; count?: number }) {
  const greens = ['#2E8B3E', '#3FA34F', '#57B85E', '#2A7A45'];
  return (
    <svg viewBox={`0 0 ${count * 46 + 20} 90`} className={cn('block', className)} style={style} aria-hidden>
      <g stroke={INK} strokeWidth={2} strokeLinejoin="round">
        {Array.from({ length: count }, (_, i) => {
          const x = 30 + i * 46;
          const h = i % 2 ? 0 : 8;
          return (
            <g key={i}>
              <rect x={x - 3} y={56} width={6} height={30} fill="#7A4A22" />
              <circle cx={x} cy={46 + h} r={22} fill={greens[i % greens.length]} />
              <circle cx={x - 14} cy={56 + h} r={13} fill={greens[(i + 1) % greens.length]} />
              <circle cx={x + 13} cy={54 + h} r={14} fill={greens[(i + 2) % greens.length]} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** Small airliner with a dashed flight path (like the campus postcard). */
export function PlanePath({ className, style, label }: { className?: string; style?: React.CSSProperties; label?: string }) {
  const id = React.useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 420 160" className={cn('block overflow-visible', className)} style={style} aria-hidden={!label}>
      <defs>
        <path id={`pp${id}`} d="M60 52 C120 40 160 120 230 110 S330 40 410 70" />
      </defs>
      <path d="M60 52 C120 40 160 120 230 110 S330 40 410 70" fill="none" stroke="#E2622B" strokeWidth={2.5} strokeDasharray="7 7" />
      {label ? (
        <text fontFamily="var(--font-typewriter), 'Courier New', monospace" fontSize={22} fill="#B7552A" letterSpacing={2}>
          <textPath href={`#pp${id}`} startOffset="22%">{label}</textPath>
        </text>
      ) : null}
      <g transform="translate(6 30) rotate(-12)" stroke={INK} strokeWidth={1.8} strokeLinejoin="round">
        <path d="M0 18 Q4 10 18 10 H52 Q60 10 62 16 Q60 22 52 22 H14 Q2 22 0 18Z" fill="#FFFFFF" />
        <path d="M44 10 L54 0 H60 L56 12Z" fill="#C4201A" />
        <path d="M26 12 L36 2 H42 L38 14Z M26 20 L38 30 H44 L38 18Z" fill="#DCE3EC" />
        <path d="M8 14 h30" stroke={GLASS} strokeWidth={2.5} strokeDasharray="2 3" />
      </g>
    </svg>
  );
}

// ── Compositions ─────────────────────────────────────────────────────────────

/** Bikun driving across the bottom of the screen on a little road (loops). */
export function BikunDrive({ className, speed = 22 }: { className?: string; speed?: number }) {
  return (
    <div className={cn('pointer-events-none absolute inset-x-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute inset-x-0 bottom-0 h-[26%] border-t-2 border-ink bg-[#5B5E66] [background-image:repeating-linear-gradient(90deg,#FFF6C4_0_28px,transparent_28px_64px)] [background-position:0_55%] [background-repeat:repeat-x] [background-size:64px_3px]" />
      <div className="bikun-drive absolute bottom-[14%] h-[78%]" style={{ animationDuration: `${speed}s` }}>
        <Bikun moving className="h-full w-auto" />
      </div>
    </div>
  );
}

/** Rektorat on a hill with trees and the plane path — page background accent. */
export function RektoratScene({ className, label = 'Universitas Indonesia', compact = false }: { className?: string; label?: string; compact?: boolean }) {
  return (
    <div className={cn('pointer-events-none relative', className)} aria-hidden>
      {!compact ? <PlanePath className="absolute -top-[22%] -left-[60%] w-[150%]" label={label} /> : null}
      <Rektorat className="relative mx-auto w-[78%] drop-shadow-[4px_6px_0_rgba(26,20,16,0.25)]" />
      <Trees count={5} className="absolute -bottom-[3%] left-[-6%] w-[112%]" />
    </div>
  );
}
