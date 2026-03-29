import type {
  RisingSignModeComparisonFixture,
  RisingSignWindowsFixture,
} from '../../utils/fixtureTypes.js';

export const risingSignWindowFixtures: RisingSignWindowsFixture[] = [
  {
    name: 'new-york-ordinary-day-exact',
    input: {
      date: '2026-03-28',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'America/New_York',
      mode: 'exact',
    },
    expectedTotalDurationMinutes: 1440,
    minWindows: 4,
  },
  {
    name: 'los-angeles-spring-forward-day-exact',
    input: {
      date: '2026-03-08',
      latitude: 34.0522,
      longitude: -118.2437,
      timezone: 'America/Los_Angeles',
      mode: 'exact',
    },
    expectedTotalDurationMinutes: 1380,
    minWindows: 4,
    expectOffsetChange: true,
  },
  {
    name: 'los-angeles-fall-back-day-exact',
    input: {
      date: '2026-11-01',
      latitude: 34.0522,
      longitude: -118.2437,
      timezone: 'America/Los_Angeles',
      mode: 'exact',
    },
    expectedTotalDurationMinutes: 1500,
    minWindows: 4,
    expectOffsetChange: true,
  },
];

export const risingSignModeComparisonFixtures: RisingSignModeComparisonFixture[] = [
  {
    name: 'new-york-ordinary-day-mode-precision',
    baseInput: {
      date: '2026-03-28',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'America/New_York',
    },
  },
];
