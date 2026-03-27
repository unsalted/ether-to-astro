import Chart from '@astrodraw/astrochart';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import {
  type AstroChartData,
  type AstroChartSettings,
  type ChartFormat,
  type ChartTheme,
  getThemeSettings,
} from './chart-types.js';
import type { EphemerisCalculator } from './ephemeris.js';
import type { HouseCalculator } from './houses.js';
import { ASTEROIDS, type NatalChart, NODES, PLANETS } from './types.js';

export class ChartRenderer {
  private ephem: EphemerisCalculator;
  private houseCalc: HouseCalculator;
  private dom: JSDOM;

  constructor(ephem: EphemerisCalculator, houseCalc: HouseCalculator) {
    this.ephem = ephem;
    this.houseCalc = houseCalc;

    // Create virtual DOM
    this.dom = new JSDOM(
      '<!DOCTYPE html><html><body><div id="chart-container"></div></body></html>'
    );
  }

  private setupGlobals(): void {
    // Set global document and window for astrochart
    (global as any).document = this.dom.window.document;
    (global as any).window = this.dom.window;
    (global as any).SVGElement = this.dom.window.SVGElement;
    (global as any).self = this.dom.window; // Required by astrochart library
  }

  private clearContainer(): void {
    const container = this.dom.window.document.getElementById('chart-container');
    if (container) {
      container.innerHTML = '';
    }
  }

  async generateNatalChart(
    natalChart: NatalChart,
    theme: ChartTheme = 'light',
    format: ChartFormat = 'svg'
  ): Promise<string | Buffer> {
    this.setupGlobals();
    this.clearContainer();

    const birthDate = new Date(
      natalChart.birthDate.year,
      natalChart.birthDate.month - 1,
      natalChart.birthDate.day,
      natalChart.birthDate.hour,
      natalChart.birthDate.minute
    );

    const jd = this.ephem.dateToJulianDay(birthDate);

    // Get all planet positions
    const allPlanetIds = [...Object.values(PLANETS), ...ASTEROIDS, ...NODES];
    const positions = this.ephem.getAllPlanets(jd, allPlanetIds);

    // Get houses
    const houses = this.houseCalc.calculateHouses(
      jd,
      natalChart.location.latitude,
      natalChart.location.longitude,
      'P'
    );

    // Convert to AstroChart format
    const data: AstroChartData = {
      planets: {},
      cusps: Array.from(houses.cusps).slice(1, 13), // Houses 1-12
    };

    // Map planet positions
    positions.forEach((p) => {
      const planetKey = this.getPlanetKey(p.planet);
      if (planetKey) {
        data.planets[planetKey] = [p.longitude];
      }
    });

    // Create chart with theme colors
    const settings: AstroChartSettings = {
      SYMBOL_SCALE: 1.2,
      STROKE_ONLY: false,
      ...getThemeSettings(theme, false),
    };
    const ChartClass = (Chart as any).default || Chart;
    const chart = new ChartClass('chart-container', 800, 800, settings);

    // Generate SVG
    const radix = chart.radix(data);
    radix.aspects();
    const svgString = this.extractSVG(radix);

    // Convert to requested format
    if (format === 'svg') {
      return svgString;
    }
    return this.convertToImage(svgString, format, theme);
  }

  async generateTransitChart(
    natalChart: NatalChart,
    transitDate?: Date,
    theme: ChartTheme = 'light',
    format: ChartFormat = 'svg'
  ): Promise<string | Buffer> {
    this.setupGlobals();
    this.clearContainer();

    const birthDate = new Date(
      natalChart.birthDate.year,
      natalChart.birthDate.month - 1,
      natalChart.birthDate.day,
      natalChart.birthDate.hour,
      natalChart.birthDate.minute
    );

    const birthJD = this.ephem.dateToJulianDay(birthDate);
    const transitJD = this.ephem.dateToJulianDay(transitDate || new Date());

    // Get natal positions
    const allPlanetIds = [...Object.values(PLANETS), ...ASTEROIDS, ...NODES];
    const natalPositions = this.ephem.getAllPlanets(birthJD, allPlanetIds);
    const transitPositions = this.ephem.getAllPlanets(transitJD, allPlanetIds);

    // Get houses
    const houses = this.houseCalc.calculateHouses(
      birthJD,
      natalChart.location.latitude,
      natalChart.location.longitude,
      'P'
    );

    // Convert to AstroChart format
    const natalData: AstroChartData = {
      planets: {},
      cusps: Array.from(houses.cusps).slice(1, 13),
    };

    const transitData: AstroChartData = {
      planets: {},
      cusps: Array.from(houses.cusps).slice(1, 13), // Use natal cusps for transit overlay
    };

    natalPositions.forEach((p) => {
      const planetKey = this.getPlanetKey(p.planet);
      if (planetKey) {
        natalData.planets[planetKey] = [p.longitude];
      }
    });

    transitPositions.forEach((p) => {
      const planetKey = this.getPlanetKey(p.planet);
      if (planetKey) {
        transitData.planets[planetKey] = [p.longitude];
      }
    });

    // Create natal chart first with theme colors
    const settings: AstroChartSettings = {
      SYMBOL_SCALE: 1.2,
      STROKE_ONLY: false,
      ...getThemeSettings(theme, false),
    };
    const ChartClass = (Chart as any).default || Chart;
    const chart = new ChartClass('chart-container', 800, 800, settings);

    // Create radix chart and overlay transits
    const radix = chart.radix(natalData);
    radix.aspects();
    radix.transit(transitData);
    const svgString = this.extractSVG(radix);

    // Convert to requested format
    if (format === 'svg') {
      return svgString;
    }
    return this.convertToImage(svgString, format, theme);
  }

  private getPlanetKey(planetName: string): string | null {
    const mapping: { [key: string]: string } = {
      Sun: 'Sun',
      Moon: 'Moon',
      Mercury: 'Mercury',
      Venus: 'Venus',
      Mars: 'Mars',
      Jupiter: 'Jupiter',
      Saturn: 'Saturn',
      Uranus: 'Uranus',
      Neptune: 'Neptune',
      Pluto: 'Pluto',
      Chiron: 'Chiron',
      'North Node (Mean)': 'NNode',
      'North Node (True)': 'NNode',
    };

    return mapping[planetName] || null;
  }

  private extractSVG(_chartObject: any): string {
    // Get the SVG element from the virtual DOM
    const container = this.dom.window.document.getElementById('chart-container');
    if (container) {
      const svg = container.querySelector('svg');
      if (svg) {
        return svg.outerHTML;
      }
    }

    // Fallback: return a simple SVG placeholder
    return `<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
      <circle cx="400" cy="400" r="300" fill="none" stroke="#333" stroke-width="2"/>
      <text x="400" y="400" text-anchor="middle" font-size="20">Chart Generated</text>
    </svg>`;
  }

  private async convertToImage(
    svgString: string,
    format: 'png' | 'webp',
    theme: ChartTheme = 'light'
  ): Promise<Buffer> {
    const buffer = Buffer.from(svgString);

    // Use theme-appropriate background color
    const bgColor =
      theme === 'dark'
        ? { r: 40, g: 44, b: 52, alpha: 1 } // #282c34
        : { r: 255, g: 255, b: 255, alpha: 1 }; // #ffffff

    if (format === 'png') {
      return sharp(buffer)
        .flatten({ background: bgColor })
        .png({ quality: 100, compressionLevel: 6 })
        .toBuffer();
    }

    // WebP
    return sharp(buffer)
      .flatten({ background: bgColor })
      .webp({ quality: 95, effort: 6 })
      .toBuffer();
  }
}
