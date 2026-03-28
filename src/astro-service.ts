import { writeFile } from 'node:fs/promises';
import { Temporal } from '@js-temporal/polyfill';
import { ChartRenderer } from './charts.js';
import { getDefaultTheme } from './constants.js';
import { EclipseCalculator } from './eclipses.js';
import { EphemerisCalculator } from './ephemeris.js';
import { formatDateOnly, formatInTimezone } from './formatter.js';
import { HouseCalculator } from './houses.js';
import { RiseSetCalculator } from './riseset.js';
import {
  addLocalDays,
  type Disambiguation,
  getTimezoneOffset,
  localToUTC,
  utcToLocal,
} from './time-utils.js';
import { deduplicateTransits, TransitCalculator } from './transits.js';
import {
  ASTEROIDS,
  type HouseSystem,
  type NatalChart,
  NODES,
  OUTER_PLANETS,
  PERSONAL_PLANETS,
  PLANETS,
  type PlanetPositionResponse,
  type Transit,
  type TransitResponse,
  ZODIAC_SIGNS,
} from './types.js';

interface AstroServiceDependencies {
  ephem?: EphemerisCalculator;
  transitCalc?: TransitCalculator;
  houseCalc?: HouseCalculator;
  riseSetCalc?: RiseSetCalculator;
  eclipseCalc?: EclipseCalculator;
  chartRenderer?: ChartRenderer;
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
  max_orb?: number;
  exact_only?: boolean;
  applying_only?: boolean;
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

export interface ChartServiceResult {
  format: 'svg' | 'png' | 'webp';
  outputPath?: string;
  text: string;
  svg?: string;
  image?: {
    data: string;
    mimeType: string;
  };
}

export function parseDateOnlyInput(dateStr: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, got "${dateStr}"`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month} (must be 1-12)`);
  }
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day: ${day} (must be 1-31)`);
  }

  try {
    Temporal.PlainDate.from({ year, month, day });
  } catch {
    throw new Error(`Invalid calendar date: ${dateStr}`);
  }

  return { year, month, day, hour: 12, minute: 0 };
}

export class AstroService {
  readonly ephem: EphemerisCalculator;
  readonly transitCalc: TransitCalculator;
  readonly houseCalc: HouseCalculator;
  readonly riseSetCalc: RiseSetCalculator;
  readonly eclipseCalc: EclipseCalculator;
  readonly chartRenderer: ChartRenderer;
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
    this.now = deps.now ?? (() => new Date());
    this.writeFileFn = deps.writeFile ?? writeFile;
  }

  async init(): Promise<void> {
    await this.ephem.init();
  }

  isInitialized(): boolean {
    return !!this.ephem.eph;
  }

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

  getTransits(
    natalChart: NatalChart,
    input: GetTransitsInput = {}
  ): ServiceResult<Record<string, unknown>> {
    const dateStr = input.date;
    const categories = input.categories ?? ['all'];
    const includeMundane = input.include_mundane ?? false;
    const daysAhead = input.days_ahead ?? 0;
    const maxOrb = input.max_orb ?? 8;
    const exactOnly = input.exact_only ?? false;
    const applyingOnly = input.applying_only ?? false;

    if (daysAhead < 0) {
      throw new Error('days_ahead must be >= 0');
    }
    if (maxOrb < 0) {
      throw new Error('max_orb must be >= 0');
    }

    let transitingPlanetIds: number[] = [];
    if (categories.includes('all')) {
      transitingPlanetIds = Object.values(PLANETS);
    } else {
      if (categories.includes('moon')) transitingPlanetIds.push(PLANETS.MOON);
      if (categories.includes('personal')) {
        transitingPlanetIds.push(
          ...PERSONAL_PLANETS.filter((p) => !transitingPlanetIds.includes(p))
        );
      }
      if (categories.includes('outer')) {
        transitingPlanetIds.push(...OUTER_PLANETS.filter((p) => !transitingPlanetIds.includes(p)));
      }
    }

    const timezone = natalChart.location.timezone;

    let targetDate: Date;
    if (dateStr) {
      const parsed = parseDateOnlyInput(dateStr);
      targetDate = localToUTC(parsed, timezone);
    } else {
      const now = this.now();
      const localNow = utcToLocal(now, timezone);
      const localNoon = { ...localNow, hour: 12, minute: 0, second: 0 };
      targetDate = localToUTC(localNoon, timezone);
    }

    const allTransits: Transit[] = [];
    const startLocal = utcToLocal(targetDate, timezone);
    for (let day = 0; day <= daysAhead; day++) {
      const dayUTC = addLocalDays(startLocal, timezone, day);
      const jd = this.ephem.dateToJulianDay(dayUTC);
      const transitingPlanets = this.ephem.getAllPlanets(jd, transitingPlanetIds);
      const transits = this.transitCalc.findTransits(
        transitingPlanets,
        natalChart.planets || [],
        jd
      );
      allTransits.push(...transits);
    }

    let filteredTransits = deduplicateTransits(allTransits);
    filteredTransits = filteredTransits.filter((t) => t.orb <= maxOrb);
    if (exactOnly) filteredTransits = filteredTransits.filter((t) => t.exactTime !== undefined);
    if (applyingOnly) filteredTransits = filteredTransits.filter((t) => t.isApplying);
    filteredTransits.sort((a, b) => a.orb - b.orb);

    const localDate = utcToLocal(targetDate, timezone);
    const dateLabel = `${localDate.year}-${String(localDate.month).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;

    const structuredData: TransitResponse = {
      date: dateLabel,
      timezone,
      transits: filteredTransits.map((t) => ({
        transitingPlanet: t.transitingPlanet,
        aspect: t.aspect,
        natalPlanet: t.natalPlanet,
        orb: Number.parseFloat(t.orb.toFixed(2)),
        isApplying: t.isApplying,
        exactTimeStatus: t.exactTimeStatus,
        exactTime: t.exactTime?.toISOString(),
        transitLongitude: t.transitLongitude,
        natalLongitude: t.natalLongitude,
      })),
    };

    let responseData: Record<string, unknown> = structuredData as unknown as Record<
      string,
      unknown
    >;
    let mundaneText = '';

    if (includeMundane) {
      const currentJD = this.ephem.dateToJulianDay(targetDate);
      const currentPositions = this.ephem.getAllPlanets(currentJD, transitingPlanetIds);
      const mundaneData: PlanetPositionResponse = {
        date: dateLabel,
        timezone,
        positions: currentPositions,
      };
      responseData = { transits: structuredData, mundane: mundaneData };
      mundaneText = `\n\nCurrent Planetary Positions:\n\n${currentPositions
        .map(
          (p) =>
            `${p.planet}: ${p.degree.toFixed(1)}° ${p.sign} (${p.isRetrograde ? 'Rx' : 'Direct'})`
        )
        .join('\n')}`;
    }

    const humanLines = filteredTransits
      .map((t) => {
        const exactStr = t.exactTime ? ` - Exact: ${formatInTimezone(t.exactTime, timezone)}` : '';
        const applyStr = t.isApplying ? '(applying)' : '(separating)';
        return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
      })
      .join('\n');

    const rangeStr = daysAhead > 0 ? ` (next ${daysAhead + 1} days)` : '';
    const transitHeader =
      filteredTransits.length > 0
        ? `Transits${rangeStr}:\n\n${humanLines}`
        : 'No transits found matching the specified criteria.';

    return {
      data: responseData,
      text: transitHeader + mundaneText,
    };
  }

  getHouses(
    natalChart: NatalChart,
    input: GetHousesInput = {}
  ): ServiceResult<Record<string, unknown>> {
    const system = input.system || natalChart.houseSystem || 'P';
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

  getRisingSignWindows(input: GetRisingSignWindowsInput): ServiceResult<Record<string, unknown>> {
    const mode = input.mode ?? 'approximate';
    if (mode !== 'approximate' && mode !== 'exact') {
      throw new Error(`Invalid mode: ${mode} (must be approximate or exact)`);
    }
    if (input.latitude < -90 || input.latitude > 90) {
      throw new Error(`Invalid latitude: ${input.latitude} (must be between -90 and 90)`);
    }
    if (input.longitude < -180 || input.longitude > 180) {
      throw new Error(`Invalid longitude: ${input.longitude} (must be between -180 and 180)`);
    }

    const parsed = parseDateOnlyInput(input.date);
    try {
      utcToLocal(new Date(), input.timezone);
    } catch {
      throw new Error(`Invalid timezone: ${input.timezone}`);
    }

    const dayStartLocal = {
      year: parsed.year,
      month: parsed.month,
      day: parsed.day,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const dayStartUtc = localToUTC(dayStartLocal, input.timezone);
    const dayEndUtc = addLocalDays(dayStartLocal, input.timezone, 1);

    const getAscSign = (date: Date): { sign: string; longitude: number } => {
      const jd = this.ephem.dateToJulianDay(date);
      const houses = this.houseCalc.calculateHouses(jd, input.latitude, input.longitude, 'P');
      const normalized = ((houses.ascendant % 360) + 360) % 360;
      return { sign: ZODIAC_SIGNS[Math.floor(normalized / 30)], longitude: normalized };
    };

    const refineBoundary = (left: Date, right: Date): Date => {
      const leftSign = getAscSign(left).sign;
      let lo = left;
      let hi = right;
      for (let i = 0; i < 25; i++) {
        const mid = new Date((lo.getTime() + hi.getTime()) / 2);
        const midSign = getAscSign(mid).sign;
        if (midSign === leftSign) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return hi;
    };

    const toLocalTimestamp = (utcDate: Date): string => {
      const local = utcToLocal(utcDate, input.timezone);
      const offsetMinutes = getTimezoneOffset(utcDate, input.timezone);
      const offsetSign = offsetMinutes >= 0 ? '+' : '-';
      const offsetAbs = Math.abs(offsetMinutes);
      const offsetHours = String(Math.floor(offsetAbs / 60)).padStart(2, '0');
      const offsetMins = String(offsetAbs % 60).padStart(2, '0');

      return `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}T${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:${String(local.second ?? 0).padStart(2, '0')}${offsetSign}${offsetHours}:${offsetMins}`;
    };

    const findSignTransitionsInBucket = (start: Date, end: Date, probeStepMs: number): Date[] => {
      const boundaries: Date[] = [];
      let probeCursor = start;
      let currentSign = getAscSign(probeCursor).sign;

      while (probeCursor < end) {
        const probeNext = new Date(Math.min(probeCursor.getTime() + probeStepMs, end.getTime()));
        const nextSign = getAscSign(probeNext).sign;
        if (nextSign !== currentSign) {
          boundaries.push(mode === 'exact' ? refineBoundary(probeCursor, probeNext) : probeNext);
        }
        probeCursor = probeNext;
        currentSign = nextSign;
      }

      return boundaries;
    };

    const stepMs = mode === 'exact' ? 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    const probeStepMs = mode === 'exact' ? 5 * 60 * 1000 : 30 * 60 * 1000;
    const boundaries: Date[] = [dayStartUtc];
    let cursor = dayStartUtc;
    while (cursor < dayEndUtc) {
      const next = new Date(Math.min(cursor.getTime() + stepMs, dayEndUtc.getTime()));
      boundaries.push(...findSignTransitionsInBucket(cursor, next, probeStepMs));
      cursor = next;
    }
    boundaries.push(dayEndUtc);

    const windows = boundaries.slice(0, -1).map((start, i) => {
      const end = boundaries[i + 1];
      const sample = new Date((start.getTime() + end.getTime()) / 2);
      const sign = getAscSign(sample).sign;
      return {
        sign,
        start: toLocalTimestamp(start),
        end: toLocalTimestamp(end),
        durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
      };
    });

    const structuredData = {
      date: input.date,
      timezone: input.timezone,
      location: {
        latitude: input.latitude,
        longitude: input.longitude,
      },
      mode,
      windows,
    };

    const humanText = `Rising Sign Windows (${input.date}, ${input.timezone}, ${mode}):\n\n${windows
      .map(
        (window) =>
          `${window.sign}: ${formatInTimezone(new Date(window.start), input.timezone)} → ${formatInTimezone(new Date(window.end), input.timezone)}`
      )
      .join('\n')}`;

    return {
      data: structuredData,
      text: humanText,
    };
  }

  getRetrogradePlanets(timezone = 'UTC'): ServiceResult<Record<string, unknown>> {
    const now = this.now();
    const jd = this.ephem.dateToJulianDay(now);
    const allPlanetIds = Object.values(PLANETS);
    const positions = this.ephem.getAllPlanets(jd, allPlanetIds);
    const retrograde = positions.filter((p) => p.isRetrograde);

    const localNow = utcToLocal(now, timezone);
    const dateLabel = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(localNow.day).padStart(2, '0')}`;

    const structuredData = {
      date: dateLabel,
      timezone,
      planets: retrograde,
    };

    const humanText =
      retrograde.length === 0
        ? 'No planets are currently retrograde.'
        : `Retrograde Planets:\n\n${retrograde.map((p) => `${p.planet}: ${p.degree.toFixed(2)}° ${p.sign}`).join('\n')}`;

    return { data: structuredData, text: humanText };
  }

  async getRiseSetTimes(natalChart: NatalChart): Promise<ServiceResult<Record<string, unknown>>> {
    const timezone = natalChart.location.timezone;
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
        const rise = r.rise ? formatInTimezone(r.rise, timezone) : 'none';
        const set = r.set ? formatInTimezone(r.set, timezone) : 'none';
        return `${r.planet}: Rise ${rise}, Set ${set}`;
      })
      .join('\n')}`;

    return {
      data: structuredData,
      text: humanText,
    };
  }

  getAsteroidPositions(timezone = 'UTC'): ServiceResult<Record<string, unknown>> {
    const now = this.now();
    const jd = this.ephem.dateToJulianDay(now);
    const asteroidIds = [...ASTEROIDS, ...NODES];
    const positions = this.ephem.getAllPlanets(jd, asteroidIds);

    const localNow = utcToLocal(now, timezone);
    const dateLabel = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(localNow.day).padStart(2, '0')}`;

    const structuredData = {
      date: dateLabel,
      timezone,
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

  getNextEclipses(timezone = 'UTC'): ServiceResult<Record<string, unknown>> {
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
        `Next Solar Eclipse: ${formatInTimezone(solarEclipse.maxTime, timezone)} (${solarEclipse.eclipseType})`
      );
    }

    if (lunarEclipse) {
      eclipses.push({
        type: lunarEclipse.type,
        eclipseType: lunarEclipse.eclipseType,
        maxTime: lunarEclipse.maxTime.toISOString(),
      });
      humanLines.push(
        `Next Lunar Eclipse: ${formatInTimezone(lunarEclipse.maxTime, timezone)} (${lunarEclipse.eclipseType})`
      );
    }

    const structuredData = { timezone, eclipses };
    const humanText =
      eclipses.length === 0
        ? 'No eclipses found in the near future.'
        : `Upcoming Eclipses:\n\n${humanLines.join('\n')}`;

    return { data: structuredData, text: humanText };
  }

  getServerStatus(natalChart: NatalChart | null): ServiceResult<Record<string, unknown>> {
    const statusData = {
      serverVersion: '1.0.0',
      hasNatalChart: natalChart !== null,
      natalChartName: natalChart?.name ?? null,
      natalChartTimezone: natalChart?.location.timezone ?? null,
      ephemerisInitialized: this.isInitialized(),
      stateModel: 'stateful-per-process',
    };

    const humanText = natalChart
      ? `Server ready. Natal chart loaded: ${natalChart.name} (${natalChart.location.timezone})`
      : 'Server ready. No natal chart loaded — call set_natal_chart first.';

    return { data: statusData, text: humanText };
  }

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
