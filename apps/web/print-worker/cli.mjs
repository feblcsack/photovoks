#!/usr/bin/env node
// =============================================================================
// Standalone print worker:  pnpm print
//
// Use this on the laptop connected to the printer when the website itself is
// hosted elsewhere (e.g. Vercel). Reads the same apps/web/.env.local file.
//
//   pnpm print            start printing
//   pnpm print --list     show printers installed on this computer
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPrinters, startPrintWorker } from './worker.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const file = path.join(webDir, name);
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

if (process.argv.includes('--list')) {
  const printers = await listPrinters();
  console.log(printers.length ? printers.map((p) => `  • ${p}`).join('\n') : '  (tidak ada printer terdeteksi)');
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const printerName = process.env.PRINTER_NAME;

if (!supabaseUrl || !serviceKey || !printerName) {
  console.error('\n✖ Konfigurasi belum lengkap. Jalankan dulu:  pnpm configure\n');
  if (!printerName) {
    const printers = await listPrinters();
    console.error('Printer yang terdeteksi di komputer ini:');
    console.error(printers.length ? printers.map((p) => `  • ${p}`).join('\n') : '  (tidak ada)');
  }
  process.exit(1);
}

const worker = startPrintWorker({ supabaseUrl, serviceKey, printerName });
console.log(`\n🖨  Photovoks print worker aktif → printer "${printerName}". Tekan Ctrl+C untuk berhenti.\n`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    worker.stop();
    process.exit(0);
  });
}
