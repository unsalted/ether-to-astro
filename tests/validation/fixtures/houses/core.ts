import type { HouseFixture } from '../../utils/fixtureTypes.js';

export const houseFixtures: HouseFixture[] = [
  {
    name: 'nyc-placidus',
    isoUtc: '2024-03-26T12:00:00Z',
    latitude: 40.7128,
    longitude: -74.006,
    houseSystem: 'P',
    expected: {
      system: 'P',
      ascendant: 33.98295887285655,
      mc: 288.8571573752222,
      cusps: [
        33.98295887285655,
        65.33379924755742,
        87.90228930026863,
        108.85715737522219,
        132.88655769961264,
        166.17376459102024,
        213.98295887285656,
        245.3337992475574,
        267.90228930026865,
        288.8571573752222,
        312.88655769961264,
        346.1737645910202,
      ],
    },
  },
  {
    name: 'svalbard-polar-fallback',
    isoUtc: '2024-03-26T12:00:00Z',
    latitude: 78.2232,
    longitude: 15.6267,
    houseSystem: 'P',
    expected: {
      system: 'W',
      ascendant: 157.0869567445154,
      mc: 21.69267914127279,
      cusps: [150, 180, 210, 240, 270, 300, 330, 0, 30, 60, 90, 120],
    },
  },
  {
    name: 'sydney-whole-sign',
    isoUtc: '2024-09-01T00:00:00Z',
    latitude: -33.8688,
    longitude: 151.2093,
    houseSystem: 'W',
    expected: {
      system: 'W',
      ascendant: 238.03867274058655,
      mc: 129.421733545281,
      cusps: [210, 240, 270, 300, 330, 0, 30, 60, 90, 120, 150, 180],
    },
  },
];
