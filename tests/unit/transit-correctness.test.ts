import { describe, it, expect, beforeAll } from 'vitest';
import { TransitCalculator } from '../../src/transits.js';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { PLANETS, type PlanetPosition } from '../../src/types.js';

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
      const currentDate = new Date(Date.UTC(2024, 2, 26, 12, 0));
      const currentJD = ephem.dateToJulianDay(currentDate);
      const mars = ephem.getAllPlanets(currentJD, [PLANETS.MARS])[0];
      const natalPlanets: PlanetPosition[] = [
        { ...mars, planetId: PLANETS.VENUS, planet: 'Venus', longitude: (mars.longitude + 90) % 360 },
      ];
      const transits = transitCalc.findTransits([mars], natalPlanets, currentJD);
      const squares = transits.filter(t => t.aspect === 'square');
      expect(squares.length).toBeGreaterThan(0);
      expect(squares[0].aspect).toBe('square');
      expect(squares[0].orb).toBeLessThanOrEqual(7);
    });

    it('should search both target longitudes for trine', () => {
      const currentDate = new Date(Date.UTC(2024, 2, 26, 12, 0));
      const currentJD = ephem.dateToJulianDay(currentDate);
      const jupiter = ephem.getAllPlanets(currentJD, [PLANETS.JUPITER])[0];
      const natalPlanets: PlanetPosition[] = [
        { ...jupiter, planetId: PLANETS.SUN, planet: 'Sun', longitude: (jupiter.longitude + 120) % 360 },
      ];
      const transits = transitCalc.findTransits([jupiter], natalPlanets, currentJD);
      const trines = transits.filter(t => t.aspect === 'trine');
      expect(trines.length).toBeGreaterThan(0);
      expect(trines[0].aspect).toBe('trine');
      expect(trines[0].orb).toBeLessThanOrEqual(7);
    });
  });

  describe('Dynamic search window for slow movers', () => {
    it('should use wider search window for slow-moving planets', () => {
      // This is tested by checking if slow-mover exact times are found
      const currentDate = new Date(Date.UTC(2024, 2, 26, 12, 0));
      const currentJD = ephem.dateToJulianDay(currentDate);
      const saturn = ephem.getAllPlanets(currentJD, [PLANETS.SATURN])[0];
      const natalPlanets: PlanetPosition[] = [
        { ...saturn, planetId: PLANETS.SUN, planet: 'Sun', longitude: (saturn.longitude + 1) % 360 },
      ];

      const transits = transitCalc.findTransits([saturn], natalPlanets, currentJD);
      const closeTransits = transits.filter(t => t.orb < 2);
      expect(closeTransits.length).toBeGreaterThan(0);
      closeTransits.forEach((t) => {
        expect(t.exactTimeStatus).toBeDefined();
      });
    });
  });

  describe('Unknown planet handling', () => {
    it('should return valid transit objects for supported non-classical bodies', () => {
      const currentDate = new Date(Date.UTC(2024, 2, 26, 12, 0));
      const currentJD = ephem.dateToJulianDay(currentDate);
      const chiron = ephem.getAllPlanets(currentJD, [PLANETS.CHIRON])[0];
      const natalPlanets: PlanetPosition[] = [
        { ...chiron, planetId: PLANETS.SUN, planet: 'Sun', longitude: chiron.longitude },
      ];
      const transits = transitCalc.findTransits([chiron], natalPlanets, currentJD);
      expect(transits.length).toBeGreaterThan(0);
      expect(transits[0].transitingPlanet).toBe('Chiron');
    });
  });
});
