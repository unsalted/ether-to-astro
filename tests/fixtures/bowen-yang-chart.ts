import { NatalChart } from '../../src/types.js';

/**
 * Bowen Yang's Birth Chart
 * Born: November 6, 1990, 11:30 AM
 * Location: Brisbane, Australia
 * Coordinates: 27.4705°S, 153.0260°E
 * Timezone: Australia/Brisbane (UTC+10)
 */
export const bowenYangChart: NatalChart = {
  name: "Bowen Yang",
  birthDate: {
    year: 1990,
    month: 11,
    day: 6,
    hour: 1,  // 11:30 AM Brisbane = 01:30 UTC
    minute: 30
  },
  location: {
    latitude: -27.4705,
    longitude: 153.0260,
    timezone: "Australia/Brisbane"
  }
};

/**
 * Alternative test chart for edge cases
 * Born at midnight on New Year's Day
 */
export const midnightChart: NatalChart = {
  name: "Midnight Test",
  birthDate: {
    year: 2000,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0
  },
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    timezone: "America/New_York"
  }
};

/**
 * Test chart for polar regions (edge case)
 */
export const polarChart: NatalChart = {
  name: "Polar Test",
  birthDate: {
    year: 1995,
    month: 6,
    day: 21,
    hour: 12,
    minute: 0
  },
  location: {
    latitude: 78.2232,  // Svalbard, Norway
    longitude: 15.6267,
    timezone: "Arctic/Longyearbyen"
  }
};
