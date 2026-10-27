// =============================================================================
// CupsPrintDriver — macOS/Linux CUPS backend using `lp`
// =============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PrintDriver, PrintError, PrintOptions } from './interface';

const execFileAsync = promisify(execFile);

export class CupsPrintDriver implements PrintDriver {
  /**
   * Checks whether `lp` is available on PATH.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('which', ['lp']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lists printers known to CUPS by parsing `lpstat -a` output.
   * Each line begins with the printer name followed by a space.
   */
  async listPrinters(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('lpstat', ['-a']);
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(' ')[0])
        .filter(Boolean) as string[];
    } catch {
      return [];
    }
  }

  /**
   * Sends `filePath` to `printerName` via `lp` with 4×6 media settings.
   * Uses execFile with an argument array to prevent shell injection.
   * Throws if the process exits with a non-zero code.
   */
  async print(filePath: string, printerName: string, _options?: PrintOptions): Promise<void> {
    const args = [
      '-d', printerName,
      '-o', 'media=4x6',
      '-o', 'fit-to-page',
      filePath,
    ];

    const { stderr } = await execFileAsync('lp', args);

    const detected = this.detectError(stderr);
    if (detected) {
      throw Object.assign(new Error(`Print error: ${detected.type}`), { printError: detected });
    }
  }

  /**
   * Parses output text for known CUPS error keywords.
   * Returns a structured PrintError or null if no error is detected.
   */
  detectError(output: string): PrintError | null {
    const lower = output.toLowerCase();

    if (lower.includes('paper-out') || lower.includes('out of paper')) {
      return { type: 'paper_out' };
    }
    if (lower.includes('jam')) {
      return { type: 'paper_jam' };
    }
    if (lower.includes('ink') || lower.includes('toner')) {
      return { type: 'ink_out' };
    }
    if (lower.includes('offline')) {
      return { type: 'offline' };
    }

    return null;
  }
}
