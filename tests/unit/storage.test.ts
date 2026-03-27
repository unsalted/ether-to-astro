import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { ChartStorage } from '../../src/storage.js';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { bowenYangChart } from '../fixtures/bowen-yang-chart.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('When an astrologer wants to store a natal chart', () => {
  let ephem: EphemerisCalculator;
  let storage: ChartStorage;
  const testStoragePath = join(process.cwd(), 'test-natal-chart.json');

  beforeAll(async () => {
    // Set test storage path BEFORE creating storage instance
    process.env.NATAL_CHART_PATH = testStoragePath;
    
    ephem = new EphemerisCalculator();
    await ephem.init();
    storage = new ChartStorage(ephem);
  });

  beforeEach(() => {
    // Clean up test file before each test
    if (existsSync(testStoragePath)) {
      unlinkSync(testStoragePath);
    }
  });

  afterEach(() => {
    // Clean up test file after each test
    if (existsSync(testStoragePath)) {
      unlinkSync(testStoragePath);
    }
  });

  describe('Given Bowen Yang\'s birth information', () => {
    it('should save natal chart to JSON file', async () => {
      await storage.saveNatalChart(bowenYangChart);
      
      expect(existsSync(testStoragePath)).toBe(true);
    });

    it('should calculate and store natal planet positions', async () => {
      await storage.saveNatalChart(bowenYangChart);
      
      const loaded = await storage.loadNatalChart();
      
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe(bowenYangChart.name);
      expect(loaded!.planets).toBeDefined();
      expect(loaded!.planets!.length).toBeGreaterThan(0);
      
      // Verify Sun is in Scorpio
      const sun = loaded!.planets!.find(p => p.planet === 'Sun');
      expect(sun).toBeDefined();
      expect(sun!.sign).toBe('Scorpio');
    });

    it('should preserve birth date and location information', async () => {
      await storage.saveNatalChart(bowenYangChart);
      
      const loaded = await storage.loadNatalChart();
      
      expect(loaded).not.toBeNull();
      expect(loaded!.birthDate).toEqual(bowenYangChart.birthDate);
      expect(loaded!.location).toEqual(bowenYangChart.location);
    });
  });

  describe('When loading a natal chart', () => {
    it('should load natal chart from JSON file', async () => {
      await storage.saveNatalChart(bowenYangChart);
      
      const loaded = await storage.loadNatalChart();
      
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe('Bowen Yang');
    });

    it('should return null when chart file does not exist', async () => {
      const loaded = await storage.loadNatalChart();
      
      expect(loaded).toBeNull();
    });
  });

  describe('When checking if natal chart exists', () => {
    it('should return true when chart exists', async () => {
      await storage.saveNatalChart(bowenYangChart);
      
      const exists = await storage.hasNatalChart();
      
      expect(exists).toBe(true);
    });

    it('should return false when chart does not exist', async () => {
      const exists = await storage.hasNatalChart();
      
      expect(exists).toBe(false);
    });
  });

  describe('When handling multiple save operations', () => {
    it('should overwrite existing chart with new data', async () => {
      await storage.saveNatalChart(bowenYangChart);
      
      const modifiedChart = {
        ...bowenYangChart,
        name: 'Modified Name'
      };
      
      await storage.saveNatalChart(modifiedChart);
      
      const loaded = await storage.loadNatalChart();
      expect(loaded!.name).toBe('Modified Name');
    });
  });
});
