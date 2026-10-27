// =============================================================================
// SumatraPrintDriver — Windows backend using SumatraPDF
// =============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PrintDriver, PrintError, PrintOptions } from './interface';

const execFileAsync = promisify(execFile);

export class SumatraPrintDriver implements PrintDriver {
  /**
   * Checks whether SumatraPDF.exe is available on PATH via `where`.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('where', ['SumatraPDF.exe']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lists printers on Windows using `wmic printer get Name`.
   * Parses the output, skipping the header line.
   */
  async listPrinters(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('wmic', ['printer', 'get', 'Name']);
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        // Skip the "Name" header line
        .filter((line) => line !== 'Name');
    } catch {
      return [];
    }
  }

  /**
   * Sends `filePath` to `printerName` via SumatraPDF.exe.
   * Uses execFile with an argument array to prevent shell injection.
   * Throws on non-zero exit code.
   */
  async print(filePath: string, printerName: string, _options?: PrintOptions): Promise<void> {
    const args = [
      '-print-to', printerName,
      '-print-settings', 'fit,paper=4x6',
      filePath,
    ];

    const { stderr } = await execFileAsync('SumatraPDF.exe', args);

    const detected = this.detectError(stderr);
    if (detected) {
      throw Object.assign(new Error(`Print error: ${detected.type}`), { printError: detected });
    }
  }

  /**
   * Parses output text for known SumatraPDF / Windows printer error keywords.
   * Returns a structured PrintError or null if no error is detected.
   */
  detectError(output: string): PrintError | null {
    const lower = output.toLowerCase();

    if (lower.includes('paper')) {
      return { type: 'paper_out' };
    }
    if (lower.includes('jam')) {
      return { type: 'paper_jam' };
    }
    if (lower.includes('ink')) {
      return { type: 'ink_out' };
    }
    if (lower.includes('offline')) {
      return { type: 'offline' };
    }

    return null;
  }
}
