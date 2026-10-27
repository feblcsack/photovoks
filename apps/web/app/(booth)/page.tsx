'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { DoodleButton, DoodleBackdrop, Float, Heart, Sparkle } from '@/components/doodle';
import { useBoothContext } from './context/BoothContext';
import { id } from '@/i18n/id';

/**
 * Booth idle screen (iPad landscape): the whole screen is tappable → consent.
 * Left: brand + tagline + CTA. Right: sample strip pinned like a photo.
 *
 * Requirements: 1.1, 1.2
 */
export default function BoothIdlePage() {
  const { dispatch } = useBoothContext();
  const router = useRouter();
  const reduce = useReducedMotion();

  void dispatch; // context available but idle page doesn't dispatch

  function handleTap() {
    router.push('/consent');
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={id.idle.tapToStart}
      onClick={handleTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleTap();
      }}
      className="relative flex min-h-screen w-full cursor-pointer select-none items-center justify-center overflow-hidden px-8 py-10"
    >
      <DoodleBackdrop />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center justify-center gap-10 md:flex-row md:gap-16">
        {/* ── Brand + CTA ─────────────────────────────────────────────── */}
        <motion.div
          className="flex flex-1 flex-col items-center gap-6 text-center md:items-start md:text-left"
          initial={reduce ? false : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <h1 className="font-display m-0 text-[clamp(3.5rem,11vw,7rem)] font-bold leading-[0.95] text-[var(--color-accent)]">
            {id.idle.title}
          </h1>
          <p className="font-display m-0 max-w-md text-[clamp(1.4rem,3.2vw,2.1rem)] leading-snug opacity-85">
            {id.idle.subtitle}
          </p>

          {/* Purely visual — the outer container handles every tap */}
          <motion.div
            animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <DoodleButton
              variant="primary"
              size="xl"
              aria-hidden="true"
              tabIndex={-1}
              style={{ pointerEvents: 'none' }}
            >
              {id.idle.tapToStart}
            </DoodleButton>
          </motion.div>
        </motion.div>

        {/* ── Sample strip, pinned with tape ──────────────────────────── */}
        <motion.div
          aria-hidden="true"
          className="relative"
          initial={reduce ? false : { opacity: 0, rotate: 10, y: 30 }}
          animate={{ opacity: 1, rotate: 4, y: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.15 }}
        >
          <div className="absolute -top-3 left-1/2 z-10 h-6 w-20 -translate-x-1/2 -rotate-3 border-2 border-[var(--color-ink)] bg-[var(--color-accent-soft)]/90" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/samples/heartsCutoutStripSample.png"
            alt=""
            className="block h-[min(62vh,520px)] w-auto border-[2.5px] border-[var(--color-ink)] bg-white [box-shadow:6px_8px_0_var(--color-ink)]"
            draggable={false}
          />
          <Float style={{ top: '-14px', right: '-30px' }} duration={3}><Sparkle size={34} /></Float>
          <Float style={{ bottom: '8%', left: '-34px' }} delay={0.8} duration={3.6}><Heart size={30} /></Float>
        </motion.div>
      </div>
    </div>
  );
}
