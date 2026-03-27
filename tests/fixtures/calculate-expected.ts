/**
 * Helper script to calculate expected results from actual ephemeris data
 * Run this to generate expected values for test assertions
 */
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { PLANETS } from '../../src/types.js';
import { bowenYangChart } from './bowen-yang-chart.js';

export async function calculateExpectedResults() {
  const ephem = new EphemerisCalculator();
  await ephem.init();

  // Calculate Bowen Yang's natal positions
  const birthDate = new Date(Date.UTC(
    bowenYangChart.birthDate.year,
    bowenYangChart.birthDate.month - 1,
    bowenYangChart.birthDate.day,
    bowenYangChart.birthDate.hour,
    bowenYangChart.birthDate.minute
  ));
  
  const birthJD = ephem.dateToJulianDay(birthDate);
  const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));

  console.log('Bowen Yang Natal Positions (Nov 6, 1990, 01:30 UTC):');
  console.log('='.repeat(60));
  natalPlanets.forEach(planet => {
    console.log(`${planet.planet.padEnd(10)} ${planet.longitude.toFixed(4)}° (${planet.sign} ${planet.degree.toFixed(2)}°) Speed: ${planet.speed.toFixed(4)}`);
  });

  // Calculate positions for fixed test date (March 26, 2024, 12:00 UTC)
  const testDate = new Date('2024-03-26T12:00:00Z');
  const testJD = ephem.dateToJulianDay(testDate);
  const testPlanets = ephem.getAllPlanets(testJD, Object.values(PLANETS));

  console.log('\nCurrent Positions (March 26, 2024, 12:00 UTC):');
  console.log('='.repeat(60));
  testPlanets.forEach(planet => {
    console.log(`${planet.planet.padEnd(10)} ${planet.longitude.toFixed(4)}° (${planet.sign} ${planet.degree.toFixed(2)}°) Speed: ${planet.speed.toFixed(4)}`);
  });

  return {
    natal: natalPlanets,
    current: testPlanets,
    birthJD,
    testJD
  };
}

// Export expected values for use in tests
export const EXPECTED_NATAL_POSITIONS = {
  // These will be filled in after running calculateExpectedResults()
  // For now, using approximate values
  sun: { longitude: 223.5, sign: 'Scorpio', degree: 13.5 },
  moon: { sign: 'Taurus' },
  mercury: { sign: 'Scorpio' },
  venus: { sign: 'Libra' },
  mars: { sign: 'Gemini' }
};

export const EXPECTED_CURRENT_POSITIONS = {
  // March 26, 2024, 12:00 UTC positions
  // These will be calculated and filled in
  sun: { sign: 'Aries' },
  moon: { sign: 'Gemini' }
};

// Run this if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  calculateExpectedResults().then(() => {
    console.log('\nCopy these values into expected-results.ts');
  }).catch(console.error);
}
