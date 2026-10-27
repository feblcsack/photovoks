'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/card';

/** Tape strip used to "stick" things onto the visitor's scrapbook page. */
export function Tape({ className = '', rotate = -3 }: { className?: string; rotate?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute z-10 block h-6 w-20 border-2 border-[var(--color-ink)] bg-[var(--color-accent-soft)]/90 ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    />
  );
}

/**
 * One scrapbook page-section: handwritten heading + a slightly tilted paper
 * card that springs in when it scrolls into view.
 */
export function SessionCard({
  titleId,
  title,
  tilt = 0,
  taped = false,
  children,
}: {
  titleId: string;
  title: string;
  tilt?: number;
  taped?: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      aria-labelledby={titleId}
      initial={reduce ? false : { opacity: 0, y: 28, rotate: tilt * 2 }}
      whileInView={{ opacity: 1, y: 0, rotate: tilt }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ type: 'spring', stiffness: 140, damping: 16 }}
      className="relative"
    >
      <h2 id={titleId} className="font-display m-0 mb-2 pl-1 text-[clamp(1.7rem,6vw,2.1rem)] font-bold leading-none">
        {title}
      </h2>
      <div className="relative">
        {taped && <Tape className="-top-3 left-1/2 -translate-x-1/2" rotate={tilt > 0 ? -4 : 3} />}
        <Card className="p-4">{children}</Card>
      </div>
    </motion.section>
  );
}

export function Spinner() {
  return <div className="doodle-spinner !size-9 !border-[4px]" aria-hidden="true" />;
}

/** Styled download link (native browser download). */
export function DownloadLink({ href, filename, children }: { href: string; filename: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download={filename}
      className="font-display inline-flex min-h-11 items-center justify-center border-[2.5px] border-[var(--color-ink)] bg-[var(--color-accent)] px-6 text-xl font-bold text-white no-underline [border-radius:var(--doodle-radius)] [box-shadow:var(--doodle-shadow)] active:translate-x-[3px] active:translate-y-[4px] active:shadow-none"
    >
      {children}
    </a>
  );
}
