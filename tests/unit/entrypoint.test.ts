import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isDirectExecution, resolveEntrypoint } from '../../src/entrypoint.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

function createTempDir(prefix: string): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(tempDir);
  return tempDir;
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        result.stdout && `stdout:\n${result.stdout}`,
        result.stderr && `stderr:\n${result.stderr}`,
      ]
        .filter(Boolean)
        .join('\n\n')
    );
  }

  return result.stdout;
}

describe('When resolving unified binary entrypoint mode', () => {
  it('Given the e2a binary with no startup flags, then CLI mode receives the original argv', () => {
    const resolved = resolveEntrypoint(['get-next-eclipses'], '/usr/local/bin/e2a');
    expect(resolved.mode).toBe('cli');
    expect(resolved.cliArgv).toEqual(['get-next-eclipses']);
    expect(resolved.mcpHelpRequested).toBe(false);
    expect(resolved.mcpStartupDefaults).toEqual({});
  });

  it('Given e2a --mcp with startup defaults, then MCP mode is selected and defaults are parsed', () => {
    const resolved = resolveEntrypoint(
      [
        '--mcp',
        '--preferred-tz',
        'America/Los_Angeles',
        '--preferred-house-style=W',
        '--weekday-labels',
      ],
      '/usr/local/bin/e2a'
    );
    expect(resolved.mode).toBe('mcp');
    expect(resolved.cliArgv).toEqual([]);
    expect(resolved.mcpHelpRequested).toBe(false);
    expect(resolved.mcpStartupDefaults).toEqual({
      preferredTimezone: 'America/Los_Angeles',
      preferredHouseStyle: 'W',
      weekdayLabels: true,
    });
  });

  it('Given the compatibility alias, then MCP mode is selected without --mcp', () => {
    const resolved = resolveEntrypoint(['--preferred-tz', 'UTC'], '/usr/local/bin/e2a-mcp');
    expect(resolved.mode).toBe('mcp');
    expect(resolved.mcpHelpRequested).toBe(false);
    expect(resolved.mcpStartupDefaults).toEqual({
      preferredTimezone: 'UTC',
    });
  });

  it('Given MCP mode help flags, then help is allowed without treating them as CLI args', () => {
    const resolved = resolveEntrypoint(['--mcp', '--help'], '/usr/local/bin/e2a');
    expect(resolved.mode).toBe('mcp');
    expect(resolved.mcpHelpRequested).toBe(true);
    expect(resolved.cliArgv).toEqual(['--help']);
  });

  it('Given MCP-only flags outside MCP mode, then resolution fails clearly', () => {
    expect(() =>
      resolveEntrypoint(['get-next-eclipses', '--preferred-tz', 'UTC'], '/usr/local/bin/e2a')
    ).toThrow(/MCP startup defaults require MCP mode/);
  });

  it('Given invalid startup defaults or CLI args in MCP mode, then resolution fails clearly', () => {
    expect(() =>
      resolveEntrypoint(['--mcp', '--preferred-house-style', 'Q'], '/usr/local/bin/e2a')
    ).toThrow(/Invalid preferred house style/);
    expect(() =>
      resolveEntrypoint(['--mcp', '--preferred-tz', 'Nope/Bad'], '/usr/local/bin/e2a')
    ).toThrow(/Invalid timezone/);
    expect(() =>
      resolveEntrypoint(['--mcp', 'get-next-eclipses'], '/usr/local/bin/e2a')
    ).toThrow(/Unexpected CLI arguments in MCP mode/);
  });

  it('Given a symlinked bin path, then direct execution is still detected', () => {
    const tempDir = createTempDir('astro-entrypoint-');

    const actualPath = path.join(tempDir, 'loader.js');
    const symlinkPath = path.join(tempDir, 'e2a');
    writeFileSync(actualPath, '#!/usr/bin/env node\n');
    symlinkSync(actualPath, symlinkPath);

    expect(isDirectExecution(pathToFileURL(actualPath).href, symlinkPath)).toBe(true);
    expect(isDirectExecution(pathToFileURL(actualPath).href, path.join(tempDir, 'other-bin'))).toBe(
      false
    );
  });

  it(
    'Given symlinked bin shims, then the built entrypoints execute end to end',
    () => {
      const repoRoot = process.cwd();
      const binDir = createTempDir('astro-bin-shims-');
      const env = process.env;

      runCommand('npm', ['run', 'build'], { cwd: repoRoot, env });

      const loaderPath = path.join(repoRoot, 'dist', 'loader.js');
      const mcpAliasPath = path.join(repoRoot, 'dist', 'mcp-alias.js');
      expect(existsSync(loaderPath)).toBe(true);
      expect(existsSync(mcpAliasPath)).toBe(true);

      const e2aBinPath = path.join(binDir, 'e2a');
      const e2aMcpBinPath = path.join(binDir, 'e2a-mcp');
      symlinkSync(loaderPath, e2aBinPath);
      symlinkSync(mcpAliasPath, e2aMcpBinPath);

      const e2aOutput = runCommand(e2aBinPath, ['--help'], {
        cwd: repoRoot,
        env,
      });
      expect(e2aOutput).toContain('Usage: e2a [options] [command]');

      const e2aMcpOutput = runCommand(e2aMcpBinPath, ['--help'], {
        cwd: repoRoot,
        env,
      });
      expect(e2aMcpOutput).toContain('Usage: e2a-mcp [options]');
    },
    60000
  );
});
