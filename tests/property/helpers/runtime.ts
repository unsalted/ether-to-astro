import { InternalValidationAdapter } from '../../validation/adapters/internal.js';

let sharedAdapterPromise: Promise<InternalValidationAdapter> | undefined;

/**
 * Reuse a single initialized adapter per property-test worker so ephemeris
 * startup cost does not scale with generated cases.
 */
export function getInternalValidationAdapter(): Promise<InternalValidationAdapter> {
  sharedAdapterPromise ??= InternalValidationAdapter.create();
  return sharedAdapterPromise;
}
