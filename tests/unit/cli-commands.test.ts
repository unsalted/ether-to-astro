import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli.js';
import { makeTempDir } from '../helpers/temp.js';

function makeService() {
  return {
    init: vi.fn(async () => {}),
    setNatalChart: vi.fn(() => ({
      data: { ok: true },
      text: 'saved chart',
      chart: {
        name: 'CLI User',
        birthDate: { year: 1990, month: 6, day: 12, hour: 14, minute: 35 },
        location: { latitude: 37.7749, longitude: -122.4194, timezone: 'UTC' },
        planets: [],
        julianDay: 2451545,
        houseSystem: 'P',
      },
    })),
    getNextEclipses: vi.fn(() => ({ data: { timezone: 'UTC', eclipses: [] }, text: 'none' })),
    getServerStatus: vi.fn(() => ({ data: { ok: true }, text: 'status' })),
    getRetrogradePlanets: vi.fn(() => ({ data: { planets: [] }, text: 'retro' })),
    getAsteroidPositions: vi.fn(() => ({ data: { positions: [] }, text: 'asteroids' })),
    getTransits: vi.fn(() => ({ data: { transits: [] }, text: 'transits' })),
    getHouses: vi.fn(() => ({ data: { system: 'P' }, text: 'houses' })),
    getRiseSetTimes: vi.fn(async () => ({ data: { times: [] }, text: 'rise' })),
    generateNatalChart: vi.fn(async () => ({ format: 'svg', text: 'natal', svg: '<svg />' })),
    generateTransitChart: vi.fn(async () => ({ format: 'svg', text: 'transit', svg: '<svg />' })),
  };
}

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

describe('When exercising CLI command handlers end-to-end', () => {
  it('Given inline natal arguments, then key command handlers execute successfully', async () => {
    const service = makeService();
    const io = { stdout: vi.fn(), stderr: vi.fn() };
    const runtime = { createService: () => service as any, env: {}, cwd: process.cwd() };

    const commands: string[][] = [
      ['set-natal-chart', ...natalArgs],
      ['get-retrograde-planets'],
      ['get-asteroid-positions'],
      ['get-next-eclipses'],
      ['get-transits', ...natalArgs, '--categories', 'all', '--days-ahead', '1', '--max-orb', '5'],
      ['get-houses', ...natalArgs, '--system', 'W'],
      ['get-rise-set-times', ...natalArgs],
      ['generate-natal-chart', ...natalArgs, '--format', 'svg'],
      ['generate-transit-chart', ...natalArgs, '--format', 'svg', '--date', '2024-03-26'],
    ];

    for (const cmd of commands) {
      const code = await runCli(cmd, io, runtime);
      expect(code).toBe(0);
    }

    expect(service.setNatalChart).toHaveBeenCalled();
    expect(service.getTransits).toHaveBeenCalled();
    expect(service.getHouses).toHaveBeenCalled();
    expect(service.getRiseSetTimes).toHaveBeenCalled();
    expect(service.generateNatalChart).toHaveBeenCalled();
    expect(service.generateTransitChart).toHaveBeenCalled();
  });

  it('Given a valid profile file, then profiles list/show/validate all execute successfully', async () => {
    const service = makeService();
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
    const runtime = { createService: () => service as any, env: {}, cwd: dir };
    expect(await runCli(['profiles', 'list', '--profile-file', file], io, runtime)).toBe(0);
    expect(await runCli(['profiles', 'show', '--profile', 'default', '--profile-file', file], io, runtime)).toBe(0);
    expect(await runCli(['profiles', 'validate', '--profile-file', file], io, runtime)).toBe(0);
  });

  it('Given malformed numeric arguments, then CLI returns a validation error payload', async () => {
    const service = makeService();
    const stderr: string[] = [];
    const code = await runCli(
      ['get-transits', ...natalArgs, '--days-ahead', 'nope'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) },
      { createService: () => service as any, env: {}, cwd: process.cwd() }
    );
    expect(code).toBe(1);
    const payload = JSON.parse(stderr.join('\n'));
    expect(payload.code).toBe('CLI_ERROR');
  });
});
