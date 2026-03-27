import { PLANETS } from '../../../../src/types.js';
import type { RootFixture } from '../../utils/fixtureTypes.js';

export const rootFixtures: RootFixture[] = [
  {
    name: 'sign-change-root',
    planetId: PLANETS.MOON,
    targetLongitude: 180,
    startIsoUtc: '2024-01-01T00:00:00Z',
    endIsoUtc: '2024-01-20T00:00:00Z',
    expectedMinRoots: 1,
    expectedMaxRoots: 1,
  },
  {
    name: 'endpoint-near-root',
    planetId: PLANETS.SUN,
    targetFromStartLongitude: true,
    startIsoUtc: '2024-03-20T00:00:00Z',
    endIsoUtc: '2024-03-30T00:00:00Z',
    expectedMinRoots: 1,
  },
  {
    name: 'no-root-interval',
    planetId: PLANETS.SUN,
    targetLongitude: 0,
    startIsoUtc: '2024-03-01T00:00:00Z',
    endIsoUtc: '2024-03-05T00:00:00Z',
    expectedMinRoots: 0,
    expectedMaxRoots: 0,
  },
  {
    name: 'multiple-root-interval',
    planetId: PLANETS.MOON,
    targetLongitude: 0,
    startIsoUtc: '2024-01-01T00:00:00Z',
    endIsoUtc: '2024-03-01T00:00:00Z',
    expectedMinRoots: 2,
  },
  {
    name: 'tangential-mercury-station',
    planetId: PLANETS.MERCURY,
    targetFromSampledMinimum: { samples: 96 },
    startIsoUtc: '2023-12-11T00:00:00Z',
    endIsoUtc: '2023-12-15T00:00:00Z',
    expectedMinRoots: 1,
  },
];
