/**
 * Admin Frame List page — /admin/frames?eventId=...
 *
 * Server Component that fetches all frames for an event.
 * Client component handles reorder, deactivate, delete interactions.
 *
 * Requirements: 11.6, 11.8
 */
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import FrameList from './FrameList';
import FrameUploadForm from './FrameUploadForm';

interface DbFrame {
  id: string;
  event_id: string;
  name: string;
  storage_path: string;
  slot_geometry: unknown;
  is_active: boolean;
  sort_order: number;
  thumbnailUrl: string | null;
}

type PageProps = {
  searchParams: Promise<{ eventId?: string }>;
};

export default async function FramesListPage({ searchParams }: PageProps) {
  const { eventId } = await searchParams;

  if (!eventId) {
    redirect('/admin/events');
  }

  const supabase = createServerClient();

  // Fetch event info
  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .single();

  // Fetch frames with signed thumbnail URLs
  const { data: framesRaw } = await supabase
    .from('frames')
    .select('id, event_id, name, storage_path, slot_geometry, is_active, sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  const frames: DbFrame[] = await Promise.all(
    (framesRaw ?? []).map(async (frame) => {
      const { data: urlData } = await supabase.storage
        .from('frames')
        .createSignedUrl(frame.storage_path, 3600);
      return { ...(frame as Omit<DbFrame, 'thumbnailUrl'>), thumbnailUrl: urlData?.signedUrl ?? null };
    })
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/admin/events" className="text-sm text-gray-500 hover:text-gray-700">
          ← Events
        </Link>
        {event && (
          <>
            <span className="text-sm text-gray-400 mx-1">/</span>
            <Link
              href={`/admin/events/${event.id}`}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {event.name}
            </Link>
          </>
        )}
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Frames</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload and manage photo frames for this event.
        </p>
      </div>

      {/* Upload new frame */}
      <div className="mb-8 bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Upload New Frame</h2>
        <FrameUploadForm eventId={eventId} />
      </div>

      {/* Frame list */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Frames ({frames.length})
        </h2>
        {frames.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No frames yet. Upload one above.</p>
        ) : (
          <FrameList frames={frames} eventId={eventId} />
        )}
      </div>
    </div>
  );
}
