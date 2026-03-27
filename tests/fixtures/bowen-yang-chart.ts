import type { NatalChart } from '../../src/types.js';

/**
 * Bowen Yang's Birth Chart
 * Born: November 6, 1990, 11:30 AM
 * Location: Brisbane, Australia
 * Coordinates: 27.4705°S, 153.0260°E
 * Timezone: Australia/Brisbane (UTC+10)
 */
export const bowenYangChart: NatalChart = {
  name: 'Bowen Yang',
  birthDate: {
    year: 1990,
    month: 11,
    day: 6,
    hour: 1, // 11:30 AM Brisbane = 01:30 UTC
    minute: 30,
  },
  location: {
    latitude: -27.4705,
    longitude: 153.026,
    timezone: 'Australia/Brisbane',
  },
  julianDay: 2448201.5625, // Nov 6, 1990, 01:30 UTC
  houseSystem: 'P',
};

/**
 * Alternative test chart for edge cases
 * Born at midnight on New Year's Day
 */
export const midnightChart: NatalChart = {
  name: 'Midnight Test',
  birthDate: {
    year: 2000,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
  },
  location: {
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
  },
  julianDay: 2451544.5, // Jan 1, 2000, 00:00 UTC
  houseSystem: 'P',
};

/**
 * Test chart for polar regions (edge case)
 */
export const polarChart: NatalChart = {
  name: 'Polar Test',
  birthDate: {
    year: 1995,
    month: 6,
    day: 21,
    hour: 12,
    minute: 0,
  },
  location: {
    latitude: 78.2232, // Svalbard, Norway
    longitude: 15.6267,
    timezone: 'Arctic/Longyearbyen',
  },
  julianDay: 2449887.0, // Jun 21, 1995, 12:00 UTC
  houseSystem: 'W', // Whole Sign for polar latitude
};
