/**
 * Footer with a halftone "dot matrix" dissolve: rows of dots that grow until
 * they merge into a solid brand-red block, dashed grid lines inside, and a
 * bubbly lime edge at the bottom. Same palette as the rest of the app.
 */
import React from 'react';
import { cn } from '@/lib/utils';

const ROWS = 9;
const CELL = 26;

export function DotsFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <footer className={cn('relative mt-16 overflow-hidden', className)}>
      {/* Bubbly cream edge, then the dissolve: cream → red, dots grow row by
          row (alternate rows offset) */}
      <div aria-hidden className="h-6 [background-image:radial-gradient(circle_at_50%_100%,var(--color-canvas)_0_64%,transparent_65%)] [background-size:36px_24px] [background-position:0_2px]" />
      <div aria-hidden className="bg-canvas pt-3">
        {Array.from({ length: ROWS }).map((_, i) => {
          const r = 6 + (i / (ROWS - 1)) * 66; // % of half-cell
          return (
            <div
              key={i}
              className="dots-fade"
              style={{
                height: CELL,
                ['--g' as string]: `${CELL}px`,
                ['--r' as string]: `${r}%`,
                backgroundPosition: i % 2 ? `${CELL / 2}px 0` : '0 0',
              }}
            />
          );
        })}
      </div>
      <div className="relative bg-brand text-[#FBF5E6]">
        {/* Column guides like a cutting mat */}
        <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(90deg,transparent_calc(25%-1px),rgb(251_245_230/0.22)_calc(25%-1px),rgb(251_245_230/0.22)_25%,transparent_25%,transparent_calc(50%-1px),rgb(251_245_230/0.22)_calc(50%-1px),rgb(251_245_230/0.22)_50%,transparent_50%,transparent_calc(75%-1px),rgb(251_245_230/0.22)_calc(75%-1px),rgb(251_245_230/0.22)_75%,transparent_75%)]" />
        <div className="relative">{children}</div>
        {/* Bubbly lime edge with a few lime dots drifting up into the red */}
        <div aria-hidden className="relative h-16">
          <div className="dots-fade absolute inset-x-0 top-0 h-6 opacity-90" style={{ ['--dot' as string]: 'var(--color-lime)', ['--g' as string]: '22px', ['--r' as string]: '22%' }} />
          <div className="dots-fade absolute inset-x-0 top-6 h-6" style={{ ['--dot' as string]: 'var(--color-lime)', ['--g' as string]: '22px', ['--r' as string]: '48%', backgroundPosition: '11px 0' }} />
          <div className="absolute inset-x-0 bottom-0 h-5 bg-lime" />
          <div className="absolute inset-x-0 bottom-3 h-8 [background-image:radial-gradient(circle,var(--color-lime)_0_62%,transparent_63%)] [background-size:32px_32px]" />
        </div>
      </div>
    </footer>
  );
}
