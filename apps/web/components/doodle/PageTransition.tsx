'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Fade + small slide when a screen mounts. Wrap a page's root in this.
 * (Exit animation is intentionally skipped: Next App Router unmounts routes
 * immediately, and a mount animation is reliable on every browser.)
 */
export function PageTransition({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
