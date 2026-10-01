'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useBoothContext } from './context/BoothContext';
import { DoodleButton } from '@/components/doodle';
import { id } from '@/i18n/id';

/**
 * Booth idle screen — the full-screen starting point.
 *
 * The entire screen is tappable to transition from idle → consent.
 * A centred DoodleButton provides visual affordance, but the
 * pointer handler is on the outer container so any tap works.
 *
 * Decorative SVG doodles are scattered around the background for visual
 * richness; they are aria-hidden and have no pointer events.
 *
 * Requirements: 1.1, 1.2
 */
export default function BoothIdlePage() {
  const { dispatch } = useBoothContext();
  const router = useRouter();

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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100%',
        background: 'var(--color-bg)',
        cursor: 'pointer',
        userSelect: 'none',
        gap: '2rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── CSS animations ────────────────────────────────────────────────── */}
      <style>{`
        @keyframes doodle-float {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50%       { transform: translateY(-8px) rotate(3deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .doodle-el { animation: none !important; }
        }
      `}</style>

      {/* ── Decorative doodle layer ───────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        {/* Star top-left */}
        <svg
          className="doodle-el"
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 36 36"
          style={{
            position: 'absolute',
            top: '8%',
            left: '7%',
            opacity: 0.55,
            animation: 'doodle-float 3.2s ease-in-out infinite',
            animationDelay: '0s',
          }}
        >
          <path
            d="M18 2 L20.5 13 L31 13 L22.5 20 L25 31 L18 24 L11 31 L13.5 20 L5 13 L15.5 13 Z"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>

        {/* Small star top-right */}
        <svg
          className="doodle-el"
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 28 28"
          style={{
            position: 'absolute',
            top: '6%',
            right: '9%',
            opacity: 0.5,
            animation: 'doodle-float 3.8s ease-in-out infinite',
            animationDelay: '0.6s',
          }}
        >
          <path
            d="M14 2 L16 10 L24 10 L17.5 15.5 L20 24 L14 19 L8 24 L10.5 15.5 L4 10 L12 10 Z"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>

        {/* Heart bottom-left */}
        <svg
          className="doodle-el"
          xmlns="http://www.w3.org/2000/svg"
          width="34"
          height="34"
          viewBox="0 0 34 34"
          style={{
            position: 'absolute',
            bottom: '12%',
            left: '10%',
            opacity: 0.45,
            animation: 'doodle-float 4.1s ease-in-out infinite',
            animationDelay: '1s',
          }}
        >
          <path
            d="M17 28 C17 28 4 19 4 10 C4 6 7 3 10.5 3 C13 3 15 4.5 17 7 C19 4.5 21 3 23.5 3 C27 3 30 6 30 10 C30 19 17 28 17 28 Z"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>

        {/* Camera outline bottom-right */}
        <svg
          className="doodle-el"
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="34"
          viewBox="0 0 40 34"
          style={{
            position: 'absolute',
            bottom: '10%',
            right: '8%',
            opacity: 0.45,
            animation: 'doodle-float 3.5s ease-in-out infinite',
            animationDelay: '1.4s',
          }}
        >
          <rect x="2" y="10" width="36" height="22" rx="4" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
          <circle cx="20" cy="21" r="6" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
          <path d="M13 10 L15 4 L25 4 L27 10" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="32" cy="15" r="1.5" fill="var(--color-accent)" />
        </svg>

        {/* Wavy line left-center */}
        <svg
          className="doodle-el"
          xmlns="http://www.w3.org/2000/svg"
          width="60"
          height="20"
          viewBox="0 0 60 20"
          style={{
            position: 'absolute',
            top: '45%',
            left: '3%',
            opacity: 0.35,
            animation: 'doodle-float 4.4s ease-in-out infinite',
            animationDelay: '0.3s',
          }}
        >
          <path
            d="M2 10 C8 2, 14 18, 20 10 C26 2, 32 18, 38 10 C44 2, 50 18, 58 10"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        {/* Wavy line right-center */}
        <svg
          className="doodle-el"
          xmlns="http://www.w3.org/2000/svg"
          width="60"
          height="20"
          viewBox="0 0 60 20"
          style={{
            position: 'absolute',
            top: '50%',
            right: '3%',
            opacity: 0.35,
            animation: 'doodle-float 3.9s ease-in-out infinite',
            animationDelay: '1.8s',
          }}
        >
          <path
            d="M2 10 C8 18, 14 2, 20 10 C26 18, 32 2, 38 10 C44 18, 50 2, 58 10"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        {/* Small circle top-center */}
        <svg
          className="doodle-el"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          style={{
            position: 'absolute',
            top: '15%',
            left: '42%',
            opacity: 0.4,
            animation: 'doodle-float 4.6s ease-in-out infinite',
            animationDelay: '2s',
          }}
        >
          <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="4 3" />
        </svg>

        {/* Dots bottom-center */}
        <svg
          className="doodle-el"
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="16"
          viewBox="0 0 48 16"
          style={{
            position: 'absolute',
            bottom: '6%',
            left: '35%',
            opacity: 0.4,
            animation: 'doodle-float 3.3s ease-in-out infinite',
            animationDelay: '0.8s',
          }}
        >
          <circle cx="8" cy="8" r="4" fill="var(--color-accent)" />
          <circle cx="24" cy="8" r="4" fill="var(--color-accent)" />
          <circle cx="40" cy="8" r="4" fill="var(--color-accent)" />
        </svg>
      </div>

      {/* ── Brand title ───────────────────────────────────────────────────── */}
      <h1
        style={{
          fontFamily: 'var(--font-display), cursive',
          fontSize: 'clamp(3rem, 10vw, 6rem)',
          color: 'var(--color-accent)',
          margin: 0,
          textAlign: 'center',
          fontWeight: 700,
          lineHeight: 1.1,
          zIndex: 1,
        }}
      >
        {id.idle.title}
      </h1>

      {/* ── Tagline ───────────────────────────────────────────────────────── */}
      <p
        style={{
          fontFamily: 'var(--font-display), cursive',
          fontSize: 'clamp(1.25rem, 3.5vw, 2rem)',
          color: 'var(--color-ink)',
          textAlign: 'center',
          margin: 0,
          opacity: 0.85,
          zIndex: 1,
        }}
      >
        {id.idle.subtitle}
      </p>

      {/* ── Tap-to-start button — purely visual, outer div catches all taps */}
      <DoodleButton
        variant="primary"
        style={{
          fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
          padding: '1rem 3rem',
          pointerEvents: 'none', // outer container handles the click
          zIndex: 1,
        }}
        aria-hidden="true"
        tabIndex={-1}
      >
        {id.idle.tapToStart}
      </DoodleButton>
    </div>
  );
}
