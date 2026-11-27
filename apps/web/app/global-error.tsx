'use client';

/** Last-resort boundary (root layout failed). Plain HTML — no app styles. */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#0000AA', color: '#fff', fontFamily: 'ui-monospace, Menlo, monospace' }}>
        <div style={{ maxWidth: 560, padding: 24 }}>
          <p style={{ background: '#AAAAAA', color: '#0000AA', display: 'inline-block', padding: '2px 10px', fontWeight: 700 }}> Photovoks </p>
          <p style={{ lineHeight: 1.6 }}>Terjadi kesalahan fatal saat memuat Photovoks. Foto yang sudah tersimpan tetap aman.</p>
          <p style={{ lineHeight: 1.6 }}>* Tekan tombol di bawah untuk mencoba lagi.<br />* Jika terus terjadi, hubungi operator booth.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 16, padding: '10px 18px', background: '#AAAAAA', color: '#000', border: '2px outset #fff', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>
            Coba lagi _
          </button>
        </div>
      </body>
    </html>
  );
}
