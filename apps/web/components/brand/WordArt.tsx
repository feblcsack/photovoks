'use client';

/**
 * <WordArt> — late-90s WordArt titles in CSS (no images, scales crisply).
 *
 * Used sparingly for moments that deserve a "title card": the booth welcome,
 * the result screen, payment success, maintenance / error screens, zine
 * covers and the developer panel header. Body copy never uses it.
 *
 * Two stacked layers: the back layer draws the 3D extrusion (text-shadow on a
 * solid colour), the front layer is clipped to the gradient fill + outline.
 * (text-shadow can't sit under a background-clip:text gradient on one node.)
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { cssExtrusion, cssGradient, WORDART_BY_ID, type WordArtStyleId } from '@/lib/wordart';

const FAMILY: Record<string, string> = {
  impact: 'var(--font-impact)',
  heavy: 'var(--font-heavy)',
  display: 'var(--font-display)',
  serif: 'Georgia, "Times New Roman", serif',
};

const SHAPE: Record<string, React.CSSProperties> = {
  flat: {},
  slant: { transform: 'skewY(-6deg) skewX(-8deg)' },
  perspective: { transform: 'perspective(420px) rotateX(18deg)', transformOrigin: '50% 100%' },
  wave: {},
  bulge: {},
  arc: {},
};

export function WordArt({
  children,
  variant = 'rainbow',
  className,
  as: Tag = 'span',
  title,
}: {
  children: string;
  variant?: WordArtStyleId;
  className?: string;
  as?: 'span' | 'h1' | 'h2' | 'p';
  /** Accessible text (defaults to children). */
  title?: string;
}) {
  const s = WORDART_BY_ID[variant] ?? WORDART_BY_ID.rainbow;
  const fontFamily = FAMILY[s.font];
  const base: React.CSSProperties = {
    fontFamily,
    fontWeight: 400,
    fontStyle: s.italic ? 'italic' : 'normal',
    letterSpacing: s.font === 'impact' ? '0.01em' : '-0.01em',
    lineHeight: 1.05,
    whiteSpace: 'pre',
  };

  if (s.shape === 'arc' || s.shape === 'wave' || s.shape === 'bulge') {
    return (
      <Tag className={cn('inline-block select-none', className)} aria-label={title ?? children} role="img">
        <SvgWordArt text={children} variant={variant} fontFamily={fontFamily} />
      </Tag>
    );
  }

  const stroke = s.stroke ? `${s.stroke.width}em ${s.stroke.color}` : undefined;
  return (
    <Tag className={cn('relative inline-block select-none', className)} aria-label={title ?? children} style={{ ...SHAPE[s.shape ?? 'flat'] }}>
      {/* Extrusion + shadow layer */}
      <span aria-hidden className="block" style={{ ...base, color: s.extrude?.color ?? 'transparent', textShadow: cssExtrusion(s), WebkitTextStroke: stroke }}>
        {children}
      </span>
      {/* Gradient face */}
      <span
        aria-hidden
        className="absolute inset-0 block"
        style={{
          ...base,
          backgroundImage: cssGradient(s),
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: stroke,
          paintOrder: 'stroke fill',
        }}
      >
        {children}
      </span>
    </Tag>
  );
}

/** Arc / wave / bulge shapes via SVG (per-letter placement). */
function SvgWordArt({ text, variant, fontFamily }: { text: string; variant: WordArtStyleId; fontFamily: string }) {
  const s = WORDART_BY_ID[variant];
  const id = React.useId().replace(/:/g, '');
  const n = Math.max(1, text.length);
  const W = Math.max(160, n * (s.font === 'impact' ? 44 : 54) + 40);
  const H = s.shape === 'arc' ? 170 : 130;
  const ext = s.extrude ? Math.round(s.extrude.depth * 100) : 0;
  const path = s.shape === 'arc' ? `M 20 ${H - 30} Q ${W / 2} ${-H * 0.55} ${W - 20} ${H - 30}` : `M 10 ${H * 0.62} C ${W * 0.3} ${H * 0.25}, ${W * 0.7} ${H * 1.0}, ${W - 10} ${H * 0.45}`;
  const fontSize = s.shape === 'bulge' ? 92 : 84;
  const textProps = { fontFamily, fontSize, textAnchor: 'middle' as const, letterSpacing: s.font === 'impact' ? 1 : -1 };
  const body = (fill: string, stroke?: string, sw?: number, dx = 0, dy = 0) =>
    s.shape === 'bulge' ? (
      <text x={W / 2 + dx} y={H * 0.72 + dy} {...textProps} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" transform={`translate(${W / 2} ${H / 2}) scale(1 1.25) translate(${-W / 2} ${-H / 2})`}>
        {text}
      </text>
    ) : (
      <text {...textProps} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" transform={`translate(${dx} ${dy})`}>
        <textPath href={`#p${id}`} startOffset="50%">{text}</textPath>
      </text>
    );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[1.6em] w-auto overflow-visible" aria-hidden>
      <defs>
        <path id={`p${id}`} d={path} />
        <linearGradient id={`g${id}`} x1="0" y1="0" x2={s.horizontal ? '1' : '0'} y2={s.horizontal ? '0' : '1'}>
          {s.fill.map((c, i) => (
            <stop key={i} offset={i / Math.max(1, s.fill.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      {s.extrude ? Array.from({ length: ext }, (_, i) => <React.Fragment key={i}>{body(s.extrude!.color, s.extrude!.color, 2, s.extrude!.dx * (ext - i), s.extrude!.dy * (ext - i))}</React.Fragment>) : null}
      {s.stroke ? body('none', s.stroke.color, s.stroke.width * fontSize * 2) : null}
      {body(`url(#g${id})`)}
    </svg>
  );
}
