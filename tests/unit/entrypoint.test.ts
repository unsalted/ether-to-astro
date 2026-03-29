import { describe, expect, it } from 'vitest';
import { resolveEntrypoint } from '../../src/entrypoint.js';

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
});
