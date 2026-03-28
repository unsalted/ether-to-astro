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
    getNextEclipses: vi.fn(() => ({
      data: { timezone: 'UTC', eclipses: [] },
      text: 'No eclipses found in the near future.',
    })),
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

describe('When running CLI commands', () => {
  it('Given default output mode, then JSON is emitted; and with --pretty, human text is emitted', async () => {
    const service = makeService();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const codeJson = await runCli(
      ['get-next-eclipses'],
      { stdout: (m) => stdout.push(m), stderr: (m) => stderr.push(m) },
      { createService: () => service as any, env: {}, cwd: process.cwd() }
    );
    expect(codeJson).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout[0])).toMatchObject({ timezone: 'UTC' });

    stdout.length = 0;
    const codePretty = await runCli(
      ['get-next-eclipses', '--pretty'],
      { stdout: (m) => stdout.push(m), stderr: (m) => stderr.push(m) },
      { createService: () => service as any, env: {}, cwd: process.cwd() }
    );
    expect(codePretty).toBe(0);
    expect(stdout[0]).toContain('e2a');
  });

  it('Given runtime cwd/env injection, then profile lookup resolves from injected context', async () => {
    const dir = await makeTempDir('cli-profile');
    await writeFile(
      path.join(dir, '.astro.json'),
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
    const service = makeService();
    const stdout: string[] = [];

    const code = await runCli(
      ['get-next-eclipses'],
      { stdout: (m) => stdout.push(m), stderr: vi.fn() },
      { createService: () => service as any, env: {}, cwd: dir }
    );

    expect(code).toBe(0);
    expect(service.getNextEclipses).toHaveBeenCalledWith('UTC');
  });

  it('Given injected cwd and relative natal file path, then natal input resolves from injected context', async () => {
    const dir = await makeTempDir('cli-natal-file');
    await writeFile(
      path.join(dir, 'natal.json'),
      JSON.stringify({
        name: 'Test',
        year: 1990,
        month: 1,
        day: 1,
        hour: 1,
        minute: 1,
        latitude: 1,
        longitude: 1,
        timezone: 'UTC',
      }),
      'utf8'
    );
    const service = makeService();

    const code = await runCli(
      ['get-houses', '--natal-file', 'natal.json'],
      { stdout: vi.fn(), stderr: vi.fn() },
      { createService: () => service as any, env: {}, cwd: dir }
    );

    expect(code).toBe(0);
    expect(service.setNatalChart).toHaveBeenCalled();
    expect(service.getHouses).toHaveBeenCalled();
  });

  it('Given a missing profile file, then CLI returns a structured JSON error payload', async () => {
    const service = makeService();
    const stderr: string[] = [];
    const code = await runCli(
      ['profiles', 'show', '--profile', 'missing', '--profile-file', '/tmp/does-not-exist.json'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) },
      { createService: () => service as any, env: {}, cwd: process.cwd() }
    );
    expect(code).toBe(1);
    const payload = JSON.parse(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_FILE_NOT_FOUND');
  });

  it('Given a natal-dependent command with no natal context, then PROFILE_NOT_FOUND is returned', async () => {
    const service = makeService();
    const stderr: string[] = [];
    const code = await runCli(
      ['get-houses'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) },
      { createService: () => service as any, env: {}, cwd: process.cwd() }
    );
    expect(code).toBe(1);
    const payload = JSON.parse(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_NOT_FOUND');
  });

  it('Given --pretty on failure, then error output is human-readable rather than JSON', async () => {
    const service = makeService();
    const stderr: string[] = [];
    const code = await runCli(
      ['get-transits', '--pretty', '--year', 'abc'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) },
      { createService: () => service as any, env: {}, cwd: process.cwd() }
    );
    expect(code).toBe(1);
    expect(stderr.join('\n')).not.toContain('{');
  });

  it('Given set-natal-chart without inline/file/profile input, then PROFILE_NOT_FOUND is returned', async () => {
    const service = makeService();
    const stderr: string[] = [];
    const code = await runCli(
      ['set-natal-chart'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) },
      { createService: () => service as any, env: {}, cwd: process.cwd() }
    );
    expect(code).toBe(1);
    const payload = JSON.parse(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_NOT_FOUND');
  });

  it('Given profiles show for a missing profile key, then PROFILE_NOT_FOUND is returned', async () => {
    const service = makeService();
    const dir = await makeTempDir('cli-show-missing');
    const file = path.join(dir, '.astro.json');
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        profiles: {
          default: {
            name: 'Default',
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
    const stderr: string[] = [];
    const code = await runCli(
      ['profiles', 'show', '--profile', 'ghost', '--profile-file', file],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) },
      { createService: () => service as any, env: {}, cwd: dir }
    );
    expect(code).toBe(1);
    const payload = JSON.parse(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_NOT_FOUND');
  });
});
