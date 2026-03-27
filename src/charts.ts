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
import { type NatalChart, PLANETS } from './types.js';

/**
 * Renderer for astrological charts using SVG
 * 
 * @remarks
 * Generates natal and transit charts as SVG images using the astrochart library.
 * Converts SVG to PNG/WebP formats for output. Uses JSDOM to provide
 * browser environment for the chart library.
 */
export class ChartRenderer {
  /** Ephemeris calculator instance */
  private ephem: EphemerisCalculator;
  /** House calculator instance */
  private houseCalc: HouseCalculator;
  /** Virtual DOM for chart rendering */
  private dom: JSDOM;

  /**
   * Create a new chart renderer
   * 
   * @param ephem - Initialized ephemeris calculator
   * @param houseCalc - Initialized house calculator
   * 
   * @remarks
   * Both calculators must be initialized before passing to the constructor.
   * Sets up a virtual DOM environment for the astrochart library.
   */
  constructor(ephem: EphemerisCalculator, houseCalc: HouseCalculator) {
    this.ephem = ephem;
    this.houseCalc = houseCalc;

    // Create virtual DOM
    this.dom = new JSDOM(
      '<!DOCTYPE html><html><body><div id="chart-container"></div></body></html>'
    );
  }

  /**
   * Setup global browser variables for astrochart library
   * 
   * @remarks
   * The astrochart library expects browser globals like document and window.
   * This method provides those from the virtual DOM. Required because
   * astrochart was designed for browser environments.
   */
  private setupGlobals(): void {
    // Set global document and window for astrochart
    // Note: Required by astrochart library which expects browser globals
    const g = global as typeof globalThis;
    (g as any).document = this.dom.window.document;
    (g as any).window = this.dom.window;
    (g as any).SVGElement = this.dom.window.SVGElement;
    (g as any).self = this.dom.window;
  }

  /**
   * Clear the chart container element
   * 
   * @remarks
   * Removes any previous chart content to ensure clean rendering.
   * Called before generating each new chart.
   */
  private clearContainer(): void {
    const container = this.dom.window.document.getElementById('chart-container');
    if (container) {
      container.innerHTML = '';
    }
  }

  /**
   * Generate a natal chart visualization
   * 
   * @param natalChart - Birth chart data with julianDay and houseSystem
   * @param theme - Visual theme for the chart (default: 'light')
   * @param format - Output format (default: 'svg')
   * @returns Chart image as buffer or data URL
   * @throws Error if natal chart is invalid or rendering fails
   * 
   * @remarks
   * Renders a complete natal chart with planets, houses, and aspects.
   * Requires julianDay to be set in the natalChart.
   */
  async generateNatalChart(
    natalChart: NatalChart,
    theme: ChartTheme = 'light',
    format: ChartFormat = 'svg'
  ): Promise<Buffer | string> {
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

  /**
   * Prepare chart data for astrochart library
   * 
   * @param natalChart - Birth chart data
   * @param transitDate - Optional date for transit calculations
   * @returns Chart data in astrochart format
   * @throws Error if julianDay is not set
   * 
   * @remarks
   * Converts internal chart format to astrochart's expected format.
   * Includes planets, houses, and optionally transit positions.
   */
  private prepareChartData(
    natalChart: NatalChart,
    transitDate?: Date
  ): AstroChartData {
    // Require Julian Day (always set by set_natal_chart)
    if (!natalChart.julianDay) {
      throw new Error('Natal chart missing Julian Day - chart may be from old session. Please call set_natal_chart again.');
    }
    const jd = natalChart.julianDay;

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

    // Define renderable planets for charts
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

    // Prefill natal planets from julianDay to ensure all renderable planets have positions
    // This avoids fake 0° placeholders for planets missing from natalChart.planets
    const natalPositions = this.ephem.getAllPlanets(jd, renderablePlanetIds);
    natalPositions.forEach((p) => {
      const planetKey = this.getPlanetKey(p.planet);
      if (planetKey) {
        data.planets[planetKey] = [p.longitude];
      }
    });

    // Add transit planets if transit date provided
    if (transitDate) {
      const transitJD = this.ephem.dateToJulianDay(transitDate);
      const transitPositions = this.ephem.getAllPlanets(transitJD, renderablePlanetIds);
      
      transitPositions.forEach((p) => {
        const planetKey = this.getPlanetKey(p.planet);
        if (planetKey) {
          // Add transit position as second element in array
          // Natal position already exists from prefill above
          const current = data.planets[planetKey];
          if (current) {
            data.planets[planetKey] = [current[0], p.longitude];
          }
        }
      });
    }

    return data;
  }

  /**
   * Generate a transit chart visualization
   * 
   * @param natalChart - Birth chart data with julianDay and houseSystem
   * @param transitDate - Date for transit calculation
   * @param theme - Visual theme for the chart (default: 'light')
   * @param format - Output format (default: 'svg')
   * @returns Chart image as buffer or data URL
   * @throws Error if natal chart is invalid or rendering fails
   * 
   * @remarks
   * Shows both natal positions (inner wheel) and current transits (outer wheel).
   * Requires julianDay to be set in the natalChart.
   */
  async generateTransitChart(
    natalChart: NatalChart,
    transitDate: Date,
    theme: ChartTheme = 'light',
    format: ChartFormat = 'svg'
  ): Promise<Buffer | string> {
    this.setupGlobals();
    this.clearContainer();

    const data = this.prepareChartData(natalChart, transitDate);

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
    radix.transit(data);
    const svgString = this.extractSVG();

    // Convert to requested format
    if (format === 'svg') {
      return svgString;
    }
    return this.convertToImage(svgString, format, theme);
  }

  /**
   * Map internal planet names to astrochart keys
   * 
   * @param planetName - Internal planet name
   * @returns Astrochart planet key or null if not supported
   * 
   * @remarks
   * Maps our planet names to the keys expected by astrochart.
   * Uses mean node to avoid collision with true node.
   */
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

  /**
   * Extract SVG string from virtual DOM
   * 
   * @returns SVG string
   * @throws Error if no SVG element found
   * 
   * @remarks
   * Finds the SVG element in the virtual DOM and returns
   * its outer HTML. Throws if no chart was rendered.
   */
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

  /**
   * Convert SVG to specified output format
   * 
   * @param svg - SVG string or buffer
   * @param format - Target output format
   * @returns Converted image as buffer (png/webp) or data URL (svg)
   * @throws Error if conversion fails
   * 
   * @remarks
   * Uses Sharp library for PNG/WebP conversion. SVG is returned
   * as a data URL for direct use in web contexts.
   */
  private async convertToImage(
    svg: string,
    format: ChartFormat,
    theme: ChartTheme
  ): Promise<Buffer> {
    const buffer = Buffer.from(svg);

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
