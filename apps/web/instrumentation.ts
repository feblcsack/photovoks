/**
 * Runs once when the Next.js server starts.
 *
 * If PRINTER_NAME is set (and we are not on a serverless host), the print
 * worker starts inside this same process — so `pnpm booth` is the ONLY
 * command needed to run the booth website + automatic printing.
 *
 * Set PRINT_WORKER=off to disable (e.g. when running `pnpm print` separately).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.PRINTER_NAME || process.env.PRINT_WORKER === 'off' || process.env.VERCEL) return;

  const g = globalThis as typeof globalThis & { __photovoksPrintWorker?: boolean };
  if (g.__photovoksPrintWorker) return;
  g.__photovoksPrintWorker = true;

  const { startPrintWorker } = await import('./print-worker/worker.mjs');
  try {
    startPrintWorker({
      supabaseUrl: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) ?? '',
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      printerName: process.env.PRINTER_NAME,
    });
  } catch (err) {
    console.error('[print-worker] failed to start:', err);
  }
}
