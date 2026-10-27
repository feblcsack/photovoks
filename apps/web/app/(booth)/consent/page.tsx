'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { DoodleButton, DoodleBackdrop } from '@/components/doodle';
import { Card } from '@/components/ui/card';
import { useBoothContext } from '../context/BoothContext';
import { id } from '@/i18n/id';

/**
 * Consent screen — shown after a visitor taps the idle screen.
 *
 * - "Saya Setuju" → navigate to /frames (no session is created here).
 * - "Tidak"       → DECLINE_CONSENT (reset) then back to /.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export default function ConsentPage() {
  const { state, dispatch } = useBoothContext();
  const router = useRouter();
  const reduce = useReducedMotion();

  const retentionDays = state.event?.retentionDays ?? 30;

  function handleAccept() {
    router.push('/frames');
  }

  function handleDecline() {
    dispatch({ type: 'DECLINE_CONSENT' });
    router.push('/');
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center gap-8 overflow-hidden p-8">
      <DoodleBackdrop density="calm" />

      <motion.div
        className="relative z-10 w-full max-w-xl"
        initial={reduce ? false : { opacity: 0, y: 24, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: -0.6 }}
        transition={{ type: 'spring', stiffness: 140, damping: 16 }}
      >
        <Card className="flex flex-col items-center gap-5 p-8 text-center">
          <span className="grid size-14 place-items-center rounded-full border-[2.5px] border-[var(--color-ink)] bg-[var(--color-accent-soft)]">
            <ShieldCheck className="size-7 text-[var(--color-accent)]" aria-hidden="true" />
          </span>
          <h1 className="font-display m-0 text-[clamp(2rem,5vw,3rem)] font-bold leading-none">{id.consent.title}</h1>
          <p className="m-0 text-[clamp(1.05rem,2.4vw,1.3rem)] leading-relaxed">{id.consent.body}</p>
          <p className="m-0 text-[clamp(0.95rem,2.2vw,1.1rem)] leading-relaxed opacity-70">
            {id.consent.retentionNotice(retentionDays)}
          </p>
        </Card>
      </motion.div>

      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center gap-4"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35 }}
      >
        {/* Explicit consent required to proceed (Req 2.3, 2.5) */}
        <DoodleButton variant="primary" onClick={handleAccept} style={{ width: '100%' }}>
          {id.consent.accept}
        </DoodleButton>
        {/* Decline → idle WITHOUT creating a session (Req 2.4) */}
        <DoodleButton variant="secondary" size="default" onClick={handleDecline} style={{ width: '100%' }}>
          {id.consent.decline}
        </DoodleButton>
      </motion.div>
    </div>
  );
}
