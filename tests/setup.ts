import { vi } from 'vitest';

// Polyfill for self (needed for AstroChart library)
if (typeof global.self === 'undefined') {
  (global as any).self = global;
}

// Mock Date to a fixed timestamp for consistent test results
// Using March 26, 2024, 12:00:00 UTC as the "current" date for all tests
export const FIXED_TEST_DATE = new Date('2024-03-26T12:00:00Z');
vi.setSystemTime(FIXED_TEST_DATE);
