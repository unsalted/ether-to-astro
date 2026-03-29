import { writeFile } from 'node:fs/promises';
import { ChartOutputService } from './astro-service/chart-output-service.js';
import { ElectionalService } from './astro-service/electional-service.js';
import { NatalService } from './astro-service/natal-service.js';
import { RisingSignService } from './astro-service/rising-sign-service.js';
import { resolveReportingTimezone } from './astro-service/shared.js';
import { SkyService } from './astro-service/sky-service.js';
import { TransitService } from './astro-service/transit-service.js';
import { ChartRenderer } from './charts.js';
import { EclipseCalculator } from './eclipses.js';
import type { McpStartupDefaults } from './entrypoint.js';
import { EphemerisCalculator } from './ephemeris.js';
import { formatInTimezone } from './formatter.js';
import { HouseCalculator } from './houses.js';
import { RiseSetCalculator } from './riseset.js';
import type { Disambiguation } from './time-utils.js';
import { TransitCalculator } from './transits.js';
import type { ElectionalHouseSystem, HouseSystem, NatalChart } from './types.js';

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
  private readonly natalService: NatalService;
  private readonly skyService: SkyService;
  private readonly chartOutputService: ChartOutputService;
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
    this.natalService = new NatalService({
      ephem: this.ephem,
      houseCalc: this.houseCalc,
      mcpStartupDefaults: this.mcpStartupDefaults,
      isInitialized: this.isInitialized.bind(this),
    });
    this.skyService = new SkyService({
      ephem: this.ephem,
      riseSetCalc: this.riseSetCalc,
      eclipseCalc: this.eclipseCalc,
      mcpStartupDefaults: this.mcpStartupDefaults,
      now: this.now,
      formatTimestamp: this.formatTimestamp.bind(this),
    });
    this.chartOutputService = new ChartOutputService({
      chartRenderer: this.chartRenderer,
      now: this.now,
      writeFile: this.writeFileFn,
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
    return this.natalService.setNatalChart(input);
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
    return this.natalService.getHouses(natalChart, input);
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
    return this.skyService.getRetrogradePlanets(timezone);
  }

  /**
   * Return the next rise and set events after the local day anchor for the chart location.
   */
  async getRiseSetTimes(natalChart: NatalChart): Promise<ServiceResult<Record<string, unknown>>> {
    return this.skyService.getRiseSetTimes(natalChart);
  }

  /**
   * Return current asteroid and node positions for the requested reporting timezone.
   */
  getAsteroidPositions(timezone?: string): ServiceResult<Record<string, unknown>> {
    return this.skyService.getAsteroidPositions(timezone);
  }

  /**
   * Look up the next solar and lunar eclipses after the current instant.
   */
  getNextEclipses(timezone?: string): ServiceResult<Record<string, unknown>> {
    return this.skyService.getNextEclipses(timezone);
  }

  /**
   * Summarize process-local server state and configured startup defaults.
   */
  getServerStatus(natalChart: NatalChart | null): ServiceResult<Record<string, unknown>> {
    return this.natalService.getServerStatus(natalChart);
  }

  /**
   * Generate a natal chart image or SVG for the current chart.
   */
  async generateNatalChart(
    natalChart: NatalChart,
    input: GenerateChartInput = {}
  ): Promise<ChartServiceResult> {
    return this.chartOutputService.generateNatalChart(natalChart, input);
  }

  /**
   * Generate a transit chart image or SVG for a target date.
   */
  async generateTransitChart(
    natalChart: NatalChart,
    input: GenerateTransitChartInput = {}
  ): Promise<ChartServiceResult> {
    return this.chartOutputService.generateTransitChart(natalChart, input);
  }
}
