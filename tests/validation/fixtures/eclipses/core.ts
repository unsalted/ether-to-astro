import type { EclipseFixture } from '../../utils/fixtureTypes.js';

export const eclipseFixtures: EclipseFixture[] = [
  {
    name: 'next-solar-eclipse-sanity',
    startIsoUtc: '2024-03-26T00:00:00Z',
    type: 'solar',
  },
  {
    name: 'next-lunar-eclipse-sanity',
    startIsoUtc: '2024-03-26T00:00:00Z',
    type: 'lunar',
  },
];
