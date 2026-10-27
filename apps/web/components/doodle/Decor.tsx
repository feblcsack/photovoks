'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/* Tiny hand-drawn stickers, reused across screens so the whole app feels like
   one notebook. All aria-hidden and pointer-events: none. */

type P = { size?: number; color?: string };
const stroke = (color: string) => ({ fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export function Star({ size = 32, color = 'var(--color-accent)' }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 3 L20.6 13.4 L31 13.6 L22.8 20 L25.6 31 L18 24.8 L10.6 31 L13.4 20.2 L5 13.4 L15.6 13 Z" {...stroke(color)} />
    </svg>
  );
}
export function Heart({ size = 32, color = 'var(--color-accent)' }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <path d="M17 28 C17 28 4 19 4 10.5 C4 6 7 3.5 10.5 3.5 C13 3.5 15.2 5 17 7.5 C18.8 5 21 3.5 23.5 3.5 C27 3.5 30 6 30 10.5 C30 19 17 28 17 28 Z" {...stroke(color)} />
    </svg>
  );
}
export function Squiggle({ size = 60, color = 'var(--color-accent)' }: P) {
  return (
    <svg width={size} height={size / 3} viewBox="0 0 60 20" aria-hidden="true">
      <path d="M2 10 C8 2, 14 18, 20 10 C26 2, 32 18, 38 10 C44 2, 50 18, 58 10" {...stroke(color)} />
    </svg>
  );
}
export function Camera({ size = 44, color = 'var(--color-accent)' }: P) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 40 34" aria-hidden="true">
      <rect x="2" y="10" width="36" height="22" rx="4" {...stroke(color)} />
      <circle cx="20" cy="21" r="6" {...stroke(color)} />
      <path d="M13 10 L15 4 L25 4 L27 10" {...stroke(color)} />
    </svg>
  );
}
export function Sparkle({ size = 24, color = 'var(--color-accent)' }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 C12.6 8 14 10.6 22 12 C14 13.4 12.6 16 12 22 C11.4 16 10 13.4 2 12 C10 10.6 11.4 8 12 2 Z" {...stroke(color)} />
    </svg>
  );
}

type FloatProps = { children: React.ReactNode; style?: React.CSSProperties; delay?: number; duration?: number; rotate?: number; opacity?: number };

/** Gently floating sticker. Static when the user prefers reduced motion. */
export function Float({ children, style, delay = 0, duration = 4, rotate = 4, opacity = 0.6 }: FloatProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      style={{ position: 'absolute', pointerEvents: 'none', opacity, ...style }}
      animate={reduce ? undefined : { y: [0, -9, 0], rotate: [-rotate, rotate, -rotate] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}

/** Corner stickers used behind most booth screens. */
export function DoodleBackdrop({ density = 'normal' }: { density?: 'normal' | 'calm' }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <Float style={{ top: '7%', left: '6%' }} duration={3.4}><Star size={38} /></Float>
      <Float style={{ top: '9%', right: '8%' }} delay={0.6} duration={3.9}><Sparkle size={28} /></Float>
      <Float style={{ bottom: '11%', left: '8%' }} delay={1} duration={4.2}><Heart size={36} /></Float>
      <Float style={{ bottom: '9%', right: '7%' }} delay={1.4} duration={3.6}><Camera size={46} /></Float>
      {density === 'normal' && (
        <>
          <Float style={{ top: '46%', left: '2.5%' }} delay={0.3} duration={4.5} opacity={0.4}><Squiggle /></Float>
          <Float style={{ top: '52%', right: '2.5%' }} delay={1.8} duration={4} opacity={0.4}><Squiggle /></Float>
        </>
      )}
    </div>
  );
}
