import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ProfileStoreError,
  resolveProfileFilePath,
  loadResolvedProfileFile,
  resolveProfileSelection,
} from '../../src/profile-store.js';

function sampleProfileFile(): string {
  return JSON.stringify(
    {
      version: 1,
      defaultProfile: 'elwyn',
      profiles: {
        elwyn: {
          name: 'Elwyn',
          year: 1988,
          month: 6,
          day: 12,
          hour: 14,
          minute: 35,
          latitude: 37.7749,
          longitude: -122.4194,
          timezone: 'America/Los_Angeles',
          house_system: 'W',
          birth_time_disambiguation: 'reject',
        },
        nick: {
          name: 'Nick',
          year: 1987,
          month: 3,
          day: 4,
          hour: 9,
          minute: 15,
          latitude: 37,
          longitude: -122,
          timezone: 'America/Los_Angeles',
        },
      },
    },
    null,
    2
  );
}

async function makeDir(name: string): Promise<string> {
  const dir = path.join(tmpdir(), `astro-profile-test-${name}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe('profile store', () => {
  it('resolves defaultProfile from local .astro.json', async () => {
    const cwd = await makeDir('default');
    await writeFile(path.join(cwd, '.astro.json'), sampleProfileFile(), 'utf8');

    const resolved = await resolveProfileSelection({ cwd, homeDir: cwd });
    expect(resolved?.profileName).toBe('elwyn');
    expect(resolved?.profile.timezone).toBe('America/Los_Angeles');
  });

  it('applies profile precedence from ASTRO_PROFILE env', async () => {
    const cwd = await makeDir('env-profile');
    await writeFile(path.join(cwd, '.astro.json'), sampleProfileFile(), 'utf8');

    const resolved = await resolveProfileSelection({
      cwd,
      homeDir: cwd,
      env: { ...process.env, ASTRO_PROFILE: 'nick' },
    });
    expect(resolved?.profileName).toBe('nick');
  });

  it('uses explicit profileName over env and file default', async () => {
    const cwd = await makeDir('explicit-precedence');
    await writeFile(path.join(cwd, '.astro.json'), sampleProfileFile(), 'utf8');
    const resolved = await resolveProfileSelection({
      cwd,
      homeDir: cwd,
      profileName: 'nick',
      env: { ...process.env, ASTRO_PROFILE: 'elwyn' },
    });
    expect(resolved?.profileName).toBe('nick');
  });

  it('prefers local profile file over home profile file', async () => {
    const cwd = await makeDir('local-over-home-cwd');
    const home = await makeDir('local-over-home-home');
    await writeFile(path.join(home, '.astro.json'), sampleProfileFile().replaceAll('elwyn', 'home-default'), 'utf8');
    await writeFile(path.join(cwd, '.astro.json'), sampleProfileFile(), 'utf8');
    const pathResult = await resolveProfileFilePath({ cwd, homeDir: home }, true);
    expect(pathResult).toBe(path.join(cwd, '.astro.json'));
  });

  it('throws PROFILE_NOT_FOUND for missing explicit profile', async () => {
    const cwd = await makeDir('missing-profile');
    await writeFile(path.join(cwd, '.astro.json'), sampleProfileFile(), 'utf8');

    await expect(
      resolveProfileSelection({ cwd, homeDir: cwd, profileName: 'does-not-exist' })
    ).rejects.toMatchObject<Partial<ProfileStoreError>>({ code: 'PROFILE_NOT_FOUND' });
  });

  it('throws PROFILE_FILE_NOT_FOUND when profile file is required and missing', async () => {
    const cwd = await makeDir('missing-file');

    await expect(loadResolvedProfileFile({ cwd, homeDir: cwd })).rejects.toMatchObject<
      Partial<ProfileStoreError>
    >({ code: 'PROFILE_FILE_NOT_FOUND' });
  });

  it('throws INVALID_PROFILE_FILE for invalid JSON', async () => {
    const cwd = await makeDir('invalid-json');
    await writeFile(path.join(cwd, '.astro.json'), '{invalid json}', 'utf8');

    await expect(loadResolvedProfileFile({ cwd, homeDir: cwd })).rejects.toMatchObject<
      Partial<ProfileStoreError>
    >({ code: 'INVALID_PROFILE_FILE' });
  });

  it('throws DEFAULT_PROFILE_NOT_FOUND when default profile key is invalid', async () => {
    const cwd = await makeDir('bad-default');
    await writeFile(
      path.join(cwd, '.astro.json'),
      JSON.stringify({
        version: 1,
        defaultProfile: 'ghost',
        profiles: {
          elwyn: JSON.parse(sampleProfileFile()).profiles.elwyn,
        },
      }),
      'utf8'
    );

    await expect(resolveProfileSelection({ cwd, homeDir: cwd })).rejects.toMatchObject<
      Partial<ProfileStoreError>
    >({ code: 'DEFAULT_PROFILE_NOT_FOUND' });
  });

  it('throws PROFILE_VALIDATION_FAILED for invalid enum fields', async () => {
    const cwd = await makeDir('enum-invalid');
    await writeFile(
      path.join(cwd, '.astro.json'),
      JSON.stringify({
        version: 1,
        profiles: {
          bad: {
            ...JSON.parse(sampleProfileFile()).profiles.elwyn,
            house_system: 'Z',
          },
        },
      }),
      'utf8'
    );

    await expect(loadResolvedProfileFile({ cwd, homeDir: cwd })).rejects.toMatchObject<
      Partial<ProfileStoreError>
    >({ code: 'PROFILE_VALIDATION_FAILED' });
  });
});
