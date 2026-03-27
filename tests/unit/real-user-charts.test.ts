import { describe, it, expect, beforeAll } from 'vitest';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { HouseCalculator } from '../../src/houses.js';
import type { NatalChart } from '../../src/types.js';

/**
 * Real user test case: Oct 17 1977, 1:06 PM EDT, Beaver Falls PA
 * 
 * This test validates the exact chart from the user session that exposed
 * multiple time handling bugs:
 * - Bug 1: Moon was showing as Sagittarius instead of 0° Capricorn
 * - Bug 2: Ascendant was showing as Gemini instead of 0° Capricorn  
 * - Bug 3: MC was incorrect due to 4-hour time offset
 * 
 * User confirmed correct values:
 * - Sun: 24° Libra
 * - Moon: 0°09' Capricorn (0.15°)
 * - Ascendant: 0° Capricorn
 * - MC: 24° Libra
 */
describe('Real user chart: Oct 17 1977, 1:06 PM EDT, Beaver Falls PA', () => {
  let ephem: EphemerisCalculator;
  let houseCalc: HouseCalculator;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
    houseCalc = new HouseCalculator(ephem);
  });

  it('should calculate Moon at 0° Capricorn (not Sagittarius)', () => {
    // User reported: Moon should be 0°09' Capricorn
    // Bug: Was showing Sagittarius due to time conversion error
    // 1:06 PM EDT = 17:06 UTC (EDT is UTC-4)
    
    const birthDate = new Date(Date.UTC(1977, 9, 17, 17, 6)); // Oct 17, 5:06 PM UTC
    const jd = ephem.dateToJulianDay(birthDate);
    const positions = ephem.getAllPlanets(jd, [1]); // Moon
    const moon = positions[0];
    
    expect(moon.sign).toBe('Capricorn');
    expect(moon.degree).toBeCloseTo(0.15, 0); // 0°09' ≈ 0.15°
  });

  it('should calculate Ascendant at ~0° Capricorn (not Gemini)', () => {
    // User confirmed: Ascendant 0° Capricorn
    // Bug: Was showing Gemini Ascendant (4 hours off)
    
    const birthDate = new Date(Date.UTC(1977, 9, 17, 17, 6));
    const jd = ephem.dateToJulianDay(birthDate);
    const houses = houseCalc.calculateHouses(
      jd,
      40.7509,  // Beaver Falls, PA
      -80.3198,
      'P'
    );
    
    // Ascendant should be in Capricorn (270-300°)
    expect(houses.ascendant).toBeGreaterThanOrEqual(270);
    expect(houses.ascendant).toBeLessThan(300);
    
    // More specifically, should be very close to 0° Capricorn (270°)
    expect(houses.ascendant).toBeCloseTo(270, 0);
  });

  it('should calculate MC at 24° Libra', () => {
    // User confirmed: MC 24° Libra
    // MC at 24° Libra = 204° (180° + 24°)
    
    const birthDate = new Date(Date.UTC(1977, 9, 17, 17, 6));
    const jd = ephem.dateToJulianDay(birthDate);
    const houses = houseCalc.calculateHouses(
      jd,
      40.7509,
      -80.3198,
      'P'
    );
    
    // MC should be in Libra (180-210°)
    expect(houses.mc).toBeGreaterThanOrEqual(180);
    expect(houses.mc).toBeLessThan(210);
    
    // More specifically, should be around 204° (24° Libra)
    expect(houses.mc).toBeCloseTo(204, 1);
  });

  it('should calculate Sun at 24° Libra', () => {
    // User confirmed: Sun 24° Libra
    
    const birthDate = new Date(Date.UTC(1977, 9, 17, 17, 6));
    const jd = ephem.dateToJulianDay(birthDate);
    const positions = ephem.getAllPlanets(jd, [0]); // Sun
    const sun = positions[0];
    
    expect(sun.sign).toBe('Libra');
    expect(sun.degree).toBeCloseTo(24.22, 1); // Actual: 24°13'
  });

  it('should have Moon conjunct Ascendant (both at 0° Capricorn)', () => {
    // User noted: Moon conjunct Ascendant at 0° Capricorn
    // This is a significant chart feature
    
    const birthDate = new Date(Date.UTC(1977, 9, 17, 17, 6));
    const jd = ephem.dateToJulianDay(birthDate);
    
    const positions = ephem.getAllPlanets(jd, [1]); // Moon
    const moon = positions[0];
    
    const houses = houseCalc.calculateHouses(jd, 40.7509, -80.3198, 'P');
    
    // Both should be in Capricorn
    expect(moon.sign).toBe('Capricorn');
    expect(houses.ascendant).toBeGreaterThanOrEqual(270);
    expect(houses.ascendant).toBeLessThan(300);
    
    // Moon longitude and Ascendant should be very close
    const moonLon = moon.longitude;
    const ascLon = houses.ascendant;
    const diff = Math.abs(moonLon - ascLon);
    
    expect(diff).toBeLessThan(5); // Within 5° conjunction
  });

  it('should have Sun conjunct MC (both at 24° Libra)', () => {
    // User noted: Sun at 24° Libra, MC at 24° Libra
    // Sun conjunct MC is a powerful chart signature
    
    const birthDate = new Date(Date.UTC(1977, 9, 17, 17, 6));
    const jd = ephem.dateToJulianDay(birthDate);
    
    const positions = ephem.getAllPlanets(jd, [0]); // Sun
    const sun = positions[0];
    
    const houses = houseCalc.calculateHouses(jd, 40.7509, -80.3198, 'P');
    
    // Both should be in Libra around 24°
    expect(sun.sign).toBe('Libra');
    expect(houses.mc).toBeGreaterThanOrEqual(180);
    expect(houses.mc).toBeLessThan(210);
    
    // Sun longitude and MC should be very close
    const sunLon = sun.longitude;
    const mcLon = houses.mc;
    const diff = Math.abs(sunLon - mcLon);
    
    expect(diff).toBeLessThan(2); // Within 2° conjunction
  });
});
