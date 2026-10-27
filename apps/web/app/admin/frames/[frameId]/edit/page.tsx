/**
 * Admin Frame Edit page — /admin/frames/[frameId]/edit?eventId=...
 *
 * Server Component fetches the frame, renders the SlotGeometryEditor and
 * name/active toggle via a client component.
 *
 * Requirements: 11.6, 11.7, 11.8
 */
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import FrameEditForm from './FrameEditForm';
import type { SlotGeometry } from '@photovoks/shared-types';

interface DbFrame {
  id: string;
  event_id: string;
  name: string;
  storage_path: string;
  slot_geometry: SlotGeometry[];
  is_active: boolean;
  sort_order: number;
}

type PageProps = {
  params: Promise<{ frameId: string }>;
  searchParams: Promise<{ eventId?: string }>;
};

export default async function FrameEditPage({ params, searchParams }: PageProps) {
  const { frameId } = await params;
  const { eventId } = await searchParams;

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('frames')
    .select('id, event_id, name, storage_path, slot_geometry, is_active, sort_order')
    .eq('id', frameId)
    .single();

  if (error || !data) {
    notFound();
  }

  const frame = data as DbFrame;
  const backEventId = eventId ?? frame.event_id;

  // Generate signed URL for thumbnail preview
  const { data: urlData } = await supabase.storage
    .from('frames')
    .createSignedUrl(frame.storage_path, 3600);

  const thumbnailUrl = urlData?.signedUrl ?? null;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/admin/events" className="text-sm text-gray-500 hover:text-gray-700">
          ← Events
        </Link>
        <span className="text-sm text-gray-400 mx-1">/</span>
        <Link
          href={`/admin/frames?eventId=${backEventId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Frames
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Edit Frame</h1>
        <p className="mt-1 text-sm text-gray-500">{frame.name}</p>
      </div>

      <FrameEditForm
        frameId={frame.id}
        eventId={backEventId}
        initialName={frame.name}
        initialIsActive={frame.is_active}
        initialSlotGeometry={Array.isArray(frame.slot_geometry) ? frame.slot_geometry : []}
        thumbnailUrl={thumbnailUrl}
      />
    </div>
  );
}
