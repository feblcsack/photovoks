import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="text-xl font-extrabold">Halaman tidak ditemukan</h1>
      <p className="max-w-sm text-sm text-muted">Periksa kode event atau link yang kamu buka.</p>
      <Link href="/" className="mt-3 text-sm font-semibold text-brand">Ke beranda</Link>
    </main>
  );
}
