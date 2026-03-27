import { describe, it, expect, beforeAll } from 'vitest';
import { HouseCalculator } from '../../src/houses.js';
import { EphemerisCalculator } from '../../src/ephemeris.js';

describe('House system validation and fallback', () => {
  let ephem: EphemerisCalculator;
  let houseCalc: HouseCalculator;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
    houseCalc = new HouseCalculator(ephem);
  });

  const testJD = 2460000; // Arbitrary test date
  const normalLat = 40.7509; // Beaver Falls, PA
  const normalLon = -80.3198;
  const polarLat = 78.2232; // Svalbard, Norway
  const polarLon = 15.6267;

  describe('Input validation', () => {
    it('should reject empty house system', () => {
      expect(() => houseCalc.calculateHouses(testJD, normalLat, normalLon, '')).toThrow('Invalid house system');
    });

    it('should reject multi-character system', () => {
      expect(() => houseCalc.calculateHouses(testJD, normalLat, normalLon, 'Placidus')).toThrow('Invalid house system');
    });

    it('should reject whitespace-only system', () => {
      expect(() => houseCalc.calculateHouses(testJD, normalLat, normalLon, '   ')).toThrow('Invalid house system');
    });

    it('should normalize lowercase to uppercase', () => {
      const result = houseCalc.calculateHouses(testJD, normalLat, normalLon, 'p');
      expect(result.system).toBe('P');
    });

    it('should handle whitespace around valid system', () => {
      const result = houseCalc.calculateHouses(testJD, normalLat, normalLon, ' W ');
      expect(result.system).toBe('W');
    });

    it('should reject unsupported system', () => {
      expect(() => houseCalc.calculateHouses(testJD, normalLat, normalLon, 'Z')).toThrow('Unsupported house system');
    });

    it('should accept all valid systems', () => {
      const validSystems = ['P', 'K', 'W', 'E', 'O', 'R', 'C', 'A', 'V', 'X', 'H', 'T', 'B'];
      
      for (const system of validSystems) {
        expect(() => houseCalc.calculateHouses(testJD, normalLat, normalLon, system)).not.toThrow();
      }
    });
  });

  describe('Polar latitude fallback', () => {
    it('should fallback to Whole Sign for polar Placidus failure', () => {
      // Svalbard - Placidus should fail and fallback to Whole Sign
      const result = houseCalc.calculateHouses(testJD, polarLat, polarLon, 'P');
      
      // Should have fallen back to Whole Sign
      expect(result.system).toBe('W');
      
      // Should return real data, not fake
      expect(result.ascendant).not.toBe(0);
      expect(result.mc).not.toBe(90);
      expect(result.cusps.some(c => c !== 0)).toBe(true);
    });

    it('should return requested system if it succeeds at normal latitude', () => {
      const result = houseCalc.calculateHouses(testJD, normalLat, normalLon, 'P');
      
      // Placidus should succeed at normal latitude
      expect(result.system).toBe('P');
    });

    it('should not fallback if Whole Sign requested at polar latitude', () => {
      const result = houseCalc.calculateHouses(testJD, polarLat, polarLon, 'W');
      
      // Should use Whole Sign as requested (no fallback needed)
      expect(result.system).toBe('W');
    });

    it('should return valid ascendant and MC values', () => {
      const result = houseCalc.calculateHouses(testJD, polarLat, polarLon, 'P');
      
      // Ascendant and MC should be valid degrees (0-360)
      expect(result.ascendant).toBeGreaterThanOrEqual(0);
      expect(result.ascendant).toBeLessThan(360);
      expect(result.mc).toBeGreaterThanOrEqual(0);
      expect(result.mc).toBeLessThan(360);
    });
  });

  describe('Cusp array format', () => {
    it('should preserve Swiss Ephemeris 1-based indexing', () => {
      const result = houseCalc.calculateHouses(testJD, normalLat, normalLon, 'P');
      
      // Should have 13 elements: [0..12]
      expect(result.cusps).toHaveLength(13);
      
      // Index 0 exists (unused by convention)
      expect(result.cusps[0]).toBeDefined();
      
      // Houses 1-12 are at indices 1-12
      expect(result.cusps[1]).toBeDefined(); // 1st house
      expect(result.cusps[12]).toBeDefined(); // 12th house
    });

    it('should have valid cusp values', () => {
      const result = houseCalc.calculateHouses(testJD, normalLat, normalLon, 'P');
      
      // All cusps should be valid degrees
      for (let i = 1; i <= 12; i++) {
        expect(result.cusps[i]).toBeGreaterThanOrEqual(0);
        expect(result.cusps[i]).toBeLessThan(360);
      }
    });
  });

  describe('System-specific behavior', () => {
    it('should calculate Whole Sign houses with 30deg spacing', () => {
      const result = houseCalc.calculateHouses(testJD, normalLat, normalLon, 'W');
      
      expect(result.system).toBe('W');
      
      // Whole Sign houses should be exactly 30° apart
      for (let i = 1; i < 12; i++) {
        const diff = (result.cusps[i + 1] - result.cusps[i] + 360) % 360;
        expect(diff).toBeCloseTo(30, 0);
      }
    });

    it('should calculate Equal houses with 30deg spacing', () => {
      const result = houseCalc.calculateHouses(testJD, normalLat, normalLon, 'E');
      
      expect(result.system).toBe('E');
      
      // Equal houses should be exactly 30° apart
      for (let i = 1; i < 12; i++) {
        const diff = (result.cusps[i + 1] - result.cusps[i] + 360) % 360;
        expect(diff).toBeCloseTo(30, 0);
      }
    });

    it('should calculate Placidus houses with varying spacing', () => {
      const result = houseCalc.calculateHouses(testJD, normalLat, normalLon, 'P');
      
      expect(result.system).toBe('P');
      
      // Placidus houses are NOT equal - should have variation
      const spacings = [];
      for (let i = 1; i < 12; i++) {
        const diff = (result.cusps[i + 1] - result.cusps[i] + 360) % 360;
        spacings.push(diff);
      }
      
      // Should have some variation (not all exactly 30°)
      const allEqual = spacings.every(s => Math.abs(s - 30) < 0.1);
      expect(allEqual).toBe(false);
    });
  });
});
