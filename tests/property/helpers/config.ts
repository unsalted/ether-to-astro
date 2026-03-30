const DEFAULT_PROPERTY_RUNS = 100;
const DEFAULT_HEAVY_PROPERTY_RUNS = 25;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when provided.`);
  }

  return parsed;
}

function readOptionalIntegerEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer when provided.`);
  }

  return parsed;
}

const sharedSeed = readOptionalIntegerEnv('ASTRO_PROPERTY_SEED');
const defaultRuns = readPositiveIntegerEnv('ASTRO_PROPERTY_RUNS', DEFAULT_PROPERTY_RUNS);
const defaultHeavyRuns = readPositiveIntegerEnv(
  'ASTRO_PROPERTY_HEAVY_RUNS',
  DEFAULT_HEAVY_PROPERTY_RUNS
);

/**
 * Standard `fast-check` execution parameters for this repo's property lane.
 *
 * @remarks
 * All failures should remain reproducible by rerunning with the reported seed,
 * or by overriding `ASTRO_PROPERTY_SEED` and the run-count env vars locally.
 */
export function propertyConfig(options: { heavy?: boolean } = {}) {
  return {
    numRuns: options.heavy ? defaultHeavyRuns : defaultRuns,
    ...(sharedSeed !== undefined ? { seed: sharedSeed } : {}),
    verbose: 1 as const,
  };
}
