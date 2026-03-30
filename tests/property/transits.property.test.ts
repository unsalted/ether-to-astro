import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { deduplicateTransits } from '../../src/transits.js';
import { ASPECTS, PLANETS } from '../../src/types.js';
import type { Transit } from '../../src/types.js';
import type { InternalValidationAdapter } from '../validation/adapters/internal.js';
import { dateOnlyArb, utcDateArb } from './helpers/arbitraries.js';
import { propertyConfig } from './helpers/config.js';
import { getInternalValidationAdapter } from './helpers/runtime.js';

const PLANET_NAMES = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
] as const;

const ASPECT_ORB_BY_NAME = new Map(ASPECTS.map((aspect) => [aspect.name, aspect.orb]));
const PLANET_IDS = [PLANETS.SUN, PLANETS.MOON, PLANETS.MERCURY, PLANETS.VENUS, PLANETS.MARS] as const;

const transitArb: fc.Arbitrary<Transit> = fc.record({
  transitingPlanet: fc.constantFrom(...PLANET_NAMES),
  natalPlanet: fc.constantFrom(...PLANET_NAMES),
  aspect: fc.constantFrom(...ASPECTS.map((aspect) => aspect.name)),
  orb: fc.double({ min: 0, max: 8, noNaN: true, noDefaultInfinity: true }),
  exactTime: fc.option(utcDateArb, { nil: undefined }),
  exactTimeStatus: fc.option(
    fc.constantFrom('within_preview', 'outside_preview', 'not_found', 'unsupported_body'),
    { nil: undefined }
  ),
  isApplying: fc.boolean(),
  transitLongitude: fc.double({ min: 0, max: 359.999, noNaN: true, noDefaultInfinity: true }),
  natalLongitude: fc.double({ min: 0, max: 359.999, noNaN: true, noDefaultInfinity: true }),
});

const transitOffsetArb = fc.record({
  transitingPlanetId: fc.constantFrom(...PLANET_IDS),
  natalPlanetId: fc.constantFrom(...PLANET_IDS),
  date: dateOnlyArb,
  aspectAngle: fc.constantFrom(...ASPECTS.map((aspect) => aspect.angle)),
  deviation: fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
});

function canonicalizeDeduped(transits: Transit[]) {
  return deduplicateTransits(transits)
    .map((transit) => ({
      key: `${transit.transitingPlanet}-${transit.natalPlanet}-${transit.aspect}`,
      orb: transit.orb,
      exactTime: transit.exactTime?.toISOString(),
      exactTimeStatus: transit.exactTimeStatus,
      transitLongitude: transit.transitLongitude,
      natalLongitude: transit.natalLongitude,
      isApplying: transit.isApplying,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

describe('Property: transit engine', () => {
  let adapter: InternalValidationAdapter;

  beforeAll(async () => {
    adapter = await getInternalValidationAdapter();
  });

  it('keeps deduplication idempotent and order-independent', async () => {
    await fc.assert(
      fc.property(fc.array(transitArb, { minLength: 1, maxLength: 20 }), (transits) => {
        const firstPass = canonicalizeDeduped(transits);
        const secondPass = canonicalizeDeduped(deduplicateTransits(transits));
        const reversedPass = canonicalizeDeduped([...transits].reverse());

        expect(secondPass).toEqual(firstPass);
        expect(reversedPass).toEqual(firstPass);
        expect(new Set(firstPass.map((transit) => transit.key)).size).toBe(firstPass.length);
      }),
      propertyConfig()
    );
  });

  it('keeps live transits within configured aspect orbs and exact-time status rules', async () => {
    await fc.assert(
      fc.property(transitOffsetArb, ({ transitingPlanetId, natalPlanetId, date, aspectAngle, deviation }) => {
        const transits = adapter.getTransitsFromOffsets({
          currentIsoUtc: `${date}T12:00:00Z`,
          transitingPlanetId,
          natalPlanetId,
          natalOffsetDegrees: (aspectAngle + deviation + 360) % 360,
        });

        fc.pre(transits.length > 0);
        for (const transit of transits) {
          expect(transit.orb).toBeLessThanOrEqual(ASPECT_ORB_BY_NAME.get(transit.aspect) ?? Number.POSITIVE_INFINITY);

          if (transit.exactTime) {
            expect(transit.exactTimeStatus).toBe('within_preview');
          }

          if (
            transit.exactTimeStatus === 'outside_preview' ||
            transit.exactTimeStatus === 'not_found' ||
            transit.exactTimeStatus === 'unsupported_body'
          ) {
            expect(transit.exactTime).toBeUndefined();
          }
        }
      }),
      propertyConfig({ heavy: true })
    );
  });
});
