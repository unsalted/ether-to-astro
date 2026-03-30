import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GetElectionalContextInput } from '../../src/astro-service/service-types.js';
import type { InternalValidationAdapter } from '../validation/adapters/internal.js';
import {
  dateOnlyArb,
  electionalHouseSystemArb,
  longitudeArb,
  nonPolarLatitudeArb,
  polarLatitudeArb,
  timezoneArb,
} from './helpers/arbitraries.js';
import { propertyConfig } from './helpers/config.js';
import { getInternalValidationAdapter } from './helpers/runtime.js';

const SUPPORTED_ELECTIONAL_SYSTEMS = ['P', 'K', 'W', 'R'] as const;

describe('Property: electional service', () => {
  let adapter: InternalValidationAdapter;

  beforeAll(async () => {
    adapter = await getInternalValidationAdapter();
  });

  it('keeps sect classification, warnings, and optional fields aligned with the contract', async () => {
    const electionalInputArb = fc.record({
      date: dateOnlyArb,
      time: fc.constantFrom('00:00', '06:00', '12:00', '18:00', '23:30'),
      timezone: timezoneArb,
      latitude: fc.oneof(nonPolarLatitudeArb, polarLatitudeArb),
      longitude: longitudeArb,
      house_system: electionalHouseSystemArb,
      include_ruler_basics: fc.boolean(),
      include_planetary_applications: fc.boolean(),
      orb_degrees: fc.double({
        min: 0.5,
        max: 5,
        noNaN: true,
        noDefaultInfinity: true,
      }),
    });

    await fc.assert(
      fc.property(electionalInputArb, (input) => {
        const result = adapter.getElectionalContext(input satisfies GetElectionalContextInput);

        expect(result.classification).toBe(result.rawSunAltitudeDegrees >= 0 ? 'day' : 'night');
        expect(result.isDayChart).toBe(result.rawSunAltitudeDegrees >= 0);
        expect(SUPPORTED_ELECTIONAL_SYSTEMS).toContain(result.houseSystem);

        const horizonWarning = result.warnings.some((warning) => warning.includes('near the horizon'));
        expect(horizonWarning).toBe(Math.abs(result.rawSunAltitudeDegrees) < 0.5);

        const fallbackWarning = result.warnings.some((warning) =>
          warning.includes('House calculation fell back')
        );
        expect(fallbackWarning).toBe(result.houseSystem !== input.house_system);

        expect(result.hasApplyingAspects).toBe(input.include_planetary_applications);
        expect(result.hasMoonApplyingAspects).toBe(input.include_planetary_applications);
        expect(result.hasRulerBasics).toBe(input.include_ruler_basics);
      }),
      propertyConfig({ heavy: true })
    );
  });
});

