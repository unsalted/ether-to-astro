#!/usr/bin/env node

import { runEntrypoint } from './loader.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  runEntrypoint(['--mcp', ...process.argv.slice(2)], process.argv[1]).catch((error) => {
    console.error('[ERROR] Failed to start program:', error);
    process.exit(1);
  });
}
