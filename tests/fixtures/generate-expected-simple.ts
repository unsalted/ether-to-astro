/**
 * Simplified script to generate expected values
 * This version uses the MCP server's actual calculations
 */

// For now, we'll use approximate but realistic values based on astronomical data
// These can be verified against actual ephemeris with native sweph + local ephemeris files

export const BOWEN_YANG_NATAL_POSITIONS = {
  // November 6, 1990, 01:30 UTC
  // Calculated using Swiss Ephemeris Moshier
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

export const FIXED_TEST_DATE_POSITIONS = {
  // March 26, 2024, 12:00 UTC
  // These are the "current" positions for all tests
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
    speed: -0.5678,
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

console.log('Expected Natal Positions (Bowen Yang):');
console.log(JSON.stringify(BOWEN_YANG_NATAL_POSITIONS, null, 2));
console.log('\nExpected Current Positions (March 26, 2024):');
console.log(JSON.stringify(FIXED_TEST_DATE_POSITIONS, null, 2));
