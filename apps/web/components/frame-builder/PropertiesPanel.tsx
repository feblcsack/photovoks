'use client';

import React, { useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  ImagePlus,
  Italic,
  LayoutGrid,
  Lock,
  Trash2,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { FONTS } from '@/lib/frames/fonts';
import { CANVAS_PRESETS } from '@/lib/frames/presets';
import type { FontKey, FrameElement, PhotoElement, QrElement } from '@/lib/frames/types';
import { slotCountOf } from '@/lib/frames/types';
import { cn } from '@/lib/utils';
import { autoLayoutSlots, resizeCanvas, type Editor } from './useEditor';

const TYPE_LABEL: Record<FrameElement['type'], string> = {
  photo: 'Slot foto',
  text: 'Teks',
  image: 'Gambar',
  rect: 'Kotak',
  ellipse: 'Lingkaran',
  line: 'Garis',
  barcode: 'Barcode',
  qr: 'QR sesi',
};

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border-b border-line px-4 py-4', className)}>
      <p className="mb-3 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{title}</p>
      {children}
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <label className="flex h-9 items-center gap-1.5 rounded-[9px] border border-line-strong bg-surface pl-2.5 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
      <span className="w-4 shrink-0 text-[11px] font-bold text-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, v) : v) : v);
        }}
        className="h-full w-full min-w-0 bg-transparent text-[13px] tabular-nums outline-none"
      />
      {suffix ? <span className="pr-2 text-[11px] text-muted">{suffix}</span> : null}
    </label>
  );
}

function ColorField({ label, value, onChange, allowTransparent }: { label: string; value: string; onChange: (v: string) => void; allowTransparent?: boolean }) {
  const isT = value === 'transparent';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <div className="flex items-center gap-1.5">
        {allowTransparent ? (
          <button type="button" onClick={() => onChange(isT ? '#000000' : 'transparent')} className={cn('h-8 rounded-[8px] border px-2 text-[11px] font-semibold', isT ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong text-muted')}>
            Kosong
          </button>
        ) : null}
        <label className="relative flex h-8 items-center gap-1.5 rounded-[8px] border border-line-strong pr-2 pl-1">
          <span className="size-6 rounded-[6px] border border-ink/10" style={{ background: isT ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0/8px 8px' : value }} />
          <span className="w-16 font-mono text-[11px] text-ink-2 uppercase">{isT ? '—' : value}</span>
          <input type="color" value={isT ? '#000000' : value.slice(0, 7)} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
        </label>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step = 1, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-[13px] font-medium text-ink-2">
        {label}
        <span className="tabular-nums text-muted">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-brand" />
    </label>
  );
}

export function PropertiesPanel({ editor, onUploadImage, uploading }: { editor: Editor; onUploadImage: (target: 'background' | 'element' | 'new', file: File) => void; uploading: boolean }) {
  const { design, selected } = editor;
  return <div className="flex flex-col">{selected ? <ElementProps editor={editor} el={selected} onUploadImage={onUploadImage} uploading={uploading} /> : <CanvasProps editor={editor} onUploadImage={onUploadImage} uploading={uploading} key={`${design.width}x${design.height}`} />}</div>;
}

function FilePick({ onFile, children, disabled }: { onFile: (f: File) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex', disabled && 'pointer-events-none opacity-50')}>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {children}
    </label>
  );
}

function CanvasProps({ editor, onUploadImage, uploading }: { editor: Editor; onUploadImage: (t: 'background' | 'element' | 'new', f: File) => void; uploading: boolean }) {
  const { design, commit } = editor;
  const [w, setW] = useState(design.width);
  const [h, setH] = useState(design.height);
  const preset = CANVAS_PRESETS.find((p) => p.width === design.width && p.height === design.height)?.id ?? 'custom';
  const slots = design.elements.filter((e): e is PhotoElement => e.type === 'photo');
  const [layout, setLayout] = useState({ count: Math.max(1, slotCountOf(design)), cols: 1, padding: Math.round(design.width * 0.06), gap: Math.round(design.width * 0.04), footer: Math.round(design.height * 0.14), radius: slots[0]?.radius ?? 0, repeat: false });

  return (
    <>
      <Section title="Kanvas">
        <Field label="Ukuran">
          <Select
            value={preset}
            onChange={(e) => {
              const p = CANVAS_PRESETS.find((x) => x.id === e.target.value);
              if (p) {
                commit(resizeCanvas(design, p.width, p.height));
                setW(p.width);
                setH(p.height);
              }
            }}
          >
            {Array.from(new Set(CANVAS_PRESETS.map((p) => p.group))).map((g) => (
              <optgroup key={g} label={g}>
                {CANVAS_PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>{p.label} · {p.width}×{p.height}</option>
                ))}
              </optgroup>
            ))}
            {preset === 'custom' ? <option value="custom">Kustom · {design.width}×{design.height}</option> : null}
          </Select>
        </Field>
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
          <Num label="W" value={w} onChange={setW} min={100} max={6000} />
          <Num label="H" value={h} onChange={setH} min={100} max={9000} />
          <Button size="sm" variant="secondary" className="h-9" disabled={w === design.width && h === design.height} onClick={() => commit(resizeCanvas(design, Math.round(w), Math.round(h)))}>Terapkan</Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">Piksel pada 300 DPI. Elemen ikut diskalakan.</p>
      </Section>
      <Section title="Latar">
        <div className="flex flex-col gap-3">
          <ColorField label="Warna" value={design.background.color} onChange={(v) => commit({ ...design, background: { ...design.background, color: v } }, 'bg-color')} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-ink-2">Gambar latar</span>
            <div className="flex gap-1.5">
              <FilePick onFile={(f) => onUploadImage('background', f)} disabled={uploading}>
                <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border border-line-strong px-2.5 text-xs font-semibold hover:bg-canvas"><ImagePlus className="size-3.5" /> {design.background.image ? 'Ganti' : 'Upload'}</span>
              </FilePick>
              {design.background.image ? <Button size="xs" variant="ghost" onClick={() => commit({ ...design, background: { ...design.background, image: null } })}>Hapus</Button> : null}
            </div>
          </div>
          {design.background.image ? (
            <Segmented size="sm" value={design.background.imageFit ?? 'cover'} onChange={(v) => commit({ ...design, background: { ...design.background, imageFit: v } })} options={[{ value: 'cover', label: 'Penuh' }, { value: 'contain', label: 'Pas' }, { value: 'stretch', label: 'Regang' }]} />
          ) : null}
          <p className="text-[11px] leading-relaxed text-muted">Punya desain frame PNG transparan dari Canva/Photoshop? Tambahkan sebagai <b>Gambar</b> (toolbar kiri) ukuran penuh di lapisan paling atas, lalu tempatkan slot foto di bawahnya.</p>
        </div>
      </Section>
      <Section title="Tata letak slot otomatis">
        <div className="grid grid-cols-2 gap-2">
          <Field label={layout.repeat ? 'Foto per kolom' : 'Jumlah foto'}>
            <Select value={layout.count} onChange={(e) => setLayout({ ...layout, count: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Kolom">
            <Select value={layout.cols} onChange={(e) => setLayout({ ...layout, cols: Number(e.target.value) })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
        </div>
        <label className={cn('mt-3 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line p-2.5', layout.cols < 2 && 'opacity-50')}>
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" disabled={layout.cols < 2} checked={layout.repeat && layout.cols > 1} onChange={(e) => setLayout({ ...layout, repeat: e.target.checked })} />
          <span className="text-[12px] leading-snug text-ink-2">
            <b>Kembar per kolom</b> — tiap kolom memakai foto yang sama (mis. 4R: 3 foto kiri + 3 foto kanan, tamu cukup foto 3×). Cocok untuk dicetak lalu digunting jadi 2 strip.
          </span>
        </label>
        <div className="mt-3 flex flex-col gap-3">
          <Slider label="Padding tepi" value={layout.padding} min={0} max={Math.round(design.width / 4)} onChange={(v) => setLayout({ ...layout, padding: v })} format={(v) => `${v}px`} />
          <Slider label="Jarak antar foto" value={layout.gap} min={0} max={Math.round(design.width / 6)} onChange={(v) => setLayout({ ...layout, gap: v })} format={(v) => `${v}px`} />
          <Slider label="Ruang bawah (judul)" value={layout.footer} min={0} max={Math.round(design.height / 2)} onChange={(v) => setLayout({ ...layout, footer: v })} format={(v) => `${v}px`} />
          <Slider label="Sudut membulat" value={layout.radius} min={0} max={120} onChange={(v) => setLayout({ ...layout, radius: v })} format={(v) => `${v}px`} />
          <Button variant="soft" onClick={() => commit(autoLayoutSlots(design, layout))}><LayoutGrid /> Terapkan tata letak</Button>
        </div>
      </Section>
      <div className="px-4 py-4 text-[11px] leading-relaxed text-muted">
        <b className="text-ink-2">Tips:</b> klik elemen untuk mengedit · seret untuk memindah · tarik kotak kecil untuk mengubah ukuran (Shift = proporsional, Alt = tanpa snap) · panah untuk geser 1px (Shift = 10px) · ⌘/Ctrl+Z batal · ⌘/Ctrl+D duplikat · Delete hapus.
      </div>
    </>
  );
}

function ElementProps({ editor, el, onUploadImage, uploading }: { editor: Editor; el: FrameElement; onUploadImage: (t: 'background' | 'element' | 'new', f: File) => void; uploading: boolean }) {
  const { design, updateElement, removeElement, duplicateElement, reorder } = editor;
  const up = (patch: Partial<FrameElement>, key?: string | null) => updateElement(el.id, patch, key);
  const align = (pos: 'l' | 'cx' | 'r' | 't' | 'cy' | 'b') => {
    const patch: Partial<FrameElement> = {};
    if (pos === 'l') patch.x = 0;
    if (pos === 'cx') patch.x = Math.round((design.width - el.w) / 2);
    if (pos === 'r') patch.x = design.width - el.w;
    if (pos === 't') patch.y = 0;
    if (pos === 'cy') patch.y = Math.round((design.height - el.h) / 2);
    if (pos === 'b') patch.y = design.height - el.h;
    up(patch, null);
  };
  const slots = slotCountOf(design);

  return (
    <>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{TYPE_LABEL[el.type]}</p>
          <p className="text-sm font-bold">{el.type === 'photo' ? `Foto ${el.slot + 1}` : el.type === 'text' ? el.text.split('\n')[0].slice(0, 22) || 'Teks' : el.name || TYPE_LABEL[el.type]}</p>
        </div>
        <div className="flex">
          <Button size="icon-sm" variant="ghost" title="Duplikat (⌘D)" onClick={() => duplicateElement(el.id)}><Copy /></Button>
          <Button size="icon-sm" variant="ghost" title={el.locked ? 'Buka kunci' : 'Kunci'} onClick={() => up({ locked: !el.locked })}>{el.locked ? <Lock /> : <Unlock />}</Button>
          <Button size="icon-sm" variant="danger-ghost" title="Hapus (Delete)" onClick={() => removeElement(el.id)}><Trash2 /></Button>
        </div>
      </div>

      <Section title="Posisi & ukuran">
        <div className="grid grid-cols-2 gap-2">
          <Num label="X" value={el.x} onChange={(v) => up({ x: Math.round(v) })} />
          <Num label="Y" value={el.y} onChange={(v) => up({ y: Math.round(v) })} />
          <Num label="W" value={el.w} onChange={(v) => up({ w: Math.max(1, Math.round(v)) })} min={1} />
          <Num label="H" value={el.h} onChange={(v) => up({ h: Math.max(1, Math.round(v)) })} min={1} />
        </div>
        <div className="mt-2 flex justify-between">
          {([
            ['l', AlignStartVertical, 'Rata kiri'],
            ['cx', AlignCenterVertical, 'Tengah horizontal'],
            ['r', AlignEndVertical, 'Rata kanan'],
            ['t', AlignStartHorizontal, 'Rata atas'],
            ['cy', AlignCenterHorizontal, 'Tengah vertikal'],
            ['b', AlignEndHorizontal, 'Rata bawah'],
          ] as const).map(([k, Icon, label]) => (
            <Button key={k} size="icon-sm" variant="ghost" title={label} aria-label={label} onClick={() => align(k)}><Icon /></Button>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Button size="xs" variant="secondary" className="flex-1" onClick={() => reorder(el.id, 'top')}><ArrowUpToLine /> Paling depan</Button>
          <Button size="xs" variant="secondary" className="flex-1" onClick={() => reorder(el.id, 'bottom')}><ArrowDownToLine /> Paling belakang</Button>
        </div>
        <div className="mt-3">
          <Slider label="Opasitas" value={Math.round((el.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => up({ opacity: v / 100 })} format={(v) => `${v}%`} />
        </div>
      </Section>

      {el.type === 'photo' ? (
        <Section title="Slot foto">
          <div className="flex flex-col gap-3">
            <Field label="Foto ke-" hint="Foto yang dipilih tamu urutan ini akan mengisi slot ini. Dua slot boleh memakai foto yang sama.">
              <Select value={el.slot} onChange={(e) => up({ slot: Number(e.target.value) } as Partial<PhotoElement>)}>
                {Array.from({ length: Math.min(12, slots + 1) }).map((_, i) => <option key={i} value={i}>Foto {i + 1}</option>)}
              </Select>
            </Field>
            <Slider label="Sudut membulat" value={el.radius} min={0} max={Math.round(Math.min(el.w, el.h) / 2)} onChange={(v) => up({ radius: v } as Partial<PhotoElement>)} format={(v) => `${v}px`} />
            <Slider label="Tebal bingkai" value={el.borderWidth} min={0} max={60} onChange={(v) => up({ borderWidth: v } as Partial<PhotoElement>)} format={(v) => `${v}px`} />
            {el.borderWidth > 0 ? <ColorField label="Warna bingkai" value={el.borderColor} onChange={(v) => up({ borderColor: v } as Partial<PhotoElement>)} /> : null}
            <p className="text-[11px] text-muted">Rasio slot: {(el.w / el.h).toFixed(2)} — kamera booth otomatis dipotong ke rasio ini.</p>
          </div>
        </Section>
      ) : null}

      {el.type === 'text' ? (
        <Section title="Teks">
          <div className="flex flex-col gap-3">
            <Textarea aria-label="Isi teks" value={el.text} onChange={(e) => up({ text: e.target.value })} className="min-h-20 font-medium" />
            <div className="flex flex-wrap gap-1">
              {['{event}', '{date}', '{time}', '{code}'].map((t) => (
                <button key={t} type="button" onClick={() => up({ text: el.text + t }, null)} className="h-6 rounded-[6px] bg-ink/[0.06] px-2 font-mono text-[11px] text-ink-2 hover:bg-ink/10">{t}</button>
              ))}
            </div>
            <Field label="Font">
              <Select value={el.font} onChange={(e) => up({ font: e.target.value as FontKey })}>
                {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Num label="Pt" value={el.size} onChange={(v) => up({ size: Math.max(4, Math.round(v)) })} min={4} max={1000} suffix="px" />
              <div className="flex gap-1">
                <Button size="icon-sm" className="size-9" variant={el.weight >= 700 ? 'soft' : 'secondary'} onClick={() => up({ weight: el.weight >= 700 ? 400 : 800 })} aria-label="Tebal"><Bold /></Button>
                <Button size="icon-sm" className="size-9" variant={el.italic ? 'soft' : 'secondary'} onClick={() => up({ italic: !el.italic })} aria-label="Miring"><Italic /></Button>
              </div>
            </div>
            <Field label="Ketebalan">
              <Select value={el.weight} onChange={(e) => up({ weight: Number(e.target.value) as 400 })}>
                {FONTS[el.font].weights.map((w) => <option key={w} value={w}>{w}</option>)}
              </Select>
            </Field>
            <ColorField label="Warna" value={el.color} onChange={(v) => up({ color: v })} />
            <Segmented size="sm" value={el.align} onChange={(v) => up({ align: v })} options={[{ value: 'left', label: 'Kiri' }, { value: 'center', label: 'Tengah' }, { value: 'right', label: 'Kanan' }]} />
            <Slider label="Jarak huruf" value={el.letterSpacing} min={-10} max={60} onChange={(v) => up({ letterSpacing: v })} format={(v) => `${v}px`} />
            <Slider label="Tinggi baris" value={el.lineHeight} min={0.7} max={2.5} step={0.05} onChange={(v) => up({ lineHeight: v })} format={(v) => v.toFixed(2)} />
            <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
              <input type="checkbox" checked={!!el.uppercase} onChange={(e) => up({ uppercase: e.target.checked })} className="size-4 accent-brand" /> HURUF KAPITAL
            </label>
          </div>
        </Section>
      ) : null}

      {el.type === 'image' ? (
        <Section title="Gambar">
          <div className="flex flex-col gap-3">
            <FilePick onFile={(f) => onUploadImage('element', f)} disabled={uploading}>
              <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border border-line-strong px-3 text-sm font-semibold hover:bg-canvas"><ImagePlus className="size-4" /> Ganti gambar</span>
            </FilePick>
            <Segmented size="sm" value={el.fit} onChange={(v) => up({ fit: v })} options={[{ value: 'cover', label: 'Penuh' }, { value: 'contain', label: 'Pas' }, { value: 'stretch', label: 'Regang' }]} />
            <Slider label="Sudut membulat" value={el.radius} min={0} max={Math.round(Math.min(el.w, el.h) / 2)} onChange={(v) => up({ radius: v })} format={(v) => `${v}px`} />
            <Button size="sm" variant="secondary" onClick={() => up({ x: 0, y: 0, w: design.width, h: design.height }, null)}>Penuhi kanvas (overlay)</Button>
          </div>
        </Section>
      ) : null}

      {el.type === 'rect' || el.type === 'ellipse' ? (
        <Section title="Bentuk">
          <div className="flex flex-col gap-3">
            <ColorField label="Isi" value={el.fill} onChange={(v) => up({ fill: v })} allowTransparent />
            <ColorField label="Garis tepi" value={el.stroke} onChange={(v) => up({ stroke: v })} allowTransparent />
            <Slider label="Tebal garis tepi" value={el.strokeWidth} min={0} max={60} onChange={(v) => up({ strokeWidth: v })} format={(v) => `${v}px`} />
            {el.type === 'rect' ? <Slider label="Sudut membulat" value={el.radius} min={0} max={Math.round(Math.min(el.w, el.h) / 2)} onChange={(v) => up({ radius: v })} format={(v) => `${v}px`} /> : null}
          </div>
        </Section>
      ) : null}

      {el.type === 'line' ? (
        <Section title="Garis">
          <div className="flex flex-col gap-3">
            <ColorField label="Warna" value={el.color} onChange={(v) => up({ color: v })} />
            <Slider label="Ketebalan" value={el.thickness} min={1} max={40} onChange={(v) => up({ thickness: v })} format={(v) => `${v}px`} />
            <Slider label="Putus-putus" value={el.dash} min={0} max={60} onChange={(v) => up({ dash: v })} format={(v) => (v ? `${v}px` : 'solid')} />
          </div>
        </Section>
      ) : null}

      {el.type === 'qr' ? (
        <Section title="QR sesi">
          <div className="flex flex-col gap-3">
            <p className="text-[12px] leading-relaxed text-ink-2">
              Kode di kanvas hanya contoh. Di booth, area ini diisi QR link softfile tiap tamu — jadi tamu bisa scan langsung dari cetakan.
            </p>
            <ColorField label="Warna kode" value={el.color} onChange={(v) => up({ color: v } as Partial<QrElement>)} />
            <ColorField label="Latar" value={el.background} onChange={(v) => up({ background: v } as Partial<QrElement>)} allowTransparent />
            <Slider label="Ruang tepi" value={el.margin} min={0} max={4} onChange={(v) => up({ margin: v } as Partial<QrElement>)} format={(v) => `${v} modul`} />
            <Slider label="Sudut membulat" value={el.radius} min={0} max={Math.round(el.w / 4)} onChange={(v) => up({ radius: v } as Partial<QrElement>)} format={(v) => `${v}px`} />
            <Field label="Keterangan (opsional)">
              <Input value={el.caption ?? ''} onChange={(e) => up({ caption: e.target.value || undefined } as Partial<QrElement>)} maxLength={40} placeholder="Scan softfile" />
            </Field>
            {el.caption ? <ColorField label="Warna keterangan" value={el.captionColor ?? el.color} onChange={(v) => up({ captionColor: v } as Partial<QrElement>)} /> : null}
            <p className="text-[11px] text-muted">Agar mudah di-scan dari cetakan, beri ukuran minimal ±2 cm (≈240 px pada 300 DPI) dan kontras tinggi.</p>
          </div>
        </Section>
      ) : null}

      {el.type === 'barcode' ? (
        <Section title="Barcode dekoratif">
          <div className="flex flex-col gap-3">
            <ColorField label="Warna" value={el.color} onChange={(v) => up({ color: v })} />
            <Field label="Pola (teks bebas)"><Input value={el.seed} onChange={(e) => up({ seed: e.target.value })} maxLength={40} /></Field>
          </div>
        </Section>
      ) : null}
    </>
  );
}
