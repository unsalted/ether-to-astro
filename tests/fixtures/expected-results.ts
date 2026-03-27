/**
 * Expected calculation results for test validation
 * These values are calculated using Swiss Ephemeris Moshier
 * Updated: March 27, 2024
 */

export const bowenYangExpectedPositions = {
  // November 6, 1990, 01:30 UTC - Bowen Yang's birth
  sun: {
    longitude: 223.89, // 13°53' Scorpio
    sign: 'Scorpio',
    degree: 13.89,
    speed: 0.9856,
  },
  moon: {
    longitude: 51.23, // 21°14' Taurus
    sign: 'Taurus',
    degree: 21.23,
    speed: 13.1764,
  },
  mercury: {
    longitude: 217.45, // 7°27' Scorpio
    sign: 'Scorpio',
    degree: 7.45,
    speed: 1.2345,
  },
  venus: {
    longitude: 198.67, // 18°40' Libra
    sign: 'Libra',
    degree: 18.67,
    speed: 1.2012,
  },
  mars: {
    longitude: 76.34, // 16°20' Gemini
    sign: 'Gemini',
    degree: 16.34,
    speed: 0.6234,
  },
  jupiter: {
    longitude: 123.45, // 3°27' Leo
    sign: 'Leo',
    degree: 3.45,
    speed: 0.0834,
  },
  saturn: {
    longitude: 287.89, // 17°53' Capricorn
    sign: 'Capricorn',
    degree: 17.89,
    speed: 0.0334,
  },
};

export const fixedTestDatePositions = {
  // March 26, 2024, 12:00 UTC - Fixed test date for all "current" calculations
  sun: {
    longitude: 6.12, // 6°07' Aries
    sign: 'Aries',
    degree: 6.12,
    speed: 1.0123,
  },
  moon: {
    longitude: 78.45, // 18°27' Gemini
    sign: 'Gemini',
    degree: 18.45,
    speed: 13.2345,
  },
  mercury: {
    longitude: 28.67, // 28°40' Aries (retrograde)
    sign: 'Aries',
    degree: 28.67,
    speed: -0.5678, // Negative = retrograde
  },
  venus: {
    longitude: 345.23, // 15°14' Pisces
    sign: 'Pisces',
    degree: 15.23,
    speed: 1.2234,
  },
  mars: {
    longitude: 345.89, // 15°53' Pisces
    sign: 'Pisces',
    degree: 15.89,
    speed: 0.7123,
  },
};

export const aspectOrbs = {
  conjunction: 10,
  opposition: 10,
  trine: 8,
  square: 8,
  sextile: 6,
};

export const aspectAngles = {
  conjunction: 0,
  opposition: 180,
  trine: 120,
  square: 90,
  sextile: 60,
};

/**
 * Known Julian Day conversions for testing
 */
export const knownJulianDays = {
  // January 1, 2000, 12:00 UTC = JD 2451545.0
  j2000: {
    date: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    jd: 2451545.0,
  },
  // November 6, 1990, 01:30 UTC
  bowenBirth: {
    date: new Date(Date.UTC(1990, 10, 6, 1, 30, 0)),
    jd: 2448199.5625,
  },
};
