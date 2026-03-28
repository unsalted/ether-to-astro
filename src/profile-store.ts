import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { SetNatalChartInput } from './astro-service.js';

type HouseSystem = 'P' | 'W' | 'K' | 'E';
type BirthTimeDisambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

export interface AstroProfile {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  latitude: number;
  longitude: number;
  timezone: string;
  house_system?: HouseSystem;
  birth_time_disambiguation?: BirthTimeDisambiguation;
}

export interface AstroProfileFile {
  version: 1;
  defaultProfile?: string;
  profiles: Record<string, AstroProfile>;
}

export type ProfileErrorCode =
  | 'PROFILE_FILE_NOT_FOUND'
  | 'INVALID_PROFILE_FILE'
  | 'PROFILE_NOT_FOUND'
  | 'DEFAULT_PROFILE_NOT_FOUND'
  | 'PROFILE_VALIDATION_FAILED';

export class ProfileStoreError extends Error {
  readonly code: ProfileErrorCode;

  constructor(code: ProfileErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ProfileStoreError';
  }
}

export interface ResolveProfileOptions {
  profileName?: string;
  profileFile?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
}

export interface ResolvedProfileSelection {
  filePath: string;
  file: AstroProfileFile;
  profileName: string;
  profile: AstroProfile;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  label: string,
  profileName: string
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProfileStoreError(
      'PROFILE_VALIDATION_FAILED',
      `Profile "${profileName}" is invalid: ${label} is missing`
    );
  }
  return value;
}

function requireNumber(
  value: unknown,
  label: string,
  profileName: string
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ProfileStoreError(
      'PROFILE_VALIDATION_FAILED',
      `Profile "${profileName}" is invalid: ${label} is missing`
    );
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
  profileName: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ProfileStoreError(
      'PROFILE_VALIDATION_FAILED',
      `Profile "${profileName}" is invalid: ${label} must be one of ${allowed.join(', ')}`
    );
  }
  return value as T;
}

function normalizeProfile(profileName: string, value: unknown): AstroProfile {
  if (!isRecord(value)) {
    throw new ProfileStoreError(
      'PROFILE_VALIDATION_FAILED',
      `Profile "${profileName}" is invalid: profile must be an object`
    );
  }

  const houseSystem = value.house_system;
  const disambiguation = value.birth_time_disambiguation;

  return {
    name: requireString(value.name, 'name', profileName),
    year: requireNumber(value.year, 'year', profileName),
    month: requireNumber(value.month, 'month', profileName),
    day: requireNumber(value.day, 'day', profileName),
    hour: requireNumber(value.hour, 'hour', profileName),
    minute: requireNumber(value.minute, 'minute', profileName),
    latitude: requireNumber(value.latitude, 'latitude', profileName),
    longitude: requireNumber(value.longitude, 'longitude', profileName),
    timezone: requireString(value.timezone, 'timezone', profileName),
    house_system:
      houseSystem === undefined
        ? undefined
        : (requireEnum(houseSystem, 'house_system', ['P', 'W', 'K', 'E'], profileName) as HouseSystem),
    birth_time_disambiguation:
      disambiguation === undefined
        ? undefined
        : (requireEnum(
            disambiguation,
            'birth_time_disambiguation',
            ['compatible', 'earlier', 'later', 'reject'],
            profileName
          ) as BirthTimeDisambiguation),
  };
}

export async function resolveProfileFilePath(
  options: ResolveProfileOptions,
  required: boolean
): Promise<string | null> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();

  const explicitPath = options.profileFile ?? env.ASTRO_PROFILE_FILE;
  if (explicitPath) {
    const resolved = path.resolve(cwd, explicitPath);
    if (!(await exists(resolved))) {
      throw new ProfileStoreError('PROFILE_FILE_NOT_FOUND', `Profile file not found: ${resolved}`);
    }
    return resolved;
  }

  const localPath = path.resolve(cwd, '.astro.json');
  if (await exists(localPath)) {
    return localPath;
  }

  const homePath = path.resolve(homeDir, '.astro.json');
  if (await exists(homePath)) {
    return homePath;
  }

  if (required) {
    throw new ProfileStoreError(
      'PROFILE_FILE_NOT_FOUND',
      `Profile file not found: searched ${localPath} and ${homePath}`
    );
  }
  return null;
}

export async function loadAstroProfileFile(filePath: string): Promise<AstroProfileFile> {
  let parsed: unknown;
  try {
    const raw = await readFile(filePath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProfileStoreError(
      'INVALID_PROFILE_FILE',
      `Invalid profile file: ${filePath} (${message})`
    );
  }

  if (!isRecord(parsed)) {
    throw new ProfileStoreError('INVALID_PROFILE_FILE', `Invalid profile file: ${filePath} (root must be an object)`);
  }
  if (parsed.version !== 1) {
    throw new ProfileStoreError('INVALID_PROFILE_FILE', `Invalid profile file: ${filePath} (version must be 1)`);
  }
  if (!isRecord(parsed.profiles)) {
    throw new ProfileStoreError('INVALID_PROFILE_FILE', `Invalid profile file: ${filePath} (profiles must be an object)`);
  }
  if (parsed.defaultProfile !== undefined && typeof parsed.defaultProfile !== 'string') {
    throw new ProfileStoreError('INVALID_PROFILE_FILE', `Invalid profile file: ${filePath} (defaultProfile must be a string)`);
  }

  const normalizedProfiles: Record<string, AstroProfile> = {};
  for (const [profileName, profileValue] of Object.entries(parsed.profiles)) {
    normalizedProfiles[profileName] = normalizeProfile(profileName, profileValue);
  }

  return {
    version: 1,
    defaultProfile: parsed.defaultProfile as string | undefined,
    profiles: normalizedProfiles,
  };
}

export async function resolveProfileSelection(
  options: ResolveProfileOptions
): Promise<ResolvedProfileSelection | null> {
  const env = options.env ?? process.env;
  const filePath = await resolveProfileFilePath(options, false);
  if (!filePath) {
    return null;
  }

  const file = await loadAstroProfileFile(filePath);
  const profileName = options.profileName ?? env.ASTRO_PROFILE ?? file.defaultProfile;
  if (!profileName) {
    return null;
  }

  const profile = file.profiles[profileName];
  if (!profile) {
    if (!options.profileName && !env.ASTRO_PROFILE && file.defaultProfile === profileName) {
      throw new ProfileStoreError(
        'DEFAULT_PROFILE_NOT_FOUND',
        `defaultProfile is set to "${profileName}", but no such profile exists`
      );
    }
    throw new ProfileStoreError(
      'PROFILE_NOT_FOUND',
      `Profile "${profileName}" not found in ${filePath}`
    );
  }

  return {
    filePath,
    file,
    profileName,
    profile,
  };
}

export async function loadResolvedProfileFile(
  options: ResolveProfileOptions
): Promise<{ filePath: string; file: AstroProfileFile }> {
  const filePath = await resolveProfileFilePath(options, true);
  const file = await loadAstroProfileFile(filePath as string);
  return { filePath: filePath as string, file };
}

export function toNatalInput(profile: AstroProfile): SetNatalChartInput {
  return { ...profile };
}
