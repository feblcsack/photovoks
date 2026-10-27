/**
 * Admin layout — shared nav wrapper for all /admin/* pages.
 * "Doodle-lite": hand-drawn outlines on nav/cards/buttons (see .admin-shell in
 * globals.css), plain readable type for tables and forms.
 */
import React from 'react';
import { AdminNav } from '../../components/admin/AdminNav';
import { PageTransition } from '@/components/doodle';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell min-h-screen bg-gray-50">
      <AdminNav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
