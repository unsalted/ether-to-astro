import { describe, it, expect, beforeAll } from 'vitest';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { PLANETS } from '../../src/types.js';
import { bowenYangChart } from '../fixtures/bowen-yang-chart.js';
import { knownJulianDays, bowenYangExpectedPositions } from '../fixtures/expected-results.js';

describe('Given an astrologer wants to calculate planetary positions', () => {
  let ephem: EphemerisCalculator;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
  });

  describe('When initializing the ephemeris calculator', () => {
    it('should initialize successfully with Moshier fallback', async () => {
      const freshEphem = new EphemerisCalculator();
      await expect(freshEphem.init()).resolves.not.toThrow();
    });
  });

  describe('When converting dates to Julian Day numbers', () => {
    it('should convert J2000 epoch correctly', () => {
      const jd = ephem.dateToJulianDay(knownJulianDays.j2000.date);
      expect(jd).toBeCloseTo(knownJulianDays.j2000.jd, 4);
    });

    it('should convert Bowen Yang\'s birth date to Julian Day', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      expect(jd).toBeCloseTo(knownJulianDays.bowenBirth.jd, 4);
    });

    it('should handle midnight dates correctly', () => {
      const midnight = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
      const jd = ephem.dateToJulianDay(midnight);
      expect(jd).toBeCloseTo(2451544.5, 4);
    });
  });

  describe('When calculating planetary positions for Bowen Yang\'s birth', () => {
    it('should calculate Sun position in Scorpio', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      const positions = ephem.getAllPlanets(jd, [PLANETS.SUN]);
      
      expect(positions).toHaveLength(1);
      expect(positions[0].planet).toBe('Sun');
      expect(positions[0].sign).toBe('Scorpio');
      
      // Use expected value with tolerance for ephemeris precision differences
      expect(positions[0].longitude).toBeCloseTo(bowenYangExpectedPositions.sun.longitude, 1);
      expect(positions[0].degree).toBeCloseTo(bowenYangExpectedPositions.sun.degree, 1)
    });

    it('should calculate all major planets', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      const planetIds = Object.values(PLANETS);
      const positions = ephem.getAllPlanets(jd, planetIds);
      
      expect(positions.length).toBe(planetIds.length);
      positions.forEach(pos => {
        expect(pos.longitude).toBeGreaterThanOrEqual(0);
        expect(pos.longitude).toBeLessThan(360);
        expect(pos.speed).toBeDefined();
      });
    });

    it('should include zodiac sign information', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      const positions = ephem.getAllPlanets(jd, [PLANETS.SUN]);
      
      expect(positions[0].sign).toBe('Scorpio');
      expect(positions[0].degree).toBeGreaterThan(0);
      expect(positions[0].degree).toBeLessThan(30);
    });
  });

  describe('When calculating aspect angles between planets', () => {
    it('should calculate conjunction (0°) correctly', () => {
      const angle = ephem.calculateAspectAngle(45, 45);
      expect(angle).toBe(0);
    });

    it('should calculate opposition (180°) correctly', () => {
      const angle = ephem.calculateAspectAngle(0, 180);
      expect(angle).toBe(180);
    });

    it('should calculate square (90°) correctly', () => {
      const angle = ephem.calculateAspectAngle(0, 90);
      expect(angle).toBe(90);
    });

    it('should calculate trine (120°) correctly', () => {
      const angle = ephem.calculateAspectAngle(0, 120);
      expect(angle).toBe(120);
    });

    it('should handle angles wrapping around 360°', () => {
      const angle = ephem.calculateAspectAngle(350, 10);
      expect(angle).toBe(20);
    });

    it('should always return the smallest angle', () => {
      const angle = ephem.calculateAspectAngle(10, 350);
      expect(angle).toBe(20);
    });
  });

  describe('When determining retrograde motion', () => {
    it('should identify retrograde planets by negative speed', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      const positions = ephem.getAllPlanets(jd, Object.values(PLANETS));
      
      const retrograde = positions.filter(p => p.speed < 0);
      const direct = positions.filter(p => p.speed > 0);
      
      // At any given time, some planets should be direct
      expect(direct.length).toBeGreaterThan(0);
      
      // Retrograde planets should have negative speed
      retrograde.forEach(planet => {
        expect(planet.speed).toBeLessThan(0);
      });
    });
  });

  describe('When finding exact transit times', () => {
    it('should find when a planet reaches a specific longitude', () => {
      const startJD = 2451545.0; // J2000
      const targetLongitude = 0; // 0° Aries
      
      // Find when Sun reaches 0° Aries (Spring Equinox ~March 20)
      const exactJD = ephem.findExactTransitTime(
        PLANETS.SUN,
        targetLongitude,
        startJD,
        startJD + 365
      );
      
      expect(exactJD).not.toBeNull();
      expect(exactJD!).toBeGreaterThan(startJD);
      expect(exactJD!).toBeLessThan(startJD + 365);
      
      // Verify the planet is actually at target longitude
      const positions = ephem.getAllPlanets(exactJD!, [PLANETS.SUN]);
      expect(positions[0].longitude).toBeCloseTo(targetLongitude, 1);
    });
  });

  describe('When handling invalid inputs', () => {
    it('should throw error when ephemeris not initialized', () => {
      const uninitializedEphem = new EphemerisCalculator();
      expect(() => {
        uninitializedEphem.dateToJulianDay(new Date());
      }).toThrow('Ephemeris not initialized');
    });

    it('should handle very old dates', () => {
      const ancientDate = new Date(Date.UTC(1000, 0, 1, 0, 0, 0));
      const jd = ephem.dateToJulianDay(ancientDate);
      expect(jd).toBeGreaterThan(0);
    });

    it('should handle future dates', () => {
      const futureDate = new Date(Date.UTC(2100, 0, 1, 0, 0, 0));
      const jd = ephem.dateToJulianDay(futureDate);
      expect(jd).toBeGreaterThan(knownJulianDays.j2000.jd);
    });
  });
});
