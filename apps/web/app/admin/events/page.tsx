/**
 * Admin Event List page — /admin/events
 *
 * Server Component that fetches all events and renders them in a table.
 * Mutation actions (archive) are handled client-side via API routes.
 *
 * Requirements: 11.6
 */
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import EventActions from './EventActions';

interface DbEvent {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  retention_days: number;
  daily_sketch_cap: number;
  tear_line_offset_px: number;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  archived: 'bg-gray-100 text-gray-500 ring-gray-500/20',
};

export default async function EventsListPage() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('events')
    .select('id, name, status, retention_days, daily_sketch_cap, tear_line_offset_px, created_at')
    .order('created_at', { ascending: false });

  const events: DbEvent[] = (data as DbEvent[]) ?? [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Events</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage photobooth events, frames, and settings.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          + New Event
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700 mb-4">
          Failed to load events. Please refresh the page.
        </div>
      )}

      {events.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          No events yet.{' '}
          <Link href="/admin/events/new" className="text-gray-900 underline">
            Create the first one.
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Retention
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Sketch Cap/day
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Tear Line Offset
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="text-sm font-medium text-gray-900 hover:underline"
                    >
                      {event.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        STATUS_CLASSES[event.status] ?? STATUS_CLASSES.draft
                      }`}
                    >
                      {STATUS_LABELS[event.status] ?? event.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {event.retention_days} days
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {event.daily_sketch_cap}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {event.tear_line_offset_px}px
                  </td>
                  <td className="px-4 py-3 text-right">
                    <EventActions event={event} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
