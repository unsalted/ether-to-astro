#!/usr/bin/env node

import { isDirectExecution } from './entrypoint.js';
import { runEntrypoint } from './loader.js';

if (isDirectExecution(import.meta.url)) {
  runEntrypoint(['--mcp', ...process.argv.slice(2)], process.argv[1]).catch((error) => {
    console.error('[ERROR] Failed to start program:', error);
    process.exit(1);
  });
}
