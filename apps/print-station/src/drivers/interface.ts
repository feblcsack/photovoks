// =============================================================================
// PrintDriver — Abstract interface for platform-specific printer backends
// =============================================================================

export interface PrintOptions {
  copies?: number;
  orientation?: 'portrait' | 'landscape';
}

export type PrintError =
  | { type: 'paper_out' }
  | { type: 'ink_out' }
  | { type: 'paper_jam' }
  | { type: 'offline' }
  | { type: 'unknown'; message: string };

export interface PrintDriver {
  /** Returns true if the print backend binary is available on this system. */
  isAvailable(): Promise<boolean>;

  /** Lists all printers known to the system. */
  listPrinters(): Promise<string[]>;

  /**
   * Sends a file to the named printer.
   * Throws on non-zero exit code or detected error.
   */
  print(filePath: string, printerName: string, options?: PrintOptions): Promise<void>;

  /**
   * Parses command output (stdout/stderr) and returns a structured PrintError
   * if an error condition is detected, or null if output appears clean.
   */
  detectError(output: string): PrintError | null;
}
