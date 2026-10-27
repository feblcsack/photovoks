/**
 * Admin Event Edit page — /admin/events/[id]
 *
 * Server Component that fetches the event and passes it to the client form.
 * Requirements: 11.6
 */
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import EventForm from '../EventForm';

interface DbEvent {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  retention_days: number;
  daily_sketch_cap: number;
  tear_line_offset_px: number;
}

type PageProps = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('events')
    .select('id, name, status, retention_days, daily_sketch_cap, tear_line_offset_px')
    .eq('id', id)
    .single();

  if (error || !data) {
    notFound();
  }

  const event = data as DbEvent;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/events"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Events
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Edit Event</h1>
        <p className="mt-1 text-sm text-gray-500">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset mr-2 ${
              event.status === 'active'
                ? 'bg-green-50 text-green-700 ring-green-600/20'
                : event.status === 'archived'
                ? 'bg-gray-100 text-gray-500 ring-gray-500/20'
                : 'bg-yellow-50 text-yellow-700 ring-yellow-600/20'
            }`}
          >
            {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
          </span>
          {event.name}
        </p>
      </div>

      {/* Quick link to manage frames for this event */}
      <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">Frames</p>
          <p className="text-xs text-gray-500 mt-0.5">Manage photo frames for this event.</p>
        </div>
        <Link
          href={`/admin/frames?eventId=${event.id}`}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Manage Frames →
        </Link>
      </div>

      <EventForm
        eventId={event.id}
        initialValues={{
          name: event.name,
          status: event.status,
          retentionDays: event.retention_days,
          dailySketchCap: event.daily_sketch_cap,
          tearLineOffsetPx: event.tear_line_offset_px,
        }}
        isEdit
      />
    </div>
  );
}
