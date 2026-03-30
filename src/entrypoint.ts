import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidTimezone } from './time-utils.js';
import type { HouseSystem } from './types.js';

export interface McpStartupDefaults {
  preferredTimezone?: string;
  preferredHouseStyle?: HouseSystem;
  weekdayLabels?: boolean;
}

export interface EntrypointResolution {
  mode: 'cli' | 'mcp';
  cliArgv: string[];
  mcpHelpRequested: boolean;
  mcpStartupDefaults: Readonly<McpStartupDefaults>;
}

const VALID_HOUSE_STYLES = new Set<HouseSystem>(['P', 'W', 'K', 'E']);

function readOptionValue(argv: string[], index: number, flag: string) {
  const current = argv[index];
  const prefix = `${flag}=`;
  if (current.startsWith(prefix)) {
    return {
      value: current.slice(prefix.length),
      nextIndex: index,
    };
  }

  const next = argv[index + 1];
  if (next === undefined || next.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return {
    value: next,
    nextIndex: index + 1,
  };
}

export function resolveEntrypoint(
  argv: string[],
  invokedPath = process.argv[1] ?? ''
): EntrypointResolution {
  let mode: 'cli' | 'mcp' = path.basename(invokedPath).startsWith('e2a-mcp') ? 'mcp' : 'cli';
  const cliArgv: string[] = [];
  const defaults: McpStartupDefaults = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--mcp') {
      mode = 'mcp';
      continue;
    }

    if (arg === '--weekday-labels') {
      defaults.weekdayLabels = true;
      continue;
    }

    if (arg === '--no-weekday-labels') {
      defaults.weekdayLabels = false;
      continue;
    }

    if (arg === '--preferred-tz' || arg.startsWith('--preferred-tz=')) {
      const { value, nextIndex } = readOptionValue(argv, i, '--preferred-tz');
      defaults.preferredTimezone = value;
      i = nextIndex;
      continue;
    }

    if (arg === '--preferred-house-style' || arg.startsWith('--preferred-house-style=')) {
      const { value, nextIndex } = readOptionValue(argv, i, '--preferred-house-style');
      defaults.preferredHouseStyle = value as HouseSystem;
      i = nextIndex;
      continue;
    }

    cliArgv.push(arg);
  }

  const usedMcpOnlyFlag =
    defaults.preferredTimezone !== undefined ||
    defaults.preferredHouseStyle !== undefined ||
    defaults.weekdayLabels !== undefined;
  if (mode !== 'mcp' && usedMcpOnlyFlag) {
    throw new Error(
      'MCP startup defaults require MCP mode. Use e2a --mcp, or launch via the e2a-mcp compatibility alias.'
    );
  }

  if (defaults.preferredTimezone && !isValidTimezone(defaults.preferredTimezone)) {
    throw new Error(`Invalid timezone: ${defaults.preferredTimezone}`);
  }

  if (defaults.preferredHouseStyle && !VALID_HOUSE_STYLES.has(defaults.preferredHouseStyle)) {
    throw new Error(
      `Invalid preferred house style: ${defaults.preferredHouseStyle} (must be one of P, W, K, E)`
    );
  }

  const mcpHelpRequested =
    mode === 'mcp' &&
    cliArgv.length > 0 &&
    cliArgv.every((arg) => arg === '--help' || arg === '-h');

  if (mode === 'mcp' && cliArgv.length > 0 && !mcpHelpRequested) {
    throw new Error(`Unexpected CLI arguments in MCP mode: ${cliArgv.join(' ')}`);
  }

  return {
    mode,
    cliArgv,
    mcpHelpRequested,
    mcpStartupDefaults: Object.freeze({ ...defaults }),
  };
}

export function isDirectExecution(
  importMetaUrl: string,
  invokedPath = process.argv[1] ?? ''
): boolean {
  if (!invokedPath) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(invokedPath);
  } catch {
    return false;
  }
}
