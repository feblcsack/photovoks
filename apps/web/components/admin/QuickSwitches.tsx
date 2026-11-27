'use client';

/**
 * Dashboard quick switches: AI on/off for every event (and payments on/off).
 * Same settings as the developer panel, one tap away.
 */
import React, { useState } from 'react';
import { Box, Laugh, Palette, Wallet } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/fetcher';

export function QuickSwitches({ ai, payments, aiConfigured, migrated, fun = { lowPoly: true, meme: true } }: { ai: boolean; payments: boolean; aiConfigured: boolean; migrated: boolean; fun?: { lowPoly: boolean; meme: boolean } }) {
  const toast = useToast();
  const [state, setState] = useState({ ai, payments });
  const [funState, setFun] = useState(fun);

  async function flipFun(key: 'lowPoly' | 'meme', value: boolean) {
    setBusy(key);
    const prev = funState;
    const next = { ...funState, [key]: value };
    setFun(next);
    try {
      await api('/api/admin/dev/settings', { method: 'PATCH', json: { group: 'fun', value: next } });
      toast(key === 'lowPoly' ? (value ? 'Teman low-poly nyala' : 'Teman low-poly dimatikan') : value ? 'Gaya meme nyala' : 'Gaya meme dimatikan');
    } catch (e) {
      setFun(prev);
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    } finally {
      setBusy(null);
    }
  }
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
        <li className="flex items-center justify-between gap-3 px-5 py-3.5">
          <span className="flex items-start gap-3">
            <Box className="mt-0.5 size-4 text-muted" />
            <span>
              <span className="block text-sm font-bold">Teman low-poly</span>
              <span className="block text-xs text-muted">{funState.lowPoly ? 'Hewan 3D ikut nampang di foto (tamu bisa mematikan)' : 'Mati'}</span>
            </span>
          </span>
          <Switch checked={funState.lowPoly} onChange={(v) => void flipFun('lowPoly', v)} disabled={!migrated || busy === 'lowPoly'} label="Teman low-poly" />
        </li>
        <li className="flex items-center justify-between gap-3 px-5 py-3.5">
          <span className="flex items-start gap-3">
            <Laugh className="mt-0.5 size-4 text-muted" />
            <span>
              <span className="block text-sm font-bold">Gaya meme</span>
              <span className="block text-xs text-muted">{funState.meme ? 'Freaky tiw & Tes SWAG di layar review' : 'Mati'}</span>
            </span>
          </span>
          <Switch checked={funState.meme} onChange={(v) => void flipFun('meme', v)} disabled={!migrated || busy === 'meme'} label="Gaya meme" />
        </li>
      </ul>
    </Panel>
  );
}
