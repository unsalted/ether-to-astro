import { describe, it, expect, beforeAll } from 'vitest';
import { HouseCalculator } from '../../src/houses.js';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { bowenYangChart, polarChart } from '../fixtures/bowen-yang-chart.js';

describe('When calculating house cusps for a natal chart', () => {
  let ephem: EphemerisCalculator;
  let houseCalc: HouseCalculator;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
    houseCalc = new HouseCalculator(ephem);
  });

  describe('Given Bowen Yang\'s birth data in Brisbane', () => {
    it('should calculate Placidus houses', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      
      const houses = houseCalc.calculateHouses(
        jd,
        bowenYangChart.location.latitude,
        bowenYangChart.location.longitude,
        'P'
      );
      
      expect(houses.cusps).toHaveLength(13); // 12 houses + duplicate of 1st
      expect(houses.ascendant).toBeGreaterThanOrEqual(0);
      expect(houses.ascendant).toBeLessThan(360);
      expect(houses.mc).toBeGreaterThanOrEqual(0);
      expect(houses.mc).toBeLessThan(360);
    });

    it('should calculate Koch house system', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      
      const houses = houseCalc.calculateHouses(
        jd,
        bowenYangChart.location.latitude,
        bowenYangChart.location.longitude,
        'K'
      );
      
      expect(houses.cusps).toHaveLength(13);
      expect(houses.ascendant).toBeDefined();
      expect(houses.mc).toBeDefined();
    });

    it('should calculate Whole Sign houses', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      
      const houses = houseCalc.calculateHouses(
        jd,
        bowenYangChart.location.latitude,
        bowenYangChart.location.longitude,
        'W'
      );
      
      expect(houses.cusps).toHaveLength(13);
      
      // Whole sign houses should be 30° apart
      for (let i = 1; i < 12; i++) {
        const diff = (houses.cusps[i + 1] - houses.cusps[i] + 360) % 360;
        expect(diff).toBeCloseTo(30, 0);
      }
    });

    it('should calculate Equal houses', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      
      const houses = houseCalc.calculateHouses(
        jd,
        bowenYangChart.location.latitude,
        bowenYangChart.location.longitude,
        'E'
      );
      
      expect(houses.cusps).toHaveLength(13);
      
      // Equal houses should be exactly 30° apart
      for (let i = 1; i < 12; i++) {
        const diff = (houses.cusps[i + 1] - houses.cusps[i] + 360) % 360;
        expect(diff).toBeCloseTo(30, 0);
      }
    });

    it('should determine Ascendant correctly', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      
      const houses = houseCalc.calculateHouses(
        jd,
        bowenYangChart.location.latitude,
        bowenYangChart.location.longitude,
        'P'
      );
      
      // Ascendant should equal the 1st house cusp
      expect(houses.ascendant).toBeCloseTo(houses.cusps[1], 1);
    });

    it('should determine Midheaven (MC) correctly', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      
      const houses = houseCalc.calculateHouses(
        jd,
        bowenYangChart.location.latitude,
        bowenYangChart.location.longitude,
        'P'
      );
      
      // MC should equal the 10th house cusp
      expect(houses.mc).toBeCloseTo(houses.cusps[10], 1);
    });
  });

  describe('When handling edge cases', () => {
    it('should handle polar latitudes', () => {
      const birthDate = new Date(Date.UTC(
        polarChart.birthDate.year,
        polarChart.birthDate.month - 1,
        polarChart.birthDate.day,
        polarChart.birthDate.hour,
        polarChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      
      // Polar regions can have issues with some house systems
      // Should not throw, but may have unusual values
      expect(() => {
        houseCalc.calculateHouses(
          jd,
          polarChart.location.latitude,
          polarChart.location.longitude,
          'P'
        );
      }).not.toThrow();
    });

    it('should handle southern hemisphere correctly', () => {
      const birthDate = new Date(Date.UTC(
        bowenYangChart.birthDate.year,
        bowenYangChart.birthDate.month - 1,
        bowenYangChart.birthDate.day,
        bowenYangChart.birthDate.hour,
        bowenYangChart.birthDate.minute
      ));
      const jd = ephem.dateToJulianDay(birthDate);
      
      // Brisbane is in southern hemisphere (negative latitude)
      expect(bowenYangChart.location.latitude).toBeLessThan(0);
      
      const houses = houseCalc.calculateHouses(
        jd,
        bowenYangChart.location.latitude,
        bowenYangChart.location.longitude,
        'P'
      );
      
      expect(houses.cusps).toHaveLength(13);
      expect(houses.ascendant).toBeGreaterThanOrEqual(0);
    });
  });
});
