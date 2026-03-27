import { PLANETS } from '../../../../src/types.js';
import type { RiseSetFixture } from '../../utils/fixtureTypes.js';

export const riseSetFixtures: RiseSetFixture[] = [
  {
    name: 'los-angeles-next-events',
    isoUtc: '2024-03-26T20:30:00Z',
    latitude: 34.0522,
    longitude: -118.2437,
    planetId: PLANETS.SUN,
  },
  {
    name: 'high-latitude-no-rise-no-set',
    isoUtc: '2024-12-21T00:00:00Z',
    latitude: 78.2232,
    longitude: 15.6267,
    planetId: PLANETS.SUN,
    expectedNoRiseSet: true,
  },
];
