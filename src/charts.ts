import Chart from '@astrodraw/astrochart';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import {
  type AstroChartConstructor,
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
    // Note: Required by astrochart library which expects browser globals
    const g = global as typeof globalThis;
    (g as any).document = this.dom.window.document;
    (g as any).window = this.dom.window;
    (g as any).SVGElement = this.dom.window.SVGElement;
    (g as any).self = this.dom.window;
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

    // Require Julian Day (always set by set_natal_chart)
    if (!natalChart.julianDay) {
      throw new Error('Natal chart missing Julian Day - chart may be from old session. Please call set_natal_chart again.');
    }
    const jd = natalChart.julianDay;

    // Get only renderable planet positions (those mapped in getPlanetKey)
    const renderablePlanetIds = [
      PLANETS.SUN,
      PLANETS.MOON,
      PLANETS.MERCURY,
      PLANETS.VENUS,
      PLANETS.MARS,
      PLANETS.JUPITER,
      PLANETS.SATURN,
      PLANETS.URANUS,
      PLANETS.NEPTUNE,
      PLANETS.PLUTO,
      PLANETS.CHIRON,
      PLANETS.MEAN_NODE, // Use mean node, not true node
    ];
    const positions = this.ephem.getAllPlanets(jd, renderablePlanetIds);

    // Get houses using stored house system preference
    const houseSystem = natalChart.houseSystem || 'P';
    const houses = this.houseCalc.calculateHouses(
      jd,
      natalChart.location.latitude,
      natalChart.location.longitude,
      houseSystem
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
    const ChartClass = ((Chart as unknown as AstroChartConstructor).default || Chart) as AstroChartConstructor;
    const chart = new ChartClass('chart-container', 800, 800, settings);

    // Generate SVG
    const radix = chart.radix(data);
    radix.aspects();
    const svgString = this.extractSVG();

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

    // Require Julian Day (always set by set_natal_chart)
    if (!natalChart.julianDay) {
      throw new Error('Natal chart missing Julian Day - chart may be from old session. Please call set_natal_chart again.');
    }
    const birthJD = natalChart.julianDay;
    const transitJD = this.ephem.dateToJulianDay(transitDate || new Date());

    // Get only renderable planet positions
    const renderablePlanetIds = [
      PLANETS.SUN,
      PLANETS.MOON,
      PLANETS.MERCURY,
      PLANETS.VENUS,
      PLANETS.MARS,
      PLANETS.JUPITER,
      PLANETS.SATURN,
      PLANETS.URANUS,
      PLANETS.NEPTUNE,
      PLANETS.PLUTO,
      PLANETS.CHIRON,
      PLANETS.MEAN_NODE,
    ];
    const natalPositions = this.ephem.getAllPlanets(birthJD, renderablePlanetIds);
    const transitPositions = this.ephem.getAllPlanets(transitJD, renderablePlanetIds);

    // Get houses using stored house system preference
    const houseSystem = natalChart.houseSystem || 'P';
    const houses = this.houseCalc.calculateHouses(
      birthJD,
      natalChart.location.latitude,
      natalChart.location.longitude,
      houseSystem
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
    const ChartClass = ((Chart as unknown as AstroChartConstructor).default || Chart) as AstroChartConstructor;
    const chart = new ChartClass('chart-container', 800, 800, settings);

    // Create radix chart and overlay transits
    const radix = chart.radix(natalData);
    radix.aspects();
    radix.transit(transitData);
    const svgString = this.extractSVG();

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
      'North Node (Mean)': 'NNode', // Use mean node for consistency
      // True node intentionally omitted - prevents collision/overwrite
    };

    return mapping[planetName] || null;
  }

  private extractSVG(): string {
    // Get the SVG element from the virtual DOM
    const container = this.dom.window.document.getElementById('chart-container');
    if (!container) {
      throw new Error('Chart container not found - DOM setup failed');
    }
    
    const svg = container.querySelector('svg');
    if (!svg) {
      throw new Error('Chart rendering failed - no SVG element generated by astrochart library');
    }
    
    return svg.outerHTML;
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
