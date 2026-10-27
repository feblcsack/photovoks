'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutDashboard, CalendarDays, Frame, Sparkles, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/admin/events', label: 'Events', Icon: CalendarDays },
  { href: '/admin/frames', label: 'Frames', Icon: Frame },
  { href: '/admin/prompts', label: 'Prompts', Icon: Sparkles },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Even if the request fails, clear the cookie locally below.
    }
    document.cookie = 'admin_token=; Path=/; Max-Age=0; SameSite=Strict';
    router.push('/admin/pin');
  }

  return (
    <nav className="sticky top-0 z-30 border-b-[2.5px] border-[var(--color-ink)] bg-[var(--color-bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 sm:gap-5">
          <span className="font-display text-3xl font-bold leading-none text-[var(--color-accent)]">Photovoks</span>
          <ul className="flex flex-wrap items-center gap-1">
            {LINKS.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <li key={href} className="relative">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors',
                      active ? 'text-[var(--color-ink)]' : 'text-gray-600 hover:text-[var(--color-ink)]',
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </Link>
                  {active && (
                    <motion.span
                      layoutId="admin-nav-pill"
                      className="absolute inset-0 border-2 border-[var(--color-ink)] bg-[var(--color-accent-soft)] [border-radius:12px_6px_12px_6px/6px_12px_6px_12px]"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={logout} disabled={loggingOut} data-plain className="text-base">
          <LogOut aria-hidden="true" />
          Keluar
        </Button>
      </div>
    </nav>
  );
}
