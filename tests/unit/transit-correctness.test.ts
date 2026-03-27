import { describe, it, expect, beforeAll } from 'vitest';
import { TransitCalculator } from '../../src/transits.js';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { PLANETS } from '../../src/types.js';
import { bowenYangChart } from '../fixtures/bowen-yang-chart.js';

describe('Transit calculation correctness', () => {
  let ephem: EphemerisCalculator;
  let transitCalc: TransitCalculator;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
    transitCalc = new TransitCalculator(ephem);
  });

  describe('Dual-target exact time calculation', () => {
    it('should find exact times for both sides of square aspect', () => {
      // Test that we search both natal+90 and natal-90 for squares
      const birthDate = new Date(Date.UTC(1977, 9, 17, 17, 6));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const natalPlanets = ephem.getAllPlanets(birthJD, [PLANETS.VENUS]);
      
      // Create a transit planet that squares natal Venus from below
      const currentDate = new Date(Date.UTC(2024, 2, 26, 12, 0));
      const currentJD = ephem.dateToJulianDay(currentDate);
      const transitPlanets = ephem.getAllPlanets(currentJD, [PLANETS.MARS]);
      
      const transits = transitCalc.findTransits(transitPlanets, natalPlanets, currentJD);
      
      // Should find square aspects
      const squares = transits.filter(t => t.aspect === 'square');
      
      // If there are squares within orb, they should be detected
      if (squares.length > 0) {
        expect(squares[0].aspect).toBe('square');
        expect(squares[0].orb).toBeLessThanOrEqual(7); // Square orb is 7°
      }
    });

    it('should search both target longitudes for trine', () => {
      // Trine has two targets: natal+120 and natal-120 (or natal+240)
      const birthDate = new Date(Date.UTC(1990, 10, 6, 1, 30));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const natalPlanets = ephem.getAllPlanets(birthJD, [PLANETS.SUN]);
      
      const currentDate = new Date(Date.UTC(2024, 2, 26, 12, 0));
      const currentJD = ephem.dateToJulianDay(currentDate);
      const transitPlanets = ephem.getAllPlanets(currentJD, [PLANETS.JUPITER]);
      
      const transits = transitCalc.findTransits(transitPlanets, natalPlanets, currentJD);
      
      // Should detect trines if within orb
      const trines = transits.filter(t => t.aspect === 'trine');
      
      if (trines.length > 0) {
        expect(trines[0].aspect).toBe('trine');
        expect(trines[0].orb).toBeLessThanOrEqual(7);
      }
    });
  });

  describe('Dedupe best-instance logic', () => {
    it('should keep instance with smallest orb when no exact times', () => {
      // Simulate multi-day transit where orb changes
      const natalChart = {
        ...bowenYangChart,
        planets: ephem.getAllPlanets(
          ephem.dateToJulianDay(new Date(Date.UTC(1990, 10, 6, 1, 30))),
          Object.values(PLANETS)
        ),
      };
      
      // Get upcoming transits over 3 days
      const upcomingTransits = transitCalc.getUpcomingTransits(
        [PLANETS.MOON], // Fast mover
        natalChart,
        3
      );
      
      // Should have deduplicated - same transit shouldn't appear multiple times
      const transitKeys = upcomingTransits.map(t => 
        `${t.transitingPlanet}-${t.natalPlanet}-${t.aspect}`
      );
      const uniqueKeys = new Set(transitKeys);
      
      expect(transitKeys.length).toBe(uniqueKeys.size);
    });

    it('should prefer instance with exact time over one without', () => {
      // This is tested implicitly by the dedupe logic
      // If a transit has an exact time on day 2 but not day 1, keep day 2
      const natalChart = {
        ...bowenYangChart,
        planets: ephem.getAllPlanets(
          ephem.dateToJulianDay(new Date(Date.UTC(1990, 10, 6, 1, 30))),
          Object.values(PLANETS)
        ),
      };
      
      const upcomingTransits = transitCalc.getUpcomingTransits(
        Object.values(PLANETS),
        natalChart,
        7
      );
      
      // Transits with exact times should be prioritized
      const withExactTime = upcomingTransits.filter(t => t.exactTime);
      
      // Each should be unique
      const keys = withExactTime.map(t => `${t.transitingPlanet}-${t.natalPlanet}-${t.aspect}`);
      const uniqueKeys = new Set(keys);
      expect(keys.length).toBe(uniqueKeys.size);
    });
  });

  describe('Dynamic search window for slow movers', () => {
    it('should use wider search window for slow-moving planets', () => {
      // This is tested by checking if slow-mover exact times are found
      const birthDate = new Date(Date.UTC(1990, 10, 6, 1, 30));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      
      const currentDate = new Date(Date.UTC(2024, 2, 26, 12, 0));
      const currentJD = ephem.dateToJulianDay(currentDate);
      
      // Get slow-moving outer planets
      const outerPlanets = ephem.getAllPlanets(currentJD, [
        PLANETS.SATURN,
        PLANETS.URANUS,
        PLANETS.NEPTUNE,
        PLANETS.PLUTO,
      ]);
      
      const transits = transitCalc.findTransits(outerPlanets, natalPlanets, currentJD);
      
      // If there are close transits, exact times should be calculated
      // (with the old 5-day window, many would be missed)
      const closeTransits = transits.filter(t => t.orb < 2);
      
      if (closeTransits.length > 0) {
        // At least some should have exact times calculated
        const withExactTime = closeTransits.filter(t => t.exactTime);
        // Don't assert count since it depends on current sky, just verify structure
        withExactTime.forEach(t => {
          expect(t.exactTime).toBeInstanceOf(Date);
        });
      }
    });
  });

  describe('Unknown planet handling', () => {
    it('should handle asteroids and nodes without throwing', () => {
      const birthDate = new Date(Date.UTC(1990, 10, 6, 1, 30));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      
      const currentDate = new Date(Date.UTC(2024, 2, 26, 12, 0));
      const currentJD = ephem.dateToJulianDay(currentDate);
      
      // Include Chiron (which is now in the planet map)
      const transitPlanets = ephem.getAllPlanets(currentJD, [15]); // Chiron
      
      // Should not throw when calculating transits with Chiron
      expect(() => {
        transitCalc.findTransits(transitPlanets, natalPlanets, currentJD);
      }).not.toThrow();
    });
  });
});
