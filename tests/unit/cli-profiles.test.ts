import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli.js';

function parseJson(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe.sequential('CLI profile behavior', () => {
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

  it('profiles show returns PROFILE_FILE_NOT_FOUND when profile file is missing', async () => {
    const missingPath = path.join(tmpdir(), `astro-missing-profile-${Date.now()}.json`);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli(
      ['profiles', 'show', '--profile', 'elwyn', '--profile-file', missingPath],
      {
        stdout: (msg) => stdout.push(msg),
        stderr: (msg) => stderr.push(msg),
      }
    );

    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    const payload = parseJson(stderr.join('\n'));
    expect(payload.code).toBe('PROFILE_FILE_NOT_FOUND');
  });

  it('non-profile command falls back to UTC when local profile file is malformed', async () => {
    const cwd = path.join(tmpdir(), `astro-cli-malformed-${Date.now()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(path.join(cwd, '.astro.json'), '{invalid json', 'utf8');
    process.chdir(cwd);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli(['get-next-eclipses'], {
      stdout: (msg) => stdout.push(msg),
      stderr: (msg) => stderr.push(msg),
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    const payload = parseJson(stdout.join('\n'));
    expect(payload.timezone).toBe('UTC');
  });

  it('non-profile command returns INVALID_PROFILE_FILE when profile is explicitly requested', async () => {
    const cwd = path.join(tmpdir(), `astro-cli-explicit-profile-${Date.now()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(path.join(cwd, '.astro.json'), '{invalid json', 'utf8');
    process.chdir(cwd);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli(['get-next-eclipses', '--profile', 'elwyn'], {
      stdout: (msg) => stdout.push(msg),
      stderr: (msg) => stderr.push(msg),
    });

    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    const payload = parseJson(stderr.join('\n'));
    expect(payload.code).toBe('INVALID_PROFILE_FILE');
  });

  it('profiles commands resolve explicit relative profile paths from injected cwd', async () => {
    const cwd = path.join(tmpdir(), `astro-cli-relative-profile-${Date.now()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(
      path.join(cwd, 'profiles.json'),
      JSON.stringify({
        version: 1,
        defaultProfile: 'elwyn',
        profiles: {
          elwyn: {
            name: 'Elwyn',
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
    process.chdir(cwd);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli(['profiles', 'show', '--profile', 'elwyn', '--profile-file', 'profiles.json'], {
      stdout: (msg) => stdout.push(msg),
      stderr: (msg) => stderr.push(msg),
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    const payload = parseJson(stdout.join('\n'));
    expect(path.basename(String(payload.filePath))).toBe('profiles.json');
    expect(String(payload.filePath)).toContain(path.basename(cwd));
  });
});
