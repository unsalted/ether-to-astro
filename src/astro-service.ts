import { writeFile } from 'node:fs/promises';
import { parseDateOnlyInput } from './astro-service/date-input.js';
import { ElectionalService } from './astro-service/electional-service.js';
import { RisingSignService } from './astro-service/rising-sign-service.js';
import { resolveHouseSystem, resolveReportingTimezone } from './astro-service/shared.js';
import { TransitService } from './astro-service/transit-service.js';
import { ChartRenderer } from './charts.js';
import { getDefaultTheme } from './constants.js';
import { EclipseCalculator } from './eclipses.js';
import type { McpStartupDefaults } from './entrypoint.js';
import { EphemerisCalculator } from './ephemeris.js';
import { formatDateOnly, formatInTimezone } from './formatter.js';
import { HouseCalculator } from './houses.js';
import { RiseSetCalculator } from './riseset.js';
import { type Disambiguation, localToUTC, utcToLocal } from './time-utils.js';
import { TransitCalculator } from './transits.js';
import {
  ASTEROIDS,
  type ElectionalHouseSystem,
  type HouseSystem,
  type NatalChart,
  NODES,
  PLANETS,
  ZODIAC_SIGNS,
} from './types.js';

interface AstroServiceDependencies {
  ephem?: EphemerisCalculator;
  transitCalc?: TransitCalculator;
  houseCalc?: HouseCalculator;
  riseSetCalc?: RiseSetCalculator;
  eclipseCalc?: EclipseCalculator;
  chartRenderer?: ChartRenderer;
  mcpStartupDefaults?: McpStartupDefaults;
  now?: () => Date;
  writeFile?: (path: string, data: string | Buffer, encoding?: BufferEncoding) => Promise<void>;
}

export interface SetNatalChartInput {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  latitude: number;
  longitude: number;
  timezone: string;
  house_system?: HouseSystem;
  birth_time_disambiguation?: Disambiguation;
}

export interface GetTransitsInput {
  date?: string;
  categories?: string[];
  include_mundane?: boolean;
  days_ahead?: number;
  mode?: 'snapshot' | 'best_hit' | 'forecast';
  max_orb?: number;
  exact_only?: boolean;
  applying_only?: boolean;
}

export interface GetElectionalContextInput {
  date: string;
  time: string;
  timezone: string;
  latitude: number;
  longitude: number;
  house_system?: ElectionalHouseSystem;
  include_ruler_basics?: boolean;
  include_planetary_applications?: boolean;
  orb_degrees?: number;
}

export interface GetHousesInput {
  system?: string;
}

export interface GetRisingSignWindowsInput {
  date: string;
  latitude: number;
  longitude: number;
  timezone: string;
  mode?: 'approximate' | 'exact';
}

export interface GenerateChartInput {
  theme?: 'light' | 'dark';
  format?: 'svg' | 'png' | 'webp';
  output_path?: string;
}

export interface GenerateTransitChartInput extends GenerateChartInput {
  date?: string;
}

export interface ServiceResult<T> {
  data: T;
  text: string;
}

interface ChartServiceResult {
  format: 'svg' | 'png' | 'webp';
  outputPath?: string;
  text: string;
  svg?: string;
  image?: {
    data: string;
    mimeType: string;
  };
}

export { parseDateOnlyInput } from './astro-service/date-input.js';

/**
 * Shared service facade used by both the MCP server and the CLI.
 *
 * @remarks
 * Public methods remain the stable orchestration boundary while domain-specific
 * internals can be extracted behind the class without changing callers.
 */
export class AstroService {
  readonly ephem: EphemerisCalculator;
  readonly transitCalc: TransitCalculator;
  readonly houseCalc: HouseCalculator;
  readonly riseSetCalc: RiseSetCalculator;
  readonly eclipseCalc: EclipseCalculator;
  readonly chartRenderer: ChartRenderer;
  readonly mcpStartupDefaults: Readonly<McpStartupDefaults>;
  private readonly transitService: TransitService;
  private readonly electionalService: ElectionalService;
  private readonly risingSignService: RisingSignService;
  private readonly now: () => Date;
  private readonly writeFileFn: (
    path: string,
    data: string | Buffer,
    encoding?: BufferEncoding
  ) => Promise<void>;

  constructor(deps: AstroServiceDependencies = {}) {
    this.ephem = deps.ephem ?? new EphemerisCalculator();
    this.houseCalc = deps.houseCalc ?? new HouseCalculator(this.ephem);
    this.transitCalc = deps.transitCalc ?? new TransitCalculator(this.ephem);
    this.riseSetCalc = deps.riseSetCalc ?? new RiseSetCalculator(this.ephem);
    this.eclipseCalc = deps.eclipseCalc ?? new EclipseCalculator(this.ephem);
    this.chartRenderer = deps.chartRenderer ?? new ChartRenderer(this.ephem, this.houseCalc);
    this.mcpStartupDefaults = Object.freeze({ ...(deps.mcpStartupDefaults ?? {}) });
    this.now = deps.now ?? (() => new Date());
    this.writeFileFn = deps.writeFile ?? writeFile;
    this.transitService = new TransitService({
      ephem: this.ephem,
      transitCalc: this.transitCalc,
      houseCalc: this.houseCalc,
      mcpStartupDefaults: this.mcpStartupDefaults,
      now: this.now,
      formatTimestamp: this.formatTimestamp.bind(this),
    });
    this.electionalService = new ElectionalService({
      ephem: this.ephem,
      houseCalc: this.houseCalc,
    });
    this.risingSignService = new RisingSignService({
      ephem: this.ephem,
      houseCalc: this.houseCalc,
    });
  }

  private formatTimestamp(date: Date, timezone: string): string {
    return formatInTimezone(date, timezone, {
      weekday: this.mcpStartupDefaults.weekdayLabels ?? false,
    });
  }

  /**
   * Resolve the timezone used for user-facing timestamps and labels.
   */
  resolveReportingTimezone(explicitTimezone?: string, natalTimezone?: string): string {
    return resolveReportingTimezone(this.mcpStartupDefaults, explicitTimezone, natalTimezone);
  }

  /**
   * Initialize the underlying ephemeris engine.
   */
  async init(): Promise<void> {
    await this.ephem.init();
  }

  /**
   * Report whether the ephemeris engine has been initialized.
   */
  isInitialized(): boolean {
    return !!this.ephem.eph;
  }

  /**
   * Build and cache the shared natal chart payload used by later workflows.
   */
  setNatalChart(
    input: SetNatalChartInput
  ): ServiceResult<Record<string, unknown>> & { chart: NatalChart } {
    const requestedHouseSystem = input.house_system ?? null;

    const chart: NatalChart = {
      name: input.name,
      birthDate: {
        year: input.year,
        month: input.month,
        day: input.day,
        hour: input.hour,
        minute: input.minute,
      },
      location: {
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: input.timezone,
      },
    };

    const birthTimeDisambiguation = input.birth_time_disambiguation ?? 'reject';
    const utcDate = localToUTC(chart.birthDate, chart.location.timezone, birthTimeDisambiguation);
    const utcComponents = utcToLocal(utcDate, 'UTC');

    const jd = this.ephem.dateToJulianDay(utcDate);
    const planetIds = Object.values(PLANETS);
    const positions = this.ephem.getAllPlanets(jd, planetIds);

    const isPolar = Math.abs(chart.location.latitude) > 66;
    let houseSystem: HouseSystem = requestedHouseSystem || 'P';
    if (isPolar && houseSystem === 'P') {
      houseSystem = 'W';
    }

    const houses = this.houseCalc.calculateHouses(
      jd,
      chart.location.latitude,
      chart.location.longitude,
      houseSystem
    );

    const storedChart: NatalChart = {
      ...chart,
      planets: positions,
      julianDay: jd,
      houseSystem: houses.system,
      requestedHouseSystem: requestedHouseSystem ?? undefined,
      utcDateTime: utcComponents,
    };

    const sun = positions.find((p) => p.planet === 'Sun');
    const moon = positions.find((p) => p.planet === 'Moon');
    if (!sun || !moon) {
      throw new Error('Ephemeris failed to compute Sun/Moon positions for natal chart.');
    }

    const formatDegree = (lon: number): string => {
      const sign = ZODIAC_SIGNS[Math.floor(lon / 30)];
      const degree = lon % 30;
      return `${degree.toFixed(0)}° ${sign}`;
    };

    const localTimeStr = `${chart.birthDate.month}/${chart.birthDate.day}/${chart.birthDate.year} ${chart.birthDate.hour}:${String(chart.birthDate.minute).padStart(2, '0')}`;
    const utcTimeStr = `${utcComponents.month}/${utcComponents.day}/${utcComponents.year} ${utcComponents.hour}:${String(utcComponents.minute).padStart(2, '0')} UTC`;

    const systemNames: Record<string, string> = {
      P: 'Placidus',
      W: 'Whole Sign',
      K: 'Koch',
      E: 'Equal',
    };

    const latDir = chart.location.latitude >= 0 ? 'N' : 'S';
    const lonDir = chart.location.longitude >= 0 ? 'E' : 'W';
    const latAbs = Math.abs(chart.location.latitude);
    const lonAbs = Math.abs(chart.location.longitude);

    const feedback = [
      `Natal chart saved for ${chart.name}`,
      '',
      'Birth Details:',
      `- Local Time: ${localTimeStr} (${chart.location.timezone})`,
      `- UTC Time: ${utcTimeStr}`,
      `- Location: ${latAbs.toFixed(2)}°${latDir}, ${lonAbs.toFixed(2)}°${lonDir}`,
      '',
      'Chart Angles:',
      `- Sun: ${formatDegree(sun.longitude)}`,
      `- Moon: ${formatDegree(moon.longitude)}`,
      `- Ascendant: ${formatDegree(houses.ascendant)}`,
      `- MC: ${formatDegree(houses.mc)}`,
      '',
      `House System: ${systemNames[houses.system] || houses.system}`,
    ];

    if (isPolar && houses.system !== houseSystem) {
      feedback.push(
        '',
        `Note: Polar latitude detected (${chart.location.latitude.toFixed(1)}°). Requested ${systemNames[houseSystem]}, using ${systemNames[houses.system]} instead.`
      );
    } else if (isPolar) {
      feedback.push(
        '',
        `Note: Polar latitude detected (${chart.location.latitude.toFixed(1)}°). Using ${systemNames[houses.system]} house system.`
      );
    }

    const structuredData: Record<string, unknown> = {
      name: chart.name,
      birthTime: {
        local: localTimeStr,
        utc: utcTimeStr,
        timezone: chart.location.timezone,
      },
      location: {
        latitude: chart.location.latitude,
        longitude: chart.location.longitude,
      },
      julianDay: jd,
      requestedHouseSystem,
      resolvedHouseSystem: houses.system,
      angles: {
        sun: formatDegree(sun.longitude),
        moon: formatDegree(moon.longitude),
        ascendant: formatDegree(houses.ascendant),
        mc: formatDegree(houses.mc),
      },
      isPolar,
    };

    return {
      chart: storedChart,
      data: structuredData,
      text: feedback.join('\n'),
    };
  }

  /**
   * Calculate natal transits while preserving the public service contract.
   */
  getTransits(
    natalChart: NatalChart,
    input: GetTransitsInput = {}
  ): ServiceResult<Record<string, unknown>> {
    return this.transitService.getTransits(natalChart, input);
  }

  /**
   * Produce deterministic electional context for a single local instant.
   */
  getElectionalContext(input: GetElectionalContextInput): ServiceResult<Record<string, unknown>> {
    return this.electionalService.getElectionalContext(input);
  }

  /**
   * Calculate house cusps and angles for a natal chart.
   */
  getHouses(
    natalChart: NatalChart,
    input: GetHousesInput = {}
  ): ServiceResult<Record<string, unknown>> {
    const system = resolveHouseSystem(natalChart, this.mcpStartupDefaults, input.system);
    if (!natalChart.julianDay) {
      throw new Error('Natal chart is missing julianDay. Re-run set_natal_chart to fix.');
    }

    const houses = this.houseCalc.calculateHouses(
      natalChart.julianDay,
      natalChart.location.latitude,
      natalChart.location.longitude,
      system
    );

    const humanLines = houses.cusps
      .slice(1)
      .map((deg: number, i: number) => {
        const sign = ZODIAC_SIGNS[Math.floor(deg / 30)];
        return `House ${i + 1}: ${(deg % 30).toFixed(2)}° ${sign}`;
      })
      .join('\n');
    const humanText = `Houses (${houses.system}):\nAsc: ${houses.ascendant.toFixed(2)}° | MC: ${houses.mc.toFixed(2)}°\n\n${humanLines}`;

    return {
      data: houses as unknown as Record<string, unknown>,
      text: humanText,
    };
  }

  /**
   * Find rising-sign windows across a calendar day at a specific location.
   */
  getRisingSignWindows(input: GetRisingSignWindowsInput): ServiceResult<Record<string, unknown>> {
    return this.risingSignService.getRisingSignWindows(input);
  }

  /**
   * Return the currently retrograde planets for the requested reporting timezone.
   */
  getRetrogradePlanets(timezone?: string): ServiceResult<Record<string, unknown>> {
    const resolvedTimezone = this.resolveReportingTimezone(timezone);
    const now = this.now();
    const jd = this.ephem.dateToJulianDay(now);
    const allPlanetIds = Object.values(PLANETS);
    const positions = this.ephem.getAllPlanets(jd, allPlanetIds);
    const retrograde = positions.filter((p) => p.isRetrograde);

    const localNow = utcToLocal(now, resolvedTimezone);
    const dateLabel = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(localNow.day).padStart(2, '0')}`;

    const structuredData = {
      date: dateLabel,
      timezone: resolvedTimezone,
      planets: retrograde,
    };

    const humanText =
      retrograde.length === 0
        ? 'No planets are currently retrograde.'
        : `Retrograde Planets:\n\n${retrograde.map((p) => `${p.planet}: ${p.degree.toFixed(2)}° ${p.sign}`).join('\n')}`;

    return { data: structuredData, text: humanText };
  }

  /**
   * Return the next rise and set events after the local day anchor for the chart location.
   */
  async getRiseSetTimes(natalChart: NatalChart): Promise<ServiceResult<Record<string, unknown>>> {
    const timezone = natalChart.location.timezone;
    const reportingTimezone = this.mcpStartupDefaults.preferredTimezone || timezone;
    const now = this.now();
    const localNow = utcToLocal(now, timezone);
    const localMidnight = {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const midnightUTC = localToUTC(localMidnight, timezone);

    const dateLabel = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(localNow.day).padStart(2, '0')}`;

    const results = await this.riseSetCalc.getAllRiseSet(
      midnightUTC,
      natalChart.location.latitude,
      natalChart.location.longitude
    );

    const structuredData = {
      date: dateLabel,
      timezone,
      times: results.map((r) => ({
        planet: r.planet,
        rise: r.rise?.toISOString() ?? null,
        set: r.set?.toISOString() ?? null,
      })),
    };

    const humanText = `Rise/Set Times:\n\n${results
      .map((r) => {
        const rise = r.rise ? this.formatTimestamp(r.rise, reportingTimezone) : 'none';
        const set = r.set ? this.formatTimestamp(r.set, reportingTimezone) : 'none';
        return `${r.planet}: Rise ${rise}, Set ${set}`;
      })
      .join('\n')}`;

    return {
      data: structuredData,
      text: humanText,
    };
  }

  /**
   * Return current asteroid and node positions for the requested reporting timezone.
   */
  getAsteroidPositions(timezone?: string): ServiceResult<Record<string, unknown>> {
    const resolvedTimezone = this.resolveReportingTimezone(timezone);
    const now = this.now();
    const jd = this.ephem.dateToJulianDay(now);
    const asteroidIds = [...ASTEROIDS, ...NODES];
    const positions = this.ephem.getAllPlanets(jd, asteroidIds);

    const localNow = utcToLocal(now, resolvedTimezone);
    const dateLabel = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(localNow.day).padStart(2, '0')}`;

    const structuredData = {
      date: dateLabel,
      timezone: resolvedTimezone,
      positions,
    };

    const humanText = `Asteroid & Node Positions:\n\n${positions
      .map((p) => {
        const rx = p.isRetrograde ? ' Rx' : '';
        return `${p.planet}: ${p.degree.toFixed(2)}° ${p.sign}${rx}`;
      })
      .join('\n')}`;

    return {
      data: structuredData,
      text: humanText,
    };
  }

  /**
   * Look up the next solar and lunar eclipses after the current instant.
   */
  getNextEclipses(timezone?: string): ServiceResult<Record<string, unknown>> {
    const resolvedTimezone = this.resolveReportingTimezone(timezone);
    const now = this.now();
    const jd = this.ephem.dateToJulianDay(now);

    const solarEclipse = this.eclipseCalc.findNextSolarEclipse(jd);
    const lunarEclipse = this.eclipseCalc.findNextLunarEclipse(jd);

    const eclipses: Array<{ type: string; eclipseType: string; maxTime: string }> = [];
    const humanLines: string[] = [];

    if (solarEclipse) {
      eclipses.push({
        type: solarEclipse.type,
        eclipseType: solarEclipse.eclipseType,
        maxTime: solarEclipse.maxTime.toISOString(),
      });
      humanLines.push(
        `Next Solar Eclipse: ${this.formatTimestamp(solarEclipse.maxTime, resolvedTimezone)} (${solarEclipse.eclipseType})`
      );
    }

    if (lunarEclipse) {
      eclipses.push({
        type: lunarEclipse.type,
        eclipseType: lunarEclipse.eclipseType,
        maxTime: lunarEclipse.maxTime.toISOString(),
      });
      humanLines.push(
        `Next Lunar Eclipse: ${this.formatTimestamp(lunarEclipse.maxTime, resolvedTimezone)} (${lunarEclipse.eclipseType})`
      );
    }

    const structuredData = { timezone: resolvedTimezone, eclipses };
    const humanText =
      eclipses.length === 0
        ? 'No eclipses found in the near future.'
        : `Upcoming Eclipses:\n\n${humanLines.join('\n')}`;

    return { data: structuredData, text: humanText };
  }

  /**
   * Summarize process-local server state and configured startup defaults.
   */
  getServerStatus(natalChart: NatalChart | null): ServiceResult<Record<string, unknown>> {
    const statusData = {
      serverVersion: '1.0.0',
      hasNatalChart: natalChart !== null,
      natalChartName: natalChart?.name ?? null,
      natalChartTimezone: natalChart?.location.timezone ?? null,
      startupDefaults: {
        preferredTimezone: this.mcpStartupDefaults.preferredTimezone ?? null,
        preferredHouseStyle: this.mcpStartupDefaults.preferredHouseStyle ?? null,
        weekdayLabels: this.mcpStartupDefaults.weekdayLabels ?? null,
      },
      ephemerisInitialized: this.isInitialized(),
      stateModel: 'stateful-per-process',
    };

    const humanText = natalChart
      ? `Server ready. Natal chart loaded: ${natalChart.name} (${natalChart.location.timezone})`
      : 'Server ready. No natal chart loaded — call set_natal_chart first.';

    return { data: statusData, text: humanText };
  }

  /**
   * Generate a natal chart image or SVG for the current chart.
   */
  async generateNatalChart(
    natalChart: NatalChart,
    input: GenerateChartInput = {}
  ): Promise<ChartServiceResult> {
    const theme = input.theme || getDefaultTheme(natalChart.location.timezone);
    const format = input.format || 'svg';
    const outputPath = input.output_path;
    const chart = await this.chartRenderer.generateNatalChart(natalChart, theme, format);

    if (outputPath) {
      if (format === 'svg') {
        await this.writeFileFn(outputPath, chart as string, 'utf-8');
      } else {
        await this.writeFileFn(outputPath, chart as Buffer);
      }
      return {
        format,
        outputPath,
        text: `Natal Chart for ${natalChart.name} saved to: ${outputPath}`,
      };
    }

    if (format === 'svg') {
      return {
        format,
        text: `Natal Chart for ${natalChart.name}:`,
        svg: chart as string,
      };
    }

    const base64 = (chart as Buffer).toString('base64');
    const mimeType = format === 'png' ? 'image/png' : 'image/webp';
    return {
      format,
      text: `Natal Chart for ${natalChart.name} (${theme} theme, ${format.toUpperCase()} format):`,
      image: {
        data: base64,
        mimeType,
      },
    };
  }

  /**
   * Generate a transit chart image or SVG for a target date.
   */
  async generateTransitChart(
    natalChart: NatalChart,
    input: GenerateTransitChartInput = {}
  ): Promise<ChartServiceResult> {
    const dateStr = input.date;
    const theme = input.theme ?? getDefaultTheme(natalChart.location.timezone);
    const format = input.format ?? 'svg';

    let targetDate: Date;
    if (dateStr) {
      const parsed = parseDateOnlyInput(dateStr);
      targetDate = localToUTC(parsed, natalChart.location.timezone);
    } else {
      const now = this.now();
      const localNow = utcToLocal(now, natalChart.location.timezone);
      const localNoon = { ...localNow, hour: 12, minute: 0, second: 0 };
      targetDate = localToUTC(localNoon, natalChart.location.timezone);
    }

    const outputPath = input.output_path;
    const chart = await this.chartRenderer.generateTransitChart(
      natalChart,
      targetDate,
      theme,
      format
    );
    const dateLabel = formatDateOnly(targetDate, natalChart.location.timezone);

    if (outputPath) {
      if (format === 'svg') {
        await this.writeFileFn(outputPath, chart as string, 'utf-8');
      } else {
        await this.writeFileFn(outputPath, chart as Buffer);
      }
      return {
        format,
        outputPath,
        text: `Transit Chart for ${natalChart.name} (${dateLabel}) saved to ${outputPath}`,
      };
    }

    if (format === 'svg') {
      return {
        format,
        text: `Transit Chart for ${natalChart.name} (${dateLabel})`,
        svg: chart as string,
      };
    }

    const base64 = (chart as Buffer).toString('base64');
    const mimeType = format === 'png' ? 'image/png' : 'image/webp';
    return {
      format,
      text: `Transit Chart for ${natalChart.name} (${dateLabel}, ${theme} theme, ${format.toUpperCase()} format):`,
      image: {
        data: base64,
        mimeType,
      },
    };
  }
}
