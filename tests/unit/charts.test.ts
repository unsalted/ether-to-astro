import { describe, it, expect, beforeAll } from 'vitest';
import { ChartRenderer } from '../../src/charts.js';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { HouseCalculator } from '../../src/houses.js';
import { bowenYangChart } from '../fixtures/bowen-yang-chart.js';

describe('When an AI requests "Generate a chart for Bowen"', () => {
  let ephem: EphemerisCalculator;
  let houseCalc: HouseCalculator;
  let chartRenderer: ChartRenderer;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
    houseCalc = new HouseCalculator(ephem);
    chartRenderer = new ChartRenderer(ephem, houseCalc);
  });

  describe('Given a request for SVG natal chart', () => {
    it('should generate SVG natal chart', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'svg');
      
      expect(typeof result).toBe('string');
      expect(result).toContain('<svg');
      expect(result).toContain('</svg>');
    });

    it('should include zodiac signs in SVG', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'svg');
      
      expect(result).toContain('astrology-radix-signs');
    });

    it('should include planet symbols in SVG', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'svg');
      
      expect(result).toContain('astrology');
    });
  });

  describe('When generating PNG natal chart', () => {
    it('should generate PNG buffer', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'png');
      
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as Buffer).length).toBeGreaterThan(0);
    });
  });

  describe('When generating WebP natal chart', () => {
    it('should generate WebP buffer', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'webp');
      
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as Buffer).length).toBeGreaterThan(0);
    });
  });

  describe('When applying light theme', () => {
    it('should use white background for light theme', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'svg');
      
      expect(result).toContain('#ffffff');
    });

    it('should apply light theme zodiac colors', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'svg');
      
      // Should contain custom light colors
      expect(result).toContain('#ffffff'); // White
      expect(result).toContain('#c1e6d1'); // Mint
    });
  });

  describe('When applying dark theme', () => {
    it('should use dark background for dark theme', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'dark', 'svg');
      
      expect(result).toContain('#282c34');
    });

    it('should apply dark theme zodiac colors', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'dark', 'svg');
      
      // Should contain custom dark colors
      expect(result).toContain('#282c34'); // Dark gray
      expect(result).toContain('#8545b0'); // Purple
    });
  });

  describe('When rendering aspect lines', () => {
    it('should include aspect lines in chart', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'svg');
      
      expect(result).toContain('aspects');
    });

    it('should render squares, trines, oppositions, and sextiles', async () => {
      const result = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'svg');
      
      // Aspect group should be present
      expect(result).toContain('astrology-aspects');
    });
  });

  describe('When generating transit chart overlay', () => {
    it('should generate transit chart with current date', async () => {
      const result = await chartRenderer.generateTransitChart(bowenYangChart, undefined, 'light', 'svg');
      
      expect(typeof result).toBe('string');
      expect(result).toContain('<svg');
    });

    it('should generate transit chart for specific date', async () => {
      const transitDate = new Date('2024-01-01');
      const result = await chartRenderer.generateTransitChart(bowenYangChart, transitDate, 'light', 'svg');
      
      expect(typeof result).toBe('string');
      expect(result).toContain('<svg');
    });

    it('should overlay transits on natal chart', async () => {
      const result = await chartRenderer.generateTransitChart(bowenYangChart, undefined, 'light', 'svg');
      
      // Should contain both natal and transit data
      expect(result).toContain('radix');
    });
  });

  describe('When handling different image formats', () => {
    it('should convert SVG to PNG with correct background', async () => {
      const pngResult = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'png');
      
      expect(Buffer.isBuffer(pngResult)).toBe(true);
    });

    it('should convert SVG to WebP with correct background', async () => {
      const webpResult = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'webp');
      
      expect(Buffer.isBuffer(webpResult)).toBe(true);
    });

    it('should use theme-appropriate background in PNG conversion', async () => {
      const lightPng = await chartRenderer.generateNatalChart(bowenYangChart, 'light', 'png');
      const darkPng = await chartRenderer.generateNatalChart(bowenYangChart, 'dark', 'png');
      
      expect(Buffer.isBuffer(lightPng)).toBe(true);
      expect(Buffer.isBuffer(darkPng)).toBe(true);
      
      // Dark and light should produce different results
      expect(Buffer.isBuffer(lightPng) && Buffer.isBuffer(darkPng)).toBe(true);
      if (Buffer.isBuffer(lightPng) && Buffer.isBuffer(darkPng)) {
        expect(lightPng.equals(darkPng)).toBe(false);
      }
    });
  });
});
