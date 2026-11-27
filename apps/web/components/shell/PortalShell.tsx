'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Frame,
  GalleryHorizontalEnd,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Music2,
  Printer,
  MessageSquareText,
  Palette,
  SlidersHorizontal,
  Sticker,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/scrap';
import { useActivityTimer } from '@/hooks/useActivityTimer';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/events', label: 'Event', icon: CalendarDays },
  { href: '/admin/frames', label: 'Frame Builder', icon: Frame },
  { href: '/admin/gallery', label: 'Galeri', icon: GalleryHorizontalEnd },
  { href: '/admin/payments', label: 'Pembayaran', icon: Wallet },
  { href: '/admin/stickers', label: 'Stiker & Ikon', icon: Sticker },
  { href: '/admin/tebak-lagu', label: 'Tebak Lagu', icon: Music2 },
  { href: '/admin/prompts', label: 'Prompt AI', icon: Palette },
  { href: '/admin/developer', label: 'Developer', icon: Wrench },
];

function eventNav(code: string): NavItem[] {
  const base = `/event/${code}`;
  return [
    { href: base, label: 'Ringkasan', icon: LayoutDashboard, exact: true },
    { href: `${base}/booth`, label: 'Pengaturan Booth', icon: SlidersHorizontal },
    { href: `${base}/gallery`, label: 'Galeri', icon: GalleryHorizontalEnd },
    { href: `${base}/sessions`, label: 'Riwayat Sesi', icon: History },
    { href: `${base}/guestbook`, label: 'Buku Tamu', icon: MessageSquareText },
    { href: `${base}/print`, label: 'Print Station', icon: Printer },
    { href: `${base}/payments`, label: 'Pembayaran', icon: Wallet },
  ];
}

function AdminIdleLogout() {
  useActivityTimer();
  return null;
}

export function PortalShell({ mode, event, children }: { mode: 'admin' | 'event'; event?: { code: string; name: string; isAdmin: boolean }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    // Close the mobile drawer after navigation (derived-state pattern).
    setDrawerPath(pathname);
    setDrawer(false);
  }

  const isAdmin = mode === 'admin' || !!event?.isAdmin;
  const items = mode === 'event' && event ? eventNav(event.code) : ADMIN_NAV;
  const active = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/'));
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function logout() {
    if (isAdmin) await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    if (event && !event.isAdmin) await fetch(`/api/events/${event.code}/unlock`, { method: 'DELETE' }).catch(() => {});
    router.push(isAdmin ? '/admin/pin' : '/');
    router.refresh();
  }

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex h-20 items-center gap-2.5 px-4">
        <Logo size="sm" className="w-14 shrink-0 -rotate-3" alt="" />
        <div className="leading-tight">
          <p className="font-display text-lg">Photovoks</p>
          <p className="text-[10px] font-bold tracking-[0.14em] text-muted">{mode === 'event' ? 'Portal Event' : 'Portal Pemilik'}</p>
        </div>
      </div>

      {mode === 'event' && event ? (
        <div className="mx-3 mb-2 rounded-[12px] border border-line bg-canvas px-3 py-2.5">
          {event.isAdmin ? (
            <Link href="/admin/events" className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-ink"><ArrowLeft className="size-3" /> Semua event</Link>
          ) : null}
          <p className="truncate text-sm font-bold">{event.name}</p>
          <p className="font-mono text-xs tracking-widest text-muted">{event.code}</p>
        </div>
      ) : null}

      <p className="px-5 pt-3 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-faint uppercase">Menu</p>
      <ul className="flex flex-col gap-0.5 px-3">
        {items.map((item) => {
          const on = active(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn('flex h-10 items-center gap-3 rounded-full px-3 text-sm font-semibold transition-colors', on ? 'border-2 border-ink bg-brand text-white shadow-[2px_2px_0_var(--color-ink)]' : 'border-2 border-transparent text-ink-2 hover:bg-ink/[0.05] hover:text-ink')}
              >
                <item.icon className="size-[18px]" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {mode === 'event' && event ? (
        <div className="px-3 pt-4">
          <a href={`/booth/${event.code}`} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-ink text-sm font-bold text-white hover:bg-[#232B40]">
            <Camera className="size-4" /> Buka Booth
          </a>
        </div>
      ) : null}

      <div className="mt-auto border-t border-line p-3">
        <button type="button" onClick={logout} className="flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-sm font-semibold text-ink-2 hover:bg-danger-soft hover:text-danger">
          <LogOut className="size-[18px]" /> Keluar
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {isAdmin ? <AdminIdleLogout /> : null}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-surface lg:block">{nav}</aside>

      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] animate-fade-in bg-surface shadow-pop">
            <button type="button" onClick={() => setDrawer(false)} className="absolute top-3.5 right-3 flex size-9 items-center justify-center rounded-ctl text-muted hover:bg-ink/5" aria-label="Tutup menu"><X className="size-5" /></button>
            {nav}
          </aside>
        </div>
      ) : null}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setDrawer(true)} className="-ml-1 flex size-10 items-center justify-center rounded-ctl text-ink-2 hover:bg-ink/5 lg:hidden" aria-label="Buka menu"><Menu className="size-5" /></button>
        <p className="truncate text-[13px] text-muted">{today}</p>
        <div className="ml-auto flex items-center gap-2 text-right">
          <div className="leading-tight">
            <p className="text-[13px] font-bold">{isAdmin ? 'Pemilik' : 'Operator'}</p>
            <p className="text-[10px] font-semibold tracking-wider text-muted uppercase">{isAdmin ? 'Admin' : `Event ${event?.code ?? ''}`}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; breadcrumb?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1.5 text-xs font-medium text-muted">{breadcrumb}</div> : null}
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
