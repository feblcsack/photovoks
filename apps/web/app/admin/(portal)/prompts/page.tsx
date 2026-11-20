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
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel } from '@/components/ui/panel';
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
  const supabase = createServerClient();

  if (!eventId) {
    const { data: events } = await supabase.from('events').select('id, name, code, active_prompt_template_id').order('created_at', { ascending: false });
    return (
      <div>
        <PageHeader
          title="Prompt AI kustom"
          description="Selain gaya bawaan (Doodle, Anime, Cat Air, …), tiap event bisa punya gaya AI sendiri. Pilih event untuk mengelola versinya. Aktifkan gaya “Gaya Event” di Pengaturan event agar muncul untuk tamu."
        />
        <Panel>
          <ul className="divide-y divide-line">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/admin/prompts?eventId=${e.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-canvas">
                  <span>
                    <span className="block text-sm font-bold">{e.name}</span>
                    <span className="font-mono text-xs text-muted">{e.code}</span>
                  </span>
                  <span className="text-xs font-semibold text-muted">{e.active_prompt_template_id ? 'Prompt aktif ✓' : 'Belum ada prompt'}</span>
                </Link>
              </li>
            ))}
            {!events?.length ? <li className="px-5 py-10 text-center text-sm text-muted">Belum ada event.</li> : null}
          </ul>
        </Panel>
      </div>
    );
  }

  const [{ data: event }, { data: templatesRaw }] = await Promise.all([
    supabase.from('events').select('id, name, code, active_prompt_template_id').eq('id', eventId).single(),
    supabase
      .from('prompt_templates')
      .select('id, event_id, content, version, is_active, created_at')
      .eq('event_id', eventId)
      .order('version', { ascending: false }),
  ]);

  if (!event) {
    redirect('/admin/prompts');
  }

  const templates: DbPromptTemplate[] = (templatesRaw as DbPromptTemplate[]) ?? [];

  return (
    <div>
      <PageHeader
        breadcrumb={<><Link href="/admin/prompts" className="hover:text-ink">Prompt AI</Link> / {event.name as string}</>}
        title="Prompt AI kustom"
        description="Versi aktif dipakai untuk gaya “Gaya Event”. Uji prompt dengan foto contoh sebelum mengaktifkan. Model mengikuti OPENROUTER_MODEL."
      />
      <PromptsManager
        eventId={eventId}
        eventName={event.name as string}
        initialTemplates={templates}
        initialActiveTemplateId={(event.active_prompt_template_id as string | null) ?? null}
      />
    </div>
  );
}
