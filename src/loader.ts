#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Set up browser globals for astrochart library BEFORE any imports
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).self = globalThis; // Critical: astrochart checks for 'self' - see https://github.com/AstroDraw/AstroChart/issues/85
(globalThis as any).SVGElement = dom.window.SVGElement;

// Polyfill fetch for file:// URLs (needed for Swiss Ephemeris WASM loading)
const originalFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: string | URL, ...args: any[]) => {
  const urlStr = url.toString();
  if (urlStr.startsWith('file://')) {
    const filePath = fileURLToPath(urlStr);
    const buffer = await readFile(filePath);
    return {
      ok: true,
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    };
  }
  return originalFetch(url, ...args);
};

// Use dynamic import() so the above globals are set BEFORE index.js (and charts.js) load
import('./index.js').then(({ main }) => {
  main().catch((error) => {
    console.error('[ERROR] Failed to start server:', error);
    process.exit(1);
  });
});
