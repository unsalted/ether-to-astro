export interface ValidationMismatch {
  fixture: string;
  subsystem: string;
  expected: unknown;
  actual: unknown;
  delta: number | string | null;
  tolerance: number | string;
  message: string;
  capability?: 'available' | 'unavailable';
  validation?: 'executed' | 'skipped_intentionally';
  details?: unknown;
}

export class ValidationReport {
  readonly hardFailures: ValidationMismatch[] = [];
  readonly warnings: ValidationMismatch[] = [];
  generatedAtTestClock?: string;
  generatedAtWallClock?: string;

  addHard(mismatch: ValidationMismatch): void {
    this.hardFailures.push(mismatch);
  }

  addWarning(mismatch: ValidationMismatch): void {
    this.warnings.push(mismatch);
  }

  flushWarningsToConsole(): void {
    for (const w of this.warnings) {
      // Keep warnings readable but compact.
      console.warn(
        `[validation warning] fixture=${w.fixture} subsystem=${w.subsystem} message=${w.message} expected=${JSON.stringify(w.expected)} actual=${JSON.stringify(w.actual)} delta=${w.delta} tolerance=${w.tolerance}`
      );
    }
  }

  toJson(): string {
    const wallClockIso = new Date(Date.now()).toISOString();
    return JSON.stringify(
      {
        hardFailures: this.hardFailures,
        warnings: this.warnings,
        generatedAtTestClock: this.generatedAtTestClock ?? new Date().toISOString(),
        generatedAtWallClock: this.generatedAtWallClock ?? wallClockIso,
      },
      null,
      2
    );
  }
}

export function formatMismatch(mismatch: ValidationMismatch): string {
  return [
    `fixture=${mismatch.fixture}`,
    `subsystem=${mismatch.subsystem}`,
    `message=${mismatch.message}`,
    `expected=${JSON.stringify(mismatch.expected)}`,
    `actual=${JSON.stringify(mismatch.actual)}`,
    `delta=${mismatch.delta}`,
    `tolerance=${mismatch.tolerance}`,
  ].join(' | ');
}
