#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Set up browser globals for astrochart library BEFORE any imports
import { JSDOM } from 'jsdom';
import { resolveEntrypoint } from './entrypoint.js';

function initializeRuntime() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).self = globalThis; // Critical: astrochart checks for 'self' - see https://github.com/AstroDraw/AstroChart/issues/85
  (globalThis as any).SVGElement = dom.window.SVGElement;

  // Polyfill fetch for file:// URLs used by chart tooling in Node.
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
}

function emitMcpHelp(invokedPath = process.argv[1] ?? '') {
  const invokedName = invokedPath.includes('e2a-mcp') ? 'e2a-mcp' : 'e2a';
  const launchExample =
    invokedName === 'e2a-mcp'
      ? 'e2a-mcp --preferred-tz America/Los_Angeles --preferred-house-style W --weekday-labels'
      : 'e2a --mcp --preferred-tz America/Los_Angeles --preferred-house-style W --weekday-labels';

  console.log(`Usage: ${invokedName === 'e2a-mcp' ? 'e2a-mcp' : 'e2a --mcp'} [options]

Start the ether-to-astro MCP server with optional deterministic startup defaults.

Options:
  --preferred-tz <iana>           Default reporting timezone for MCP surfaces
  --preferred-house-style <P|W|K|E>
                                  Default house-style preference for MCP surfaces
  --weekday-labels                Include weekday labels in human-readable MCP text output
  --no-weekday-labels             Disable weekday labels in human-readable MCP text output
  -h, --help                      Show this help

Example:
  ${launchExample}`);
}

export async function runEntrypoint(argv = process.argv.slice(2), invokedPath = process.argv[1]) {
  initializeRuntime();
  const resolved = resolveEntrypoint(argv, invokedPath);

  if (resolved.mode === 'mcp') {
    if (resolved.mcpHelpRequested) {
      emitMcpHelp(invokedPath);
      return;
    }
    const { main } = await import('./index.js');
    await main(resolved.mcpStartupDefaults);
    return;
  }

  const { runCli } = await import('./cli.js');
  const code = await runCli(resolved.cliArgv);
  process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEntrypoint().catch((error) => {
    console.error('[ERROR] Failed to start program:', error);
    process.exit(1);
  });
}
