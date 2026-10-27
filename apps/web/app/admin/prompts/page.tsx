/**
 * Admin Prompt Template Management — /admin/prompts?eventId=...
 *
 * Server Component: fetches the event and all prompt template versions,
 * then renders the client-side PromptsManager for mutations.
 *
 * Features:
 *  - Version list with created timestamps and active indicator
 *  - "Set Active" button per version
 *  - "New Version" editor (textarea)
 *  - Preview: upload a test photo → run Gemini inline → display result
 *
 * Requirements: 11.6
 */
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import PromptsManager from './PromptsManager';

interface DbPromptTemplate {
  id: string;
  event_id: string;
  content: string;
  version: number;
  is_active: boolean;
  created_at: string;
}

type PageProps = {
  searchParams: Promise<{ eventId?: string }>;
};

export default async function PromptsPage({ searchParams }: PageProps) {
  const { eventId } = await searchParams;

  if (!eventId) {
    redirect('/admin/events');
  }

  const supabase = createServerClient();

  const [{ data: event }, { data: templatesRaw }] = await Promise.all([
    supabase.from('events').select('id, name, active_prompt_template_id').eq('id', eventId).single(),
    supabase
      .from('prompt_templates')
      .select('id, event_id, content, version, is_active, created_at')
      .eq('event_id', eventId)
      .order('version', { ascending: false }),
  ]);

  if (!event) {
    redirect('/admin/events');
  }

  const templates: DbPromptTemplate[] = (templatesRaw as DbPromptTemplate[]) ?? [];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/admin/events" className="text-sm text-gray-500 hover:text-gray-700">
          ← Events
        </Link>
        <span className="text-sm text-gray-400 mx-1">/</span>
        <Link
          href={`/admin/events/${event.id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {event.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Prompt Templates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage AI sketch prompt template versions for this event. The active template is used
          for all new AI sketch generations.
        </p>
      </div>

      <PromptsManager
        eventId={eventId}
        eventName={event.name as string}
        initialTemplates={templates}
        initialActiveTemplateId={(event.active_prompt_template_id as string | null) ?? null}
      />
    </div>
  );
}
