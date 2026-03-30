import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { InternalValidationAdapter } from '../validation/adapters/internal.js';
import {
  dateOnlyArb,
  houseSystemArb,
  longitudeArb,
  nonPolarLatitudeArb,
  polarLatitudeArb,
} from './helpers/arbitraries.js';
import { propertyConfig } from './helpers/config.js';
import { getInternalValidationAdapter } from './helpers/runtime.js';

function toIsoAtNoon(date: string): string {
  return `${date}T12:00:00Z`;
}

function angleDeltaDegrees(left: number, right: number): number {
  return (right - left + 360) % 360;
}

describe('Property: houses', () => {
  let adapter: InternalValidationAdapter;

  beforeAll(async () => {
    adapter = await getInternalValidationAdapter();
  });

  it('keeps house outputs inside valid longitude ranges', async () => {
    await fc.assert(
      fc.property(dateOnlyArb, nonPolarLatitudeArb, longitudeArb, houseSystemArb, (date, latitude, longitude, houseSystem) => {
        const result = adapter.getHouseResult(toIsoAtNoon(date), latitude, longitude, houseSystem);

        expect(result.cusps).toHaveLength(12);
        for (const value of [...result.cusps, result.ascendant, result.mc]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(360);
        }
      }),
      propertyConfig({ heavy: true })
    );
  });

  it('keeps Whole Sign and Equal cusps spaced by 30 degrees', async () => {
    await fc.assert(
      fc.property(dateOnlyArb, nonPolarLatitudeArb, longitudeArb, fc.constantFrom('W' as const, 'E' as const), (date, latitude, longitude, houseSystem) => {
        const result = adapter.getHouseResult(toIsoAtNoon(date), latitude, longitude, houseSystem);

        for (let index = 0; index < result.cusps.length; index += 1) {
          const current = result.cusps[index];
          const next = result.cusps[(index + 1) % result.cusps.length];
          expect(Math.abs(angleDeltaDegrees(current, next) - 30)).toBeLessThan(0.05);
        }
      }),
      propertyConfig({ heavy: true })
    );
  });

  it('only falls back to Whole Sign in polar edge cases', async () => {
    await fc.assert(
      fc.property(dateOnlyArb, polarLatitudeArb, longitudeArb, houseSystemArb, (date, latitude, longitude, houseSystem) => {
        const result = adapter.getHouseResult(toIsoAtNoon(date), latitude, longitude, houseSystem);

        if (houseSystem === 'W') {
          expect(result.system).toBe('W');
        } else if (result.system !== houseSystem) {
          expect(result.system).toBe('W');
        }
      }),
      propertyConfig({ heavy: true })
    );
  });
});

