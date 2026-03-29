import type { McpStartupDefaults } from '../entrypoint.js';
import type { EphemerisCalculator } from '../ephemeris.js';
import type { HouseCalculator } from '../houses.js';
import { type Disambiguation, localToUTC, utcToLocal } from '../time-utils.js';
import { type HouseSystem, type NatalChart, PLANETS, ZODIAC_SIGNS } from '../types.js';
import { resolveHouseSystem } from './shared.js';

interface SetNatalChartInput {
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

interface GetHousesInput {
  system?: string;
}

interface ServiceResult<T> {
  data: T;
  text: string;
}

interface NatalServiceDependencies {
  ephem: EphemerisCalculator;
  houseCalc: HouseCalculator;
  mcpStartupDefaults: Readonly<McpStartupDefaults>;
  isInitialized: () => boolean;
}

/**
 * Internal natal/chart-state workflow used by `AstroService`.
 *
 * @remarks
 * This module owns natal chart initialization, house resolution, and basic
 * server-status serialization while the public `AstroService` facade preserves
 * the existing contract for MCP and CLI callers.
 */
export class NatalService {
  private readonly ephem: EphemerisCalculator;
  private readonly houseCalc: HouseCalculator;
  private readonly mcpStartupDefaults: Readonly<McpStartupDefaults>;
  private readonly isInitialized: () => boolean;

  constructor(deps: NatalServiceDependencies) {
    this.ephem = deps.ephem;
    this.houseCalc = deps.houseCalc;
    this.mcpStartupDefaults = deps.mcpStartupDefaults;
    this.isInitialized = deps.isInitialized;
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

    const sun = positions.find((position) => position.planet === 'Sun');
    const moon = positions.find((position) => position.planet === 'Moon');
    if (!sun || !moon) {
      throw new Error('Ephemeris failed to compute Sun/Moon positions for natal chart.');
    }

    const formatDegree = (longitude: number): string => {
      const sign = ZODIAC_SIGNS[Math.floor(longitude / 30)];
      const degree = longitude % 30;
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
      .map((degree, index) => {
        const sign = ZODIAC_SIGNS[Math.floor(degree / 30)];
        return `House ${index + 1}: ${(degree % 30).toFixed(2)}° ${sign}`;
      })
      .join('\n');
    const humanText = `Houses (${houses.system}):\nAsc: ${houses.ascendant.toFixed(2)}° | MC: ${houses.mc.toFixed(2)}°\n\n${humanLines}`;

    return {
      data: houses as unknown as Record<string, unknown>,
      text: humanText,
    };
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
}
