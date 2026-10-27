// =============================================================================
// Driver auto-detection — selects the correct PrintDriver for the current OS
// =============================================================================

import { CupsPrintDriver } from './cups';
import { SumatraPrintDriver } from './sumatra';
import type { PrintDriver } from './interface';

/**
 * Singleton driver instance auto-selected by platform.
 * macOS → CupsPrintDriver (lp / CUPS)
 * Windows / other → SumatraPrintDriver (SumatraPDF.exe)
 */
export const driver: PrintDriver =
  process.platform === 'darwin'
    ? new CupsPrintDriver()
    : new SumatraPrintDriver();

export type { PrintDriver, PrintOptions, PrintError } from './interface';
