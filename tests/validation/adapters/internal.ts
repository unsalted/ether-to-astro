import { parseDateOnlyInput } from '../../../src/astro-service/date-input.js';
import type {
  GetElectionalContextInput,
  GetRisingSignWindowsInput,
  GetTransitsInput,
} from '../../../src/astro-service/service-types.js';
import { getSignAndDegree, normalizeLongitude } from '../../../src/astro-service/shared.js';
import { AstroService } from '../../../src/astro-service.js';
import { EclipseCalculator } from '../../../src/eclipses.js';
import type { McpStartupDefaults } from '../../../src/entrypoint.js';
import { EphemerisCalculator } from '../../../src/ephemeris.js';
import { HouseCalculator } from '../../../src/houses.js';
import { RiseSetCalculator } from '../../../src/riseset.js';
import { localToUTC, utcToLocal } from '../../../src/time-utils.js';
import { TransitCalculator } from '../../../src/transits.js';
import {
  type NatalChart,
  PLANETS,
  type PlanetPosition,
  type Transit,
  ZODIAC_SIGNS,
} from '../../../src/types.js';
import type {
  NormalizedBody,
  NormalizedEclipse,
  NormalizedElectionalContext,
  NormalizedHouseResult,
  NormalizedRiseSet,
  NormalizedRisingSignWindowResult,
  NormalizedRoot,
  NormalizedServiceTransit,
  NormalizedServiceTransitResult,
  NormalizedTransit,
  ServiceTransitNatalFixture,
} from '../utils/fixtureTypes.js';

export class InternalValidationAdapter {
  readonly ephem: EphemerisCalculator;
  readonly houseCalc: HouseCalculator;
  readonly transitCalc: TransitCalculator;
  readonly riseSetCalc: RiseSetCalculator;
  readonly eclipseCalc: EclipseCalculator;
  private readonly validationNow: Date;

  private constructor(ephem: EphemerisCalculator, validationNow: Date) {
    this.ephem = ephem;
    this.houseCalc = new HouseCalculator(ephem);
    this.transitCalc = new TransitCalculator(ephem);
    this.riseSetCalc = new RiseSetCalculator(ephem);
    this.eclipseCalc = new EclipseCalculator(ephem);
    this.validationNow = validationNow;
  }

  static async create(nowIsoUtc = '2024-03-26T12:00:00Z'): Promise<InternalValidationAdapter> {
    const ephem = new EphemerisCalculator();
    await ephem.init();
    return new InternalValidationAdapter(ephem, new Date(nowIsoUtc));
  }

  getPositions(isoUtc: string, planetIds: number[]): NormalizedBody[] {
    const jd = this.ephem.dateToJulianDay(new Date(isoUtc));
    return this.ephem.getAllPlanets(jd, planetIds).map((p) => this.normalizeBody(p));
  }

  getHouseResult(
    isoUtc: string,
    latitude: number,
    longitude: number,
    houseSystem: string
  ): NormalizedHouseResult {
    const jd = this.ephem.dateToJulianDay(new Date(isoUtc));
    const result = this.houseCalc.calculateHouses(jd, latitude, longitude, houseSystem);
    return {
      system: result.system,
      ascendant: result.ascendant,
      mc: result.mc,
      cusps: result.cusps.slice(1),
    };
  }

  getTransitsFromOffsets(input: {
    currentIsoUtc: string;
    transitingPlanetId: number;
    natalPlanetId: number;
    natalOffsetDegrees: number;
  }): NormalizedTransit[] {
    const currentJD = this.ephem.dateToJulianDay(new Date(input.currentIsoUtc));
    const transiting = this.ephem.getPlanetPosition(input.transitingPlanetId, currentJD);

    const natal: PlanetPosition = {
      planetId: input.natalPlanetId,
      planet: this.ephem.getPlanetPosition(input.natalPlanetId, currentJD).planet,
      longitude: (transiting.longitude + input.natalOffsetDegrees + 360) % 360,
      latitude: 0,
      distance: 1,
      speed: 1,
      sign: 'Aries',
      degree: 0,
      isRetrograde: false,
    };

    return this.transitCalc
      .findTransits([transiting], [natal], currentJD)
      .map((t) => this.normalizeTransit(t));
  }

  getTransits(
    transitingPlanets: PlanetPosition[],
    natalPlanets: PlanetPosition[],
    currentIsoUtc: string
  ): NormalizedTransit[] {
    const currentJD = this.ephem.dateToJulianDay(new Date(currentIsoUtc));
    return this.transitCalc
      .findTransits(transitingPlanets, natalPlanets, currentJD)
      .map((t) => this.normalizeTransit(t));
  }

  getExactRoots(
    planetId: number,
    targetLongitude: number,
    startIsoUtc: string,
    endIsoUtc: string
  ): NormalizedRoot[] {
    const startJD = this.ephem.dateToJulianDay(new Date(startIsoUtc));
    const endJD = this.ephem.dateToJulianDay(new Date(endIsoUtc));
    const roots = this.ephem.findExactTransitTimes(planetId, targetLongitude, startJD, endJD);
    return roots.map((jd) => ({ jd, isoUtc: this.ephem.julianDayToDate(jd).toISOString() }));
  }

  getRiseSet(
    isoUtc: string,
    planetId: number,
    latitude: number,
    longitude: number
  ): NormalizedRiseSet {
    const jd = this.ephem.dateToJulianDay(new Date(isoUtc));
    const result = this.riseSetCalc.calculateRiseSet(jd, planetId, latitude, longitude);
    return {
      body: result.planet,
      rise: result.rise?.toISOString(),
      set: result.set?.toISOString(),
      upperMeridianTransit: result.upperMeridianTransit?.toISOString(),
      lowerMeridianTransit: result.lowerMeridianTransit?.toISOString(),
    };
  }

  getNextEclipse(startIsoUtc: string, type: 'solar' | 'lunar'): NormalizedEclipse | null {
    const startJD = this.ephem.dateToJulianDay(new Date(startIsoUtc));
    const result =
      type === 'solar'
        ? this.eclipseCalc.findNextSolarEclipse(startJD)
        : this.eclipseCalc.findNextLunarEclipse(startJD);

    if (!result) {
      return null;
    }

    return {
      type: result.type,
      eclipseType: result.eclipseType,
      maxTime: result.maxTime.toISOString(),
    };
  }

  getElectionalContext(input: GetElectionalContextInput): NormalizedElectionalContext {
    const service = this.createService();
    const result = service.getElectionalContext(input);
    const data = result.data as {
      input: { house_system: string; instant_utc: string };
      sect: {
        classification: 'day' | 'night';
        is_day_chart: boolean;
        sun_altitude_degrees: number;
      };
      moon: { applying_aspects?: unknown[] };
      applying_aspects?: unknown[];
      ruler_basics?: unknown;
      meta: { warnings: string[] };
    };

    const instantUtc = new Date(data.input.instant_utc);
    const jdUt = this.ephem.dateToJulianDay(instantUtc);
    const sun = this.ephem.getPlanetPosition(PLANETS.SUN, jdUt);
    const rawSunAltitudeDegrees = this.ephem.getHorizontalCoordinates(
      jdUt,
      sun,
      input.longitude,
      input.latitude
    ).trueAltitude;

    return {
      houseSystem: data.input.house_system,
      classification: data.sect.classification,
      isDayChart: data.sect.is_day_chart,
      sunAltitudeDegrees: data.sect.sun_altitude_degrees,
      rawSunAltitudeDegrees,
      sunAltitudeDisplaysZero:
        data.sect.sun_altitude_degrees === 0 || Object.is(data.sect.sun_altitude_degrees, -0),
      warnings: data.meta.warnings,
      hasApplyingAspects: Array.isArray(data.applying_aspects),
      applyingAspectCount: data.applying_aspects?.length ?? 0,
      hasMoonApplyingAspects: Array.isArray(data.moon.applying_aspects),
      moonApplyingAspectCount: data.moon.applying_aspects?.length ?? 0,
      hasRulerBasics: data.ruler_basics !== undefined,
    };
  }

  getRisingSignWindows(input: GetRisingSignWindowsInput): NormalizedRisingSignWindowResult {
    const service = this.createService();
    const result = service.getRisingSignWindows(input);
    const data = result.data as {
      date: string;
      timezone: string;
      mode: 'approximate' | 'exact';
      windows: Array<{
        sign: string;
        start: string;
        end: string;
        durationMs: number;
      }>;
    };

    return {
      date: data.date,
      timezone: data.timezone,
      mode: data.mode,
      windows: data.windows.map((window) => ({ ...window })),
    };
  }

  getServiceTransits(input: {
    natalChart: ServiceTransitNatalFixture;
    transitInput: GetTransitsInput;
    startupDefaults?: McpStartupDefaults;
  }): NormalizedServiceTransitResult {
    const service = this.createService(input.startupDefaults);
    const targetDate = this.resolveTransitTargetDate(
      input.transitInput.date,
      input.natalChart.timezone
    );
    const natalChart = this.buildNatalChartFromOffsets(input.natalChart, targetDate);
    const result = service.getTransits(natalChart, input.transitInput);
    const data = result.data as {
      mode?: 'snapshot' | 'best_hit' | 'forecast';
      mode_source?: 'legacy_default' | 'explicit';
      date?: string;
      timezone: string;
      calculation_timezone?: string;
      reporting_timezone?: string;
      days_ahead?: number;
      window_start?: string;
      window_end?: string;
      transits?: Array<Record<string, unknown>>;
      forecast?: Array<{
        date: string;
        transits: Array<Record<string, unknown>>;
      }>;
    };

    return {
      mode: data.mode,
      modeSource: data.mode_source,
      date: data.date,
      timezone: data.timezone,
      calculationTimezone: data.calculation_timezone,
      reportingTimezone: data.reporting_timezone,
      daysAhead: data.days_ahead,
      windowStart: data.window_start,
      windowEnd: data.window_end,
      transits: data.transits?.map((transit) => this.normalizeServiceTransit(transit)),
      forecast: data.forecast?.map((day) => ({
        date: day.date,
        transits: day.transits.map((transit) => this.normalizeServiceTransit(transit)),
      })),
    };
  }

  getAscendantSignAt(isoUtc: string, latitude: number, longitude: number): string {
    const jd = this.ephem.dateToJulianDay(new Date(isoUtc));
    const houses = this.houseCalc.calculateHouses(jd, latitude, longitude, 'P');
    const ascendant = normalizeLongitude(houses.ascendant);
    return ZODIAC_SIGNS[Math.floor(ascendant / 30)];
  }

  canComputeRiseSet(): boolean {
    try {
      const probeJd = this.ephem.dateToJulianDay(new Date('2024-03-26T12:00:00Z'));
      this.riseSetCalc.calculateRiseSet(probeJd, 0, 34.0522, -118.2437);
      return true;
    } catch (error) {
      return !String(error).includes('is not a function');
    }
  }

  canComputeEclipses(): boolean {
    try {
      const probeJd = this.ephem.dateToJulianDay(new Date('2024-03-26T00:00:00Z'));
      this.ephem.eph?.sol_eclipse_when_glob(probeJd, 0, 0, false);
      this.ephem.eph?.lun_eclipse_when(probeJd, 0, 0, false);
      return true;
    } catch (error) {
      return !String(error).includes('is not a function');
    }
  }

  normalizeBody(p: PlanetPosition): NormalizedBody {
    return {
      body: p.planet,
      longitude: p.longitude,
      latitude: p.latitude,
      speed: p.speed,
      retrograde: p.isRetrograde,
    };
  }

  normalizeTransit(t: Transit): NormalizedTransit {
    return {
      transitingPlanet: t.transitingPlanet,
      natalPlanet: t.natalPlanet,
      aspect: t.aspect,
      orb: t.orb,
      exactTime: t.exactTime?.toISOString(),
      exactTimeStatus: t.exactTimeStatus,
      isApplying: t.isApplying,
    };
  }

  private createService(startupDefaults: McpStartupDefaults = {}): AstroService {
    return new AstroService({
      ephem: this.ephem,
      transitCalc: this.transitCalc,
      houseCalc: this.houseCalc,
      riseSetCalc: this.riseSetCalc,
      eclipseCalc: this.eclipseCalc,
      mcpStartupDefaults: startupDefaults,
      now: () => new Date(this.validationNow.getTime()),
    });
  }

  private resolveTransitTargetDate(dateStr: string | undefined, calculationTimezone: string): Date {
    if (dateStr) {
      return localToUTC(parseDateOnlyInput(dateStr), calculationTimezone);
    }

    const localNow = utcToLocal(this.validationNow, calculationTimezone);
    return localToUTC({ ...localNow, hour: 12, minute: 0, second: 0 }, calculationTimezone);
  }

  private buildNatalChartFromOffsets(
    fixture: ServiceTransitNatalFixture,
    targetDate: Date
  ): NatalChart {
    const targetJulianDay = this.ephem.dateToJulianDay(targetDate);
    const birthInstant = new Date(fixture.julianDayIsoUtc);
    const birthDate = utcToLocal(birthInstant, fixture.timezone);
    const utcBirthDate = utcToLocal(birthInstant, 'UTC');

    const planets = fixture.planetOffsets.map(
      ({ transitingPlanetId, natalPlanetId, natalOffsetDegrees }) => {
        const transiting = this.ephem.getPlanetPosition(transitingPlanetId, targetJulianDay);
        const natalBase = this.ephem.getPlanetPosition(natalPlanetId, targetJulianDay);
        const longitude = (transiting.longitude + natalOffsetDegrees + 360) % 360;
        const placement = getSignAndDegree(longitude);

        return {
          ...natalBase,
          planetId: natalPlanetId,
          longitude,
          sign: placement.sign,
          degree: placement.degree,
        };
      }
    );

    return {
      name: fixture.name,
      birthDate,
      location: {
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        timezone: fixture.timezone,
      },
      planets,
      julianDay: this.ephem.dateToJulianDay(birthInstant),
      houseSystem: fixture.houseSystem ?? 'P',
      requestedHouseSystem: fixture.houseSystem,
      utcDateTime: utcBirthDate,
    };
  }

  private normalizeServiceTransit(transit: Record<string, unknown>): NormalizedServiceTransit {
    return {
      transitingPlanet: String(transit.transitingPlanet),
      natalPlanet: String(transit.natalPlanet),
      aspect: String(transit.aspect),
      orb: Number(transit.orb),
      exactTime: typeof transit.exactTime === 'string' ? transit.exactTime : undefined,
      exactTimeStatus:
        transit.exactTimeStatus === 'within_preview' ||
        transit.exactTimeStatus === 'outside_preview' ||
        transit.exactTimeStatus === 'not_found' ||
        transit.exactTimeStatus === 'unsupported_body'
          ? transit.exactTimeStatus
          : undefined,
      isApplying: Boolean(transit.isApplying),
      transitSign: typeof transit.transitSign === 'string' ? transit.transitSign : undefined,
      transitDegree: typeof transit.transitDegree === 'number' ? transit.transitDegree : undefined,
      transitHouse: typeof transit.transitHouse === 'number' ? transit.transitHouse : undefined,
      natalSign: typeof transit.natalSign === 'string' ? transit.natalSign : undefined,
      natalDegree: typeof transit.natalDegree === 'number' ? transit.natalDegree : undefined,
      natalHouse: typeof transit.natalHouse === 'number' ? transit.natalHouse : undefined,
    };
  }
}
