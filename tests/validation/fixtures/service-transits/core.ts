import { PLANETS } from '../../../../src/types.js';
import type { ServiceTransitFixture } from '../../utils/fixtureTypes.js';

export const serviceTransitFixtures: ServiceTransitFixture[] = [
  {
    name: 'tokyo-local-noon-sign-carry-snapshot',
    natalChart: {
      name: 'Tokyo Boundary Chart',
      latitude: 35.6762,
      longitude: 139.6503,
      timezone: 'Asia/Tokyo',
      julianDayIsoUtc: '1990-06-12T03:00:00Z',
      houseSystem: 'P',
      planetOffsets: [
        {
          transitingPlanetId: PLANETS.SUN,
          natalPlanetId: PLANETS.SUN,
          natalOffsetDegrees: 0,
        },
      ],
    },
    input: {
      date: '2024-03-20',
      mode: 'snapshot',
      categories: ['personal'],
    },
    startupDefaults: {
      preferredTimezone: 'UTC',
    },
    expected: {
      mode: 'snapshot',
      timezone: 'UTC',
      calculationTimezone: 'Asia/Tokyo',
      reportingTimezone: 'UTC',
      windowStart: '2024-03-20',
      windowEnd: '2024-03-20',
      expectTransit: {
        transitingPlanet: 'Sun',
        natalPlanet: 'Sun',
        aspect: 'conjunction',
        transitSign: 'Aries',
        transitDegree: 0,
        natalSign: 'Aries',
        natalDegree: 0,
      },
    },
  },
  {
    name: 'los-angeles-to-tokyo-forecast-grouping',
    natalChart: {
      name: 'Pacific Forecast Chart',
      latitude: 37.7749,
      longitude: -122.4194,
      timezone: 'America/Los_Angeles',
      julianDayIsoUtc: '1990-06-12T21:35:00Z',
      houseSystem: 'P',
      planetOffsets: [
        {
          transitingPlanetId: PLANETS.SUN,
          natalPlanetId: PLANETS.SUN,
          natalOffsetDegrees: 0,
        },
      ],
    },
    input: {
      date: '2024-03-26',
      mode: 'forecast',
      days_ahead: 1,
      categories: ['personal'],
    },
    startupDefaults: {
      preferredTimezone: 'Asia/Tokyo',
    },
    expected: {
      mode: 'forecast',
      timezone: 'Asia/Tokyo',
      calculationTimezone: 'America/Los_Angeles',
      reportingTimezone: 'Asia/Tokyo',
      windowStart: '2024-03-27',
      windowEnd: '2024-03-28',
      forecastDays: 2,
      expectTransit: {
        transitingPlanet: 'Sun',
        natalPlanet: 'Sun',
        aspect: 'conjunction',
      },
    },
  },
];
