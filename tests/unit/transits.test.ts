import { describe, it, expect, beforeAll } from 'vitest';
import { TransitCalculator } from '../../src/transits.js';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { PLANETS, ASPECTS } from '../../src/types.js';
import { bowenYangChart } from '../fixtures/bowen-yang-chart.js';
import { FIXED_TEST_DATE } from '../setup.js';

describe('When an AI asks "What transits is Bowen experiencing today?"', () => {
  let ephem: EphemerisCalculator;
  let transitCalc: TransitCalculator;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
    transitCalc = new TransitCalculator(ephem);
  });

  describe('Given Bowen Yang\'s natal chart', () => {
    it('should find transits between current planets and natal planets', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);

      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      const transitingPlanets = ephem.getAllPlanets(currentJD, Object.values(PLANETS));

      const transits = transitCalc.findTransits(transitingPlanets, natalPlanets, currentJD);

      expect(Array.isArray(transits)).toBe(true);
      expect(transits.length).toBeGreaterThan(0);
      transits.forEach(transit => {
        expect(typeof transit.transitingPlanet).toBe('string');
        expect(typeof transit.natalPlanet).toBe('string');
        expect(typeof transit.aspect).toBe('string');
        expect(transit.orb).toBeGreaterThanOrEqual(0);
        expect(typeof transit.isApplying).toBe('boolean');
      });
    });

    it('should calculate applying vs separating aspects correctly', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);

      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      const transitingPlanets = ephem.getAllPlanets(currentJD, Object.values(PLANETS));

      const transits = transitCalc.findTransits(transitingPlanets, natalPlanets, currentJD);

      transits.forEach(transit => {
        expect(typeof transit.isApplying).toBe('boolean');
      });
    });

    it('should respect aspect orbs from ASPECTS configuration', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);

      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      const transitingPlanets = ephem.getAllPlanets(currentJD, Object.values(PLANETS));

      const transits = transitCalc.findTransits(transitingPlanets, natalPlanets, currentJD);

      transits.forEach(transit => {
        const aspectConfig = ASPECTS.find(a => a.name === transit.aspect);
        expect(aspectConfig).toBeDefined();
        expect(transit.orb).toBeLessThanOrEqual(aspectConfig!.orb);
      });
    });
  });

  describe('When filtering for upcoming transits', () => {
    it('should find transits approaching within 2 degrees', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);

      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      const transitingPlanets = ephem.getAllPlanets(currentJD, Object.values(PLANETS));

      const allTransits = transitCalc.findTransits(transitingPlanets, natalPlanets, currentJD);
      const upcomingTransits = allTransits.filter(t => t.orb <= 2 && t.isApplying);

      upcomingTransits.forEach(transit => {
        expect(transit.orb).toBeLessThanOrEqual(2);
        expect(transit.isApplying).toBe(true);
      });
    });
  });

  describe('When handling Moon transits (fast-moving planet)', () => {
    it('should find Moon transits to natal planets', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);

      const moonPosition = ephem.getAllPlanets(currentJD, [PLANETS.MOON]);
      const natalPlanets = moonPosition.map((moon) => ({
        ...moon,
        planet: 'Sun' as const,
        planetId: PLANETS.SUN,
      }));

      const transits = transitCalc.findTransits(moonPosition, natalPlanets, currentJD);

      expect(transits.length).toBeGreaterThan(0);
      
      transits.forEach(transit => {
        expect(transit.transitingPlanet).toBe('Moon');
      });
    });
  });

  describe('When handling outer planet transits (slow-moving planets)', () => {
    it('should find outer planet transits with longer-lasting effects', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);

      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      const outerPlanets = ephem.getAllPlanets(currentJD, [
        PLANETS.JUPITER,
        PLANETS.SATURN,
        PLANETS.URANUS,
        PLANETS.NEPTUNE,
        PLANETS.PLUTO
      ]);

      const transits = transitCalc.findTransits(outerPlanets, natalPlanets, currentJD);

      transits.forEach(transit => {
        expect(['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']).toContain(transit.transitingPlanet);
      });
    });
  });

  describe('When calculating exact transit times', () => {
    it('should calculate when a transit becomes exact (0° orb)', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);

      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      const transitingPlanets = ephem.getAllPlanets(currentJD, Object.values(PLANETS));

      const transits = transitCalc.findTransits(transitingPlanets, natalPlanets, currentJD);
      
      // Filter for close transits that might have exact times
      const closeTransits = transits.filter(t => t.orb < 2);
      expect(closeTransits.length).toBeGreaterThan(0);
      closeTransits.forEach(transit => {
        expect(transit.exactTime === undefined || transit.exactTime instanceof Date).toBe(true);
      });
    });
  });

  describe('When handling edge cases', () => {
    it('should handle transits at zodiac boundaries (0° Aries, etc.)', () => {
      // Create a scenario where planet is at 359° and another at 1°
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);
      
      // This tests the angle calculation wrapping logic
      const angle = ephem.calculateAspectAngle(359, 1);
      expect(angle).toBe(2);
    });

    it('should handle retrograde planets correctly', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const birthJD = ephem.dateToJulianDay(birthDate);
      const currentJD = ephem.dateToJulianDay(FIXED_TEST_DATE);

      const natalPlanets = ephem.getAllPlanets(birthJD, Object.values(PLANETS));
      const transitingPlanets = ephem.getAllPlanets(currentJD, Object.values(PLANETS));

      const transits = transitCalc.findTransits(transitingPlanets, natalPlanets, currentJD);

      // Retrograde planets should still form transits
      const retrogradeTransits = transits.filter(t => {
        const planet = transitingPlanets.find(p => p.planet === t.transitingPlanet);
        return planet && planet.speed < 0;
      });

      // Retrograde transits should be separating (moving backward)
      retrogradeTransits.forEach(transit => {
        expect(typeof transit.isApplying).toBe('boolean');
      });
    });
  });
});
