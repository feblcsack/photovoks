import Link from 'next/link';
import { ImageOff } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-ink/5 text-muted">
        <ImageOff className="size-6" />
      </span>
      <h1 className="text-lg font-bold">Foto tidak ditemukan</h1>
      <p className="max-w-sm text-sm text-muted">Link mungkin salah, atau foto sudah dihapus otomatis karena melewati masa simpan event.</p>
      <Link href="/" className="mt-2 text-sm font-semibold text-brand">Ke beranda</Link>
    </main>
  );
}
