import { writeFile } from 'node:fs/promises';
import { ChartOutputService } from './astro-service/chart-output-service.js';
import { ElectionalService } from './astro-service/electional-service.js';
import { NatalService } from './astro-service/natal-service.js';
import { RisingSignService } from './astro-service/rising-sign-service.js';
import type {
  GenerateChartInput,
  GenerateTransitChartInput,
  GetElectionalContextInput,
  GetHousesInput,
  GetRisingSignWindowsInput,
  GetSignBoundaryEventsInput,
  GetTransitsInput,
  ServiceResult,
  SetNatalChartInput,
  SetPreferencesInput,
} from './astro-service/service-types.js';
import { resolveReportingTimezone } from './astro-service/shared.js';
import { SignBoundaryService } from './astro-service/sign-boundary-service.js';
import { SkyService } from './astro-service/sky-service.js';
import { TransitService } from './astro-service/transit-service.js';
import { ChartRenderer } from './charts.js';
import { EclipseCalculator } from './eclipses.js';
import type { McpStartupDefaults } from './entrypoint.js';
import { EphemerisCalculator } from './ephemeris.js';
import { formatInTimezone } from './formatter.js';
import { HouseCalculator } from './houses.js';
import { RiseSetCalculator } from './riseset.js';
import { isValidTimezone } from './time-utils.js';
import { TransitCalculator } from './transits.js';
import type { HouseSystem, NatalChart } from './types.js';

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

interface RuntimePreferences {
  preferredTimezone?: string;
  preferredHouseStyle?: HouseSystem;
}

const VALID_RUNTIME_HOUSE_STYLES = new Set<HouseSystem>(['P', 'W', 'K', 'E']);

export { parseDateOnlyInput } from './astro-service/date-input.js';
export type {
  GenerateChartInput,
  GenerateTransitChartInput,
  GetElectionalContextInput,
  GetHousesInput,
  GetRisingSignWindowsInput,
  GetSignBoundaryEventsInput,
  GetTransitsInput,
  ServiceResult,
  SetNatalChartInput,
  SetPreferencesInput,
} from './astro-service/service-types.js';

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
  private readonly runtimePreferences: RuntimePreferences = {};
  private readonly transitService: TransitService;
  private readonly electionalService: ElectionalService;
  private readonly risingSignService: RisingSignService;
  private readonly signBoundaryService: SignBoundaryService;
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
    this.signBoundaryService = new SignBoundaryService({
      ephem: this.ephem,
      now: this.now,
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
      now: this.now,
      formatTimestamp: this.formatTimestamp.bind(this),
    });
    this.chartOutputService = new ChartOutputService({
      chartRenderer: this.chartRenderer,
      now: this.now,
      writeFile: this.writeFileFn,
    });
  }

  /**
   * Format user-facing timestamps using the current startup default weekday policy.
   */
  private formatTimestamp(date: Date, timezone: string): string {
    return formatInTimezone(date, timezone, {
      weekday: this.mcpStartupDefaults.weekdayLabels ?? false,
    });
  }

  /**
   * Resolve the timezone used for user-facing timestamps and labels.
   *
   * @remarks
   * Explicit per-call timezone wins, then startup defaults, then the natal chart
   * timezone, and finally UTC.
   */
  resolveReportingTimezone(explicitTimezone?: string, natalTimezone?: string): string {
    return (
      explicitTimezone ??
      this.runtimePreferences.preferredTimezone ??
      resolveReportingTimezone(this.mcpStartupDefaults, undefined, natalTimezone)
    );
  }

  private applyRuntimeHouseStyle(natalChart: NatalChart): NatalChart {
    if (this.runtimePreferences.preferredHouseStyle === undefined) {
      return natalChart;
    }

    return {
      ...natalChart,
      requestedHouseSystem: this.runtimePreferences.preferredHouseStyle,
    };
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
   *
   * @remarks
   * This preserves the existing natal contract, including polar-latitude house
   * fallback behavior and the current user-facing summary text.
   */
  setNatalChart(
    input: SetNatalChartInput
  ): ServiceResult<Record<string, unknown>> & { chart: NatalChart } {
    return this.natalService.setNatalChart(input);
  }

  /**
   * Calculate natal transits while preserving the public service contract.
   *
   * @remarks
   * Transit day interpretation uses the natal chart timezone for calculation and
   * may use a different reporting timezone for labels when startup defaults are set.
   */
  getTransits(
    natalChart: NatalChart,
    input: GetTransitsInput = {}
  ): ServiceResult<Record<string, unknown>> {
    const effectiveInput =
      input.timezone === undefined && this.runtimePreferences.preferredTimezone !== undefined
        ? { ...input, timezone: this.runtimePreferences.preferredTimezone }
        : input;
    return this.transitService.getTransits(this.applyRuntimeHouseStyle(natalChart), effectiveInput);
  }

  /**
   * Produce deterministic electional context for a single local instant.
   *
   * @remarks
   * Electional local times keep strict DST rejection semantics for ambiguous or
   * nonexistent wall-clock instants.
   */
  getElectionalContext(input: GetElectionalContextInput): ServiceResult<Record<string, unknown>> {
    return this.electionalService.getElectionalContext(input);
  }

  /**
   * Calculate house cusps and angles for a natal chart.
   *
   * @remarks
   * House-system resolution still respects explicit per-call input, then stored
   * chart preference, then startup defaults.
   */
  getHouses(
    natalChart: NatalChart,
    input: GetHousesInput = {}
  ): ServiceResult<Record<string, unknown>> {
    return this.natalService.getHouses(this.applyRuntimeHouseStyle(natalChart), input);
  }

  /**
   * Find rising-sign windows across a calendar day at a specific location.
   *
   * @remarks
   * `exact` mode refines sign boundaries more aggressively; `approximate` mode
   * keeps the cheaper bucketed scan behavior.
   */
  getRisingSignWindows(input: GetRisingSignWindowsInput): ServiceResult<Record<string, unknown>> {
    return this.risingSignService.getRisingSignWindows(input);
  }

  /**
   * Return exact sign-boundary events across a local calendar window.
   */
  getSignBoundaryEvents(
    input: GetSignBoundaryEventsInput = {}
  ): ServiceResult<Record<string, unknown>> {
    const timezone = this.resolveReportingTimezone(input.timezone);
    return this.signBoundaryService.getSignBoundaryEvents({
      ...input,
      timezone,
    });
  }

  /**
   * Return the currently retrograde planets for the requested reporting timezone.
   */
  getRetrogradePlanets(timezone?: string): ServiceResult<Record<string, unknown>> {
    return this.skyService.getRetrogradePlanets(this.resolveReportingTimezone(timezone));
  }

  /**
   * Return the next rise and set events after the local day anchor for the chart location.
   *
   * @remarks
   * The lookup anchor remains local midnight in the natal chart timezone even
   * when reporting text uses a preferred reporting timezone.
   */
  async getRiseSetTimes(
    natalChart: NatalChart,
    timezone?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    return this.skyService.getRiseSetTimes(
      natalChart,
      this.resolveReportingTimezone(timezone, natalChart.location.timezone)
    );
  }

  /**
   * Return current asteroid and node positions for the requested reporting timezone.
   */
  getAsteroidPositions(timezone?: string): ServiceResult<Record<string, unknown>> {
    return this.skyService.getAsteroidPositions(this.resolveReportingTimezone(timezone));
  }

  /**
   * Look up the next solar and lunar eclipses after the current instant.
   */
  getNextEclipses(timezone?: string): ServiceResult<Record<string, unknown>> {
    return this.skyService.getNextEclipses(this.resolveReportingTimezone(timezone));
  }

  /**
   * Summarize process-local server state and configured startup defaults.
   */
  getServerStatus(natalChart: NatalChart | null): ServiceResult<Record<string, unknown>> {
    return this.natalService.getServerStatus(natalChart, this.runtimePreferences);
  }

  /**
   * Update process-local MCP runtime preferences.
   */
  setPreferences(input: SetPreferencesInput): ServiceResult<Record<string, unknown>> {
    if (input.preferred_timezone !== undefined) {
      if (input.preferred_timezone === null) {
        delete this.runtimePreferences.preferredTimezone;
      } else {
        if (!isValidTimezone(input.preferred_timezone)) {
          throw new Error(`Invalid timezone: ${input.preferred_timezone}`);
        }
        this.runtimePreferences.preferredTimezone = input.preferred_timezone;
      }
    }

    if (input.preferred_house_style !== undefined) {
      if (input.preferred_house_style === null) {
        delete this.runtimePreferences.preferredHouseStyle;
      } else {
        if (!VALID_RUNTIME_HOUSE_STYLES.has(input.preferred_house_style)) {
          throw new Error(
            `Invalid preferred house style: ${input.preferred_house_style} (must be one of P, W, K, E)`
          );
        }
        this.runtimePreferences.preferredHouseStyle = input.preferred_house_style;
      }
    }

    const preferredTimezone = this.runtimePreferences.preferredTimezone ?? null;
    const preferredHouseStyle = this.runtimePreferences.preferredHouseStyle ?? null;
    return {
      data: {
        runtimePreferences: {
          preferredTimezone,
          preferredHouseStyle,
        },
      },
      text: `Runtime preferences updated. Reporting timezone: ${preferredTimezone ?? 'default'}. House style: ${preferredHouseStyle ?? 'default'}.`,
    };
  }

  /**
   * Generate a natal chart image or SVG for the current chart.
   *
   * @remarks
   * When `output_path` is omitted the payload is returned inline; otherwise the
   * rendered asset is written to disk and only path metadata is returned.
   */
  async generateNatalChart(
    natalChart: NatalChart,
    input: GenerateChartInput = {}
  ): Promise<ChartServiceResult> {
    return this.chartOutputService.generateNatalChart(natalChart, input);
  }

  /**
   * Generate a transit chart image or SVG for a target date.
   *
   * @remarks
   * Omitted dates still resolve to local noon in the natal chart timezone before
   * rendering so date-only behavior stays stable across timezone conversions.
   */
  async generateTransitChart(
    natalChart: NatalChart,
    input: GenerateTransitChartInput = {}
  ): Promise<ChartServiceResult> {
    return this.chartOutputService.generateTransitChart(natalChart, input);
  }
}
