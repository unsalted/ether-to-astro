import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { vi } from 'vitest';

// Polyfill for self (needed for AstroChart library)
if (typeof global.self === 'undefined') {
  (global as any).self = global;
}

// Mock Date to a fixed timestamp for consistent test results
// Using March 26, 2024, 12:00:00 UTC as the "current" date for all tests
export const FIXED_TEST_DATE = new Date('2024-03-26T12:00:00Z');
vi.setSystemTime(FIXED_TEST_DATE);

// Mock fetch for WASM loading
(global as any).fetch = vi.fn(async (url: any) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  // Mock WASM file loading
  if (urlStr.includes('.wasm')) {
    try {
      const wasmPath = join(process.cwd(), 'node_modules/@fusionstrings/swiss-eph/dist/sweph.wasm');
      const buffer = await readFile(wasmPath);
      return {
        ok: true,
        arrayBuffer: async () => buffer.buffer,
        headers: new Headers({ 'content-type': 'application/wasm' }),
      } as Response;
    } catch (_error) {
      // Return empty WASM if file not found (will use Moshier fallback)
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response;
    }
  }

  return {
    ok: false,
    status: 404,
    statusText: 'Not Found',
  } as Response;
});
