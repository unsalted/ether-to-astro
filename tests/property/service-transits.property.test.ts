import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GetTransitsInput } from '../../src/astro-service/service-types.js';
import { ASPECTS, PLANETS, ZODIAC_SIGNS } from '../../src/types.js';
import type { InternalValidationAdapter } from '../validation/adapters/internal.js';
import type { ServiceTransitNatalFixture } from '../validation/utils/fixtureTypes.js';
import {
  dateOnlyArb,
  longitudeArb,
  nonPolarLatitudeArb,
  timezoneArb,
} from './helpers/arbitraries.js';
import { propertyConfig } from './helpers/config.js';
import { getInternalValidationAdapter } from './helpers/runtime.js';

const SERVICE_TRANSIT_PLANET_IDS = [
  PLANETS.SUN,
  PLANETS.MOON,
  PLANETS.MERCURY,
  PLANETS.VENUS,
  PLANETS.MARS,
  PLANETS.JUPITER,
  PLANETS.SATURN,
] as const;

const serviceTransitOffsetArb = fc
  .record({
    transitingPlanetId: fc.constantFrom(...SERVICE_TRANSIT_PLANET_IDS),
    natalPlanetId: fc.constantFrom(...SERVICE_TRANSIT_PLANET_IDS),
    aspectAngle: fc.constantFrom(...ASPECTS.map((aspect) => aspect.angle)),
    deviation: fc.double({
      min: -1.5,
      max: 1.5,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  })
  .map(({ transitingPlanetId, natalPlanetId, aspectAngle, deviation }) => ({
    transitingPlanetId,
    natalPlanetId,
    natalOffsetDegrees: (aspectAngle + deviation + 360) % 360,
  }));

const serviceTransitFixtureArb = fc
  .record({
    latitude: nonPolarLatitudeArb,
    longitude: longitudeArb,
    timezone: timezoneArb,
    houseSystem: fc.constantFrom('P' as const, 'W' as const),
    planetOffsets: fc.array(serviceTransitOffsetArb, { minLength: 2, maxLength: 4 }),
  })
  .map(
    ({ latitude, longitude, timezone, houseSystem, planetOffsets }): ServiceTransitNatalFixture => ({
      name: 'Property Transit Fixture',
      latitude,
      longitude,
      timezone,
      julianDayIsoUtc: '1990-06-12T21:35:00Z',
      houseSystem,
      planetOffsets,
    })
  );

describe('Property: service-level transit serialization', () => {
  let adapter: InternalValidationAdapter;

  beforeAll(async () => {
    adapter = await getInternalValidationAdapter();
  });

  it('keeps snapshot transit payloads enriched and astrologically valid', async () => {
    await fc.assert(
      fc.property(serviceTransitFixtureArb, dateOnlyArb, timezoneArb, (natalChart, date, reportingTimezone) => {
        const result = adapter.getServiceTransits({
          natalChart,
          transitInput: {
            date,
            mode: 'snapshot',
          } satisfies GetTransitsInput,
          startupDefaults: {
            preferredTimezone: reportingTimezone,
          },
        });

        expect(result.timezone).toBe(reportingTimezone);
        expect(result.calculationTimezone).toBe(natalChart.timezone);
        expect(result.reportingTimezone).toBe(reportingTimezone);

        fc.pre((result.transits?.length ?? 0) > 0);
        for (const transit of result.transits ?? []) {
          expect(transit.transitSign).toBeDefined();
          expect(transit.natalSign).toBeDefined();
          expect(transit.transitDegree).toBeDefined();
          expect(transit.natalDegree).toBeDefined();
          expect(transit.transitHouse).toBeDefined();
          expect(transit.natalHouse).toBeDefined();
          expect(ZODIAC_SIGNS).toContain(transit.transitSign);
          expect(ZODIAC_SIGNS).toContain(transit.natalSign);
          expect(transit.transitDegree).toBeGreaterThanOrEqual(0);
          expect(transit.transitDegree).toBeLessThan(30);
          expect(transit.natalDegree).toBeGreaterThanOrEqual(0);
          expect(transit.natalDegree).toBeLessThan(30);
          expect(transit.transitHouse).toBeGreaterThanOrEqual(1);
          expect(transit.transitHouse).toBeLessThanOrEqual(12);
          expect(transit.natalHouse).toBeGreaterThanOrEqual(1);
          expect(transit.natalHouse).toBeLessThanOrEqual(12);
        }
      }),
      propertyConfig({ heavy: true })
    );
  });

  it('keeps forecast grouping and timezone metadata stable', async () => {
    await fc.assert(
      fc.property(
        serviceTransitFixtureArb,
        dateOnlyArb,
        timezoneArb,
        fc.integer({ min: 0, max: 3 }),
        (natalChart, date, reportingTimezone, daysAhead) => {
          const result = adapter.getServiceTransits({
            natalChart,
            transitInput: {
              date,
              mode: 'forecast',
              days_ahead: daysAhead,
            } satisfies GetTransitsInput,
            startupDefaults: {
              preferredTimezone: reportingTimezone,
            },
          });

          expect(result.mode).toBe('forecast');
          expect(result.timezone).toBe(reportingTimezone);
          expect(result.calculationTimezone).toBe(natalChart.timezone);
          expect(result.reportingTimezone).toBe(reportingTimezone);
          expect(result.forecast).toHaveLength(daysAhead + 1);

          for (const day of result.forecast ?? []) {
            expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            for (const transit of day.transits) {
              expect(transit.transitSign).toBeDefined();
              expect(transit.natalSign).toBeDefined();
              expect(transit.transitDegree).toBeGreaterThanOrEqual(0);
              expect(transit.transitDegree).toBeLessThan(30);
            }
          }
        }
      ),
      propertyConfig({ heavy: true })
    );
  });
});

