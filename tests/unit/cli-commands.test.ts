import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli.js';
import { makeTempDir } from '../helpers/temp.js';

const natalArgs = [
  '--name', 'Tester',
  '--year', '1990',
  '--month', '6',
  '--day', '12',
  '--hour', '14',
  '--minute', '35',
  '--latitude', '37.7749',
  '--longitude', '-122.4194',
  '--timezone', 'UTC',
];

describe.sequential('When exercising CLI command handlers end-to-end', () => {
  it('Given inline natal arguments, then key command handlers execute successfully', async () => {
    const io = { stdout: vi.fn(), stderr: vi.fn() };

    const commands: string[][] = [
      ['set-natal-chart', ...natalArgs],
      ['get-retrograde-planets'],
      ['get-asteroid-positions'],
      ['get-next-eclipses'],
      [
        'get-electional-context',
        '--date',
        '2026-03-28',
        '--time',
        '09:30',
        '--timezone',
        'America/Los_Angeles',
        '--latitude',
        '37.7749',
        '--longitude',
        '-122.4194',
      ],
      ['get-transits', ...natalArgs, '--categories', 'all', '--days-ahead', '1', '--max-orb', '5'],
      ['get-houses', ...natalArgs, '--system', 'W'],
      ['get-rise-set-times', ...natalArgs],
      ['generate-natal-chart', ...natalArgs, '--format', 'svg'],
      ['generate-transit-chart', ...natalArgs, '--format', 'svg', '--date', '2024-03-26'],
    ];

    for (const cmd of commands) {
      const code = await runCli(cmd, io);
      expect(code).toBe(0);
    }
  });

  it('Given a valid profile file, then profiles list/show/validate all execute successfully', async () => {
    const dir = await makeTempDir('cli-profile-commands');
    const file = path.join(dir, '.astro.json');
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        defaultProfile: 'default',
        profiles: {
          default: {
            name: 'Test',
            year: 1990,
            month: 1,
            day: 1,
            hour: 1,
            minute: 1,
            latitude: 1,
            longitude: 1,
            timezone: 'UTC',
          },
        },
      }),
      'utf8'
    );

    const io = { stdout: vi.fn(), stderr: vi.fn() };
    expect(await runCli(['profiles', 'list', '--profile-file', file], io)).toBe(0);
    expect(await runCli(['profiles', 'show', '--profile', 'default', '--profile-file', file], io)).toBe(0);
    expect(await runCli(['profiles', 'validate', '--profile-file', file], io)).toBe(0);
  });

  it('Given malformed numeric arguments, then CLI returns a validation error payload', async () => {
    const stderr: string[] = [];
    const code = await runCli(
      ['get-transits', ...natalArgs, '--days-ahead', 'nope'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) }
    );
    expect(code).toBe(1);
    const payload = JSON.parse(stderr.join('\n')) as { code: string };
    expect(payload.code).toBe('CLI_ERROR');
  });
});
