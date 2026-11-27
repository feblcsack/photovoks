'use client';

/**
 * Dashboard quick switches: AI on/off for every event (and payments on/off).
 * Same settings as the developer panel, one tap away.
 */
import React, { useState } from 'react';
import { Palette, Wallet } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/fetcher';

export function QuickSwitches({ ai, payments, aiConfigured, migrated }: { ai: boolean; payments: boolean; aiConfigured: boolean; migrated: boolean }) {
  const toast = useToast();
  const [state, setState] = useState({ ai, payments });
  const [busy, setBusy] = useState<string | null>(null);

  async function flip(group: 'ai' | 'payments', value: boolean) {
    setBusy(group);
    const prev = state;
    setState((s) => ({ ...s, [group]: value }));
    try {
      await api('/api/admin/dev/settings', { method: 'PATCH', json: { group, value: { enabled: value } } });
      toast(group === 'ai' ? (value ? 'Gaya AI dinyalakan' : 'Gaya AI dimatikan untuk semua event') : value ? 'Pembayaran aktif' : 'Pembayaran dimatikan — semua gratis');
    } catch (e) {
      setState(prev);
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Saklar cepat" description={migrated ? 'Berlaku untuk semua event dalam ±20 detik.' : 'Jalankan migrasi v5 dulu (Developer).'} />
      <ul className="divide-y divide-line">
        <li className="flex items-center justify-between gap-3 px-5 py-3.5">
          <span className="flex items-start gap-3">
            <Palette className="mt-0.5 size-4 text-muted" />
            <span>
              <span className="block text-sm font-bold">Generate AI</span>
              <span className="block text-xs text-muted">{!aiConfigured ? 'API key AI belum diisi' : state.ai ? 'Aktif — tamu bisa membuat gambar AI' : 'Mati — tombol AI disembunyikan'}</span>
            </span>
          </span>
          <Switch checked={state.ai} onChange={(v) => void flip('ai', v)} disabled={!migrated || busy === 'ai'} label="Generate AI" />
        </li>
        <li className="flex items-center justify-between gap-3 px-5 py-3.5">
          <span className="flex items-start gap-3">
            <Wallet className="mt-0.5 size-4 text-muted" />
            <span>
              <span className="block text-sm font-bold">Pembayaran</span>
              <span className="block text-xs text-muted">{state.payments ? 'Aktif sesuai tarif tiap event' : 'Mati — sesi & AI gratis'}</span>
            </span>
          </span>
          <Switch checked={state.payments} onChange={(v) => void flip('payments', v)} disabled={!migrated || busy === 'payments'} label="Pembayaran" />
        </li>
      </ul>
    </Panel>
  );
}
