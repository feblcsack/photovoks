/**
 * Generic not-found page for the session route `/s/[token]`.
 * Friendly 404 that reveals nothing about valid tokens or sessions (Req 8.11).
 */
import Link from 'next/link';
import { Camera, Float, Sparkle, Squiggle } from '@/components/doodle';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '../../../components/ui/button';
import { id } from '@/i18n/id';

export default function SessionNotFound() {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-6 py-8"
      style={{ fontFamily: 'var(--font-body), sans-serif' }}
    >
      <Float style={{ top: '12%', left: '10%' }}><Sparkle size={30} /></Float>
      <Float style={{ bottom: '14%', right: '10%' }} delay={1}><Squiggle /></Float>

      <Card className="relative z-10 flex max-w-sm flex-col items-center gap-4 p-8 text-center [transform:rotate(-1deg)]">
        <Camera size={64} />
        <h1 className="font-display m-0 text-[clamp(2rem,7vw,2.8rem)] font-bold leading-tight">{id.session.notFound.title}</h1>
        <p className="m-0 text-lg leading-relaxed opacity-75">{id.session.notFound.body}</p>
        <Link href="/" className={buttonVariants({ variant: 'default', size: 'default' })}>
          {id.errors.returnToIdle}
        </Link>
      </Card>
    </main>
  );
}
