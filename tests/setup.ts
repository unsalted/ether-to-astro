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
      const wasmPath = join(
        process.cwd(),
        'node_modules/@fusionstrings/swiss-eph/lib/wasm/swiss_eph.wasm',
      );
      const buffer = await readFile(wasmPath);
      // Convert Node.js Buffer to ArrayBuffer properly
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/wasm' }),
        arrayBuffer: async () => arrayBuffer,
        blob: async () => new Blob([buffer]),
        text: async () => buffer.toString(),
        json: async () => ({}),
      } as Response;
    } catch (_error) {
      // Return empty WASM if file not found (will use Moshier fallback)
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob([]),
        text: async () => '',
        json: async () => ({}),
      } as Response;
    }
  }
  // Default response for other URLs
  return {
    ok: false,
    status: 404,
    statusText: 'Not Found',
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob([]),
    text: async () => '',
    json: async () => ({}),
  } as Response;
});
