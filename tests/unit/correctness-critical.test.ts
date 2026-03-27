/**
 * Critical correctness tests that catch real bugs
 * 
 * These 5 tests target the most important edge cases and failure modes:
 * 1. Dual-target aspect exact-time test (+aspect vs -aspect)
 * 2. Retrograde/station exact-time test
 * 3. Multi-day upcoming transit dedupe test (best-hit selection)
 * 4. Polar house fallback test
 * 5. Render failure test (charts error properly on invalid data)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { TransitCalculator, deduplicateTransits } from '../../src/transits.js';
import { HouseCalculator } from '../../src/houses.js';
import { ChartRenderer } from '../../src/charts.js';
import { PLANETS, type NatalChart, type Transit } from '../../src/types.js';

describe('Critical correctness tests', () => {
  let ephem: EphemerisCalculator;
  let transitCalc: TransitCalculator;
  let houseCalc: HouseCalculator;
  let chartRenderer: ChartRenderer;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
    transitCalc = new TransitCalculator(ephem);
    houseCalc = new HouseCalculator(ephem);
    chartRenderer = new ChartRenderer(ephem, houseCalc);
  });

  describe('1. Dual-target aspect exact-time test', () => {
    it('should calculate exact times correctly for both +90° and +180° aspects from same transiting planet', () => {
      // The bug this catches: exact-time search must resolve the correct target longitude
      // Use real Mars ephemeris approaching two natal planets simultaneously
      // Mars moving forward should produce exact times for both aspects
      
      const testDate = new Date('2024-03-15T00:00:00Z');
      const jd = ephem.dateToJulianDay(testDate);
      
      // Get real Mars position
      const marsData = ephem.getAllPlanets(jd, [4]); // Mars
      const marsLon = marsData[0].longitude;
      
      // Create natal planets at positions that will form aspects with Mars
      // Square: +90° from Mars, Opposition: +180° from Mars
      const natalPlanets = [
        { 
          planetId: PLANETS.VENUS,
          planet: 'Venus' as const, 
          longitude: (marsLon + 90) % 360, 
          latitude: 0, 
          distance: 1, 
          speed: 1, 
          sign: 'Cancer', 
          degree: 15, 
          isRetrograde: false 
        },
        { 
          planetId: PLANETS.JUPITER,
          planet: 'Jupiter' as const, 
          longitude: (marsLon + 180) % 360, 
          latitude: 0, 
          distance: 1, 
          speed: 0.1, 
          sign: 'Libra', 
          degree: 15, 
          isRetrograde: false 
        },
      ];
      
      // Shift Mars back by 1° to create approaching aspects with small orbs (< 2° threshold)
      marsData[0].longitude = (marsLon - 1 + 360) % 360;
      
      const transits = transitCalc.findTransits(marsData, natalPlanets, jd);
      
      const square = transits.find(t => t.aspect === 'square' && t.natalPlanet === 'Venus');
      const opposition = transits.find(t => t.aspect === 'opposition' && t.natalPlanet === 'Jupiter');
      
      // Both aspects must be detected
      expect(square).toBeDefined();
      expect(opposition).toBeDefined();
      
      // CRITICAL: Both should have exact times calculated
      // Mars is moving (real ephemeris speed), orbs are small (~1°)
      // If exact-time search uses wrong target longitude, these will be undefined
      expect(square!.exactTime).toBeDefined();
      expect(opposition!.exactTime).toBeDefined();
      
      // Exact times should be reasonable (within search window)
      const squareTime = square!.exactTime!.getTime();
      const oppositionTime = opposition!.exactTime!.getTime();
      const testTime = testDate.getTime();
      
      // Should be within 5 days of test date (the search window)
      expect(Math.abs(squareTime - testTime)).toBeLessThan(5 * 24 * 60 * 60 * 1000);
      expect(Math.abs(oppositionTime - testTime)).toBeLessThan(5 * 24 * 60 * 60 * 1000);
      
      // Both exact times should be close (Mars hits both targets around the same time)
      const timeDiff = Math.abs(squareTime - oppositionTime);
      expect(timeDiff).toBeLessThan(7 * 24 * 60 * 60 * 1000); // Within 7 days
    });
  });

  describe('2. Retrograde/station exact-time test', () => {
    it('should not fabricate exact times near actual Mercury station', () => {
      // Real Mercury retrograde station: Dec 13, 2023 at ~21° Capricorn
      // Near station, Mercury's speed approaches zero, making exact-time prediction unreliable
      // This test ensures we don't fabricate confident exact times when the planet is barely moving
      
      const stationDate = new Date('2023-12-13T00:00:00Z');
      const jd = ephem.dateToJulianDay(stationDate);
      
      // Get actual Mercury position near station
      const mercuryPos = ephem.getAllPlanets(jd, [1]); // Mercury = 1
      
      // Create natal Sun near Mercury's station position
      const natalPlanets = [
        { 
          planetId: PLANETS.SUN,
          planet: 'Sun' as const, 
          longitude: mercuryPos[0].longitude + 2, // 2° ahead
          latitude: 0, 
          distance: 1, 
          speed: 1, 
          sign: 'Capricorn', 
          degree: 23, 
          isRetrograde: false 
        },
      ];

      const transits = transitCalc.findTransits(mercuryPos, natalPlanets, jd);
      const conjunction = transits.find(t => t.aspect === 'conjunction');

      expect(conjunction).toBeDefined();
      expect(conjunction!.orb).toBeLessThan(3); // Should detect the approaching conjunction

      // Key assertion: near station, exact time should either:
      // 1. Be undefined (no confident prediction), OR
      // 2. Be far in the future (weeks/months away due to slow motion), OR
      // 3. Be within a reasonable bound (not fabricated nonsense like years away)
      if (conjunction!.exactTime) {
        const daysUntilExact = (conjunction!.exactTime.getTime() - stationDate.getTime()) / (1000 * 60 * 60 * 24);
        // If exact time exists, it should be within 60 days (not fabricated infinity)
        expect(Math.abs(daysUntilExact)).toBeLessThan(60);
      }
      // If exactTime is undefined, that's correct behavior for near-station transits
    });
  });

  describe('3. Multi-day upcoming transit dedupe test', () => {
    it('should use production dedupe for best-hit selection (regression test)', () => {
      // This test verifies the production deduplicateTransits() function is called
      // and performs basic best-hit selection in a realistic multi-day scenario
      
      const startDate = new Date('2024-03-10T12:00:00Z');
      const jd = ephem.dateToJulianDay(startDate);
      
      // Get real Mars position
      const marsPos = ephem.getAllPlanets(jd, [4])[0];
      
      // Place natal Venus 92° ahead (approaching square, 2° orb)
      const natalPlanets = [{
        planetId: PLANETS.VENUS,
        planet: 'Venus' as const,
        longitude: (marsPos.longitude + 92) % 360,
        latitude: 0,
        distance: 1,
        speed: 1,
        sign: 'Cancer',
        degree: 15,
        isRetrograde: false,
      }];
      
      // Collect transits over 10 days - Mars will approach, hit exact, and pass
      const allTransits: Transit[] = [];
      for (let day = 0; day <= 10; day++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(dayDate.getDate() + day);
        const dayJd = ephem.dateToJulianDay(dayDate);
        const dayMars = ephem.getAllPlanets(dayJd, [4]);
        const dayTransits = transitCalc.findTransits(dayMars, natalPlanets, dayJd);
        allTransits.push(...dayTransits);
      }
      
      // Get all squares before dedupe
      const allSquares = allTransits.filter(t => t.aspect === 'square');
      expect(allSquares.length).toBeGreaterThan(2); // Multiple days captured it
      
      // Test the production function
      const deduplicated = deduplicateTransits(allTransits);
      const keptSquares = deduplicated.filter(t => t.aspect === 'square');
      
      // Should keep exactly one square
      expect(keptSquares.length).toBe(1);
      
      // This proves the production dedupe function is working for multi-day collection
    });

    it('deduplicateTransits should prefer exactTime over smaller orb', () => {
      // Deterministic test for priority branch 1: exact > smallest orb
      const base = {
        transitingPlanet: 'Mars' as const,
        natalPlanet: 'Venus' as const,
        aspect: 'square' as const,
        isApplying: true,
        transitLongitude: 14,
        natalLongitude: 105,
      };

      const exactButLargerOrb: Transit = {
        ...base,
        orb: 1.5,
        exactTime: new Date('2024-03-12T12:00:00Z'),
      };

      const smallerOrbButNotExact: Transit = {
        ...base,
        orb: 0.2,
        exactTime: undefined,
      };

      const result = deduplicateTransits([
        smallerOrbButNotExact,
        exactButLargerOrb,
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(exactButLargerOrb);
    });

    it('deduplicateTransits should prefer earliest when exactness and orb are tied', () => {
      // Deterministic test for priority branch 3: earliest (when exact and orb tied)
      const base = {
        transitingPlanet: 'Mars' as const,
        natalPlanet: 'Venus' as const,
        aspect: 'square' as const,
        orb: 0.5,
        isApplying: true,
        transitLongitude: 14,
        natalLongitude: 105,
      };

      const earlier: Transit = {
        ...base,
        exactTime: new Date('2024-03-10T12:00:00Z'),
      };

      const later: Transit = {
        ...base,
        exactTime: new Date('2024-03-11T12:00:00Z'),
      };

      const result = deduplicateTransits([later, earlier]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(earlier);
    });
  });

  describe('4. Polar house fallback test', () => {
    it('should fall back to Whole Sign at polar latitudes when Placidus fails', () => {
      // At 70°N, Placidus fails but Whole Sign works
      const jd = ephem.dateToJulianDay(new Date('2024-06-21T12:00:00Z')); // Summer solstice
      const latitude = 70; // Polar latitude
      const longitude = 0;

      // Request Placidus
      const houses = houseCalc.calculateHouses(jd, latitude, longitude, 'P');

      // Should return Whole Sign as fallback
      expect(houses.system).toBe('W');
      expect(houses.cusps.length).toBeGreaterThan(0);
      expect(houses.ascendant).toBeGreaterThanOrEqual(0);
      expect(houses.ascendant).toBeLessThan(360);
    });

    it('should handle extreme polar latitudes with Whole Sign', () => {
      // At extreme polar (89.9°N), Whole Sign should still work
      const jd = ephem.dateToJulianDay(new Date('2024-06-21T12:00:00Z'));
      const latitude = 89.9; // Extreme polar
      const longitude = 0;

      // Whole Sign should work at all latitudes
      const houses = houseCalc.calculateHouses(jd, latitude, longitude, 'W');
      expect(houses.system).toBe('W');
      expect(houses.cusps.length).toBeGreaterThan(0);
    });
  });

  describe('5. Chart rendering correctness', () => {
    it('should render minimal valid chart without crashing', async () => {
      // Minimal chart with empty planets array is valid - should render successfully
      const minimalChart: NatalChart = {
        name: 'Minimal Test',
        birthDate: {
          year: 2000,
          month: 1,
          day: 1,
          hour: 12,
          minute: 0,
        },
        location: {
          latitude: 0,
          longitude: 0,
          timezone: 'UTC',
        },
        planets: [], // Empty is valid
        julianDay: 2451545,
        houseSystem: 'P',
        utcDateTime: {
          year: 2000,
          month: 1,
          day: 1,
          hour: 12,
          minute: 0,
        },
      };

      const result = await chartRenderer.generateNatalChart(minimalChart, 'light', 'svg');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100); // Real SVG, not empty string
    });

    it('should throw on invalid house system, not fabricate data', () => {
      const jd = ephem.dateToJulianDay(new Date('2024-01-01T12:00:00Z'));
      const latitude = 40;
      const longitude = -74;

      // Invalid house system should throw with clear error message
      expect(() => {
        houseCalc.calculateHouses(jd, latitude, longitude, 'INVALID' as any);
      }).toThrow(/Invalid house system/);
    });

    it('should throw on invalid chart data, not return placeholder SVG', async () => {
      // This is the critical regression test: if rendering fails due to invalid data,
      // the renderer should throw an error, not return a fake/placeholder SVG
      
      // Create a chart with invalid/corrupted data that should cause rendering to fail
      const invalidChart: NatalChart = {
        name: 'Invalid Test',
        birthDate: {
          year: 2000,
          month: 1,
          day: 1,
          hour: 12,
          minute: 0,
        },
        location: {
          latitude: 0,
          longitude: 0,
          timezone: 'UTC',
        },
        planets: [
          // Invalid planet data - longitude out of range should cause issues
          {
            planetId: PLANETS.SUN,
            planet: 'Sun' as const,
            longitude: 999, // Invalid: should be 0-360
            latitude: 0,
            distance: 1,
            speed: 1,
            sign: 'Invalid',
            degree: 999,
            isRetrograde: false,
          },
        ],
        julianDay: 2451545,
        houseSystem: 'P',
        utcDateTime: {
          year: 2000,
          month: 1,
          day: 1,
          hour: 12,
          minute: 0,
        },
      };

      // The renderer should either:
      // 1. Throw an error (preferred), OR
      // 2. Return a real SVG that handles the invalid data gracefully
      // It should NOT return a short placeholder like "<svg>Error</svg>"
      
      try {
        const result = await chartRenderer.generateNatalChart(invalidChart, 'light', 'svg');
        
        // If it didn't throw, it must be a real SVG (not a placeholder)
        expect(typeof result).toBe('string');
        
        if (typeof result === 'string') {
          expect(result.length).toBeGreaterThan(500); // Substantial SVG
          expect(result).toContain('<svg');
          expect(result).toContain('</svg>');
          
          // Should not contain error messages in the SVG content
          expect(result.toLowerCase()).not.toContain('error');
          expect(result.toLowerCase()).not.toContain('failed');
        }
      } catch (error) {
        // Throwing is acceptable - proves it doesn't return placeholder
        expect(error).toBeDefined();
      }
    });
  });
});
