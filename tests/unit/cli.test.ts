import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli.js';
import { makeTempDir } from '../helpers/temp.js';

function parseJson(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe.sequential('When running CLI commands', () => {
  let originalCwd: string;
  let originalProfile: string | undefined;
  let originalProfileFile: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalProfile = process.env.ASTRO_PROFILE;
    originalProfileFile = process.env.ASTRO_PROFILE_FILE;
    delete process.env.ASTRO_PROFILE;
    delete process.env.ASTRO_PROFILE_FILE;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalProfile === undefined) delete process.env.ASTRO_PROFILE;
    else process.env.ASTRO_PROFILE = originalProfile;
    if (originalProfileFile === undefined) delete process.env.ASTRO_PROFILE_FILE;
    else process.env.ASTRO_PROFILE_FILE = originalProfileFile;
  });

  it('Given default output mode, then JSON is emitted; and with --pretty, human text is emitted', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const codeJson = await runCli(['get-next-eclipses'], {
      stdout: (m) => stdout.push(m),
      stderr: (m) => stderr.push(m),
    });
    expect(codeJson).toBe(0);
    expect(stderr).toEqual([]);
    expect(parseJson(stdout.join('\n'))).toHaveProperty('timezone');

    stdout.length = 0;
    const codePretty = await runCli(['get-next-eclipses', '--pretty'], {
      stdout: (m) => stdout.push(m),
      stderr: (m) => stderr.push(m),
    });
    expect(codePretty).toBe(0);
    expect(stdout.join('\n')).toContain('ether-to-astro');
  });

  it('Given profile file in cwd, then command resolves profile timezone from cwd context', async () => {
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
    process.chdir(dir);
    const stdout: string[] = [];

    const code = await runCli(['get-next-eclipses'], {
      stdout: (m) => stdout.push(m),
      stderr: vi.fn(),
    });

    expect(code).toBe(0);
    const payload = parseJson(stdout.join('\n'));
    expect(payload.timezone).toBe('UTC');
  });

  it('Given relative natal file path from cwd, then natal-dependent command executes', async () => {
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
    process.chdir(dir);

    const code = await runCli(['get-houses', '--natal-file', 'natal.json'], {
      stdout: vi.fn(),
      stderr: vi.fn(),
    });

    expect(code).toBe(0);
  });

  it('Given a missing profile file, then CLI returns a structured JSON error payload', async () => {
    const stderr: string[] = [];
    const code = await runCli(
      ['profiles', 'show', '--profile', 'missing', '--profile-file', '/tmp/does-not-exist.json'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) }
    );
    expect(code).toBe(1);
    const payload = parseJson(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_FILE_NOT_FOUND');
  });

  it('Given a natal-dependent command with no natal context, then PROFILE_NOT_FOUND is returned', async () => {
    const stderr: string[] = [];
    const code = await runCli(
      ['get-houses'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) }
    );
    expect(code).toBe(1);
    const payload = parseJson(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_NOT_FOUND');
  });

  it('Given --pretty on failure, then error output is human-readable rather than JSON', async () => {
    const stderr: string[] = [];
    const code = await runCli(
      ['get-transits', '--pretty', '--year', 'abc'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) }
    );
    expect(code).toBe(1);
    expect(stderr.join('\n')).not.toContain('{');
  });

  it('Given set-natal-chart without inline/file/profile input, then PROFILE_NOT_FOUND is returned', async () => {
    const stderr: string[] = [];
    const code = await runCli(
      ['set-natal-chart'],
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) }
    );
    expect(code).toBe(1);
    const payload = parseJson(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_NOT_FOUND');
  });

  it('Given profiles show for a missing profile key, then PROFILE_NOT_FOUND is returned', async () => {
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
      { stdout: vi.fn(), stderr: (m) => stderr.push(m) }
    );
    expect(code).toBe(1);
    const payload = parseJson(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_NOT_FOUND');
  });
});
