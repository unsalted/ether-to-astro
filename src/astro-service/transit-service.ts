import type { McpStartupDefaults } from '../entrypoint.js';
import type { EphemerisCalculator } from '../ephemeris.js';
import type { HouseCalculator } from '../houses.js';
import { addLocalDays, localToUTC, utcToLocal } from '../time-utils.js';
import { deduplicateTransits, type TransitCalculator } from '../transits.js';
import {
  ASPECTS,
  type AspectType,
  type HouseData,
  type NatalChart,
  OUTER_PLANETS,
  PERSONAL_PLANETS,
  PLANET_IDS_BY_NAME,
  PLANETS,
  type PlanetPosition,
  type Transit,
  type TransitResponse,
} from '../types.js';
import { parseDateOnlyInput } from './date-input.js';
import type { GetTransitsInput, ServiceResult } from './service-types.js';
import {
  getHouseNumber,
  getSignAndDegree,
  normalizePlanetPlacement,
  resolveHouseSystem,
  resolveTimezones,
} from './shared.js';

/**
 * Serialized transit-to-transit aspect used for the optional mundane payload.
 */
interface MundaneAspect {
  id: string;
  planetA: PlanetPosition['planet'];
  planetB: PlanetPosition['planet'];
  aspect: AspectType;
  orb: number;
  isApplying: boolean;
  longitudeA: number;
  longitudeB: number;
}

/**
 * Lightweight supportive/challenging grouping for mundane aspect summaries.
 */
interface MundaneWeather {
  supportive: string[];
  challenging: string[];
}

/**
 * Per-day mundane transit bundle anchored to a reporting timezone label.
 */
interface MundaneDay {
  date: string;
  timezone: string;
  positions: PlanetPosition[];
  aspects: MundaneAspect[];
  weather: MundaneWeather;
}

/**
 * Dependencies needed by the extracted transit workflow.
 */
interface TransitServiceDependencies {
  ephem: EphemerisCalculator;
  transitCalc: TransitCalculator;
  houseCalc: HouseCalculator;
  mcpStartupDefaults: Readonly<McpStartupDefaults>;
  now: () => Date;
  formatTimestamp: (date: Date, timezone: string) => string;
}

/**
 * Internal transit workflow service used by `AstroService`.
 *
 * @remarks
 * This module owns transit-specific validation, aggregation, placement
 * enrichment, mundane expansion, and human-readable response formatting while
 * the public `AstroService` facade preserves the external contract.
 */
export class TransitService {
  private readonly ephem: EphemerisCalculator;
  private readonly transitCalc: TransitCalculator;
  private readonly houseCalc: HouseCalculator;
  private readonly mcpStartupDefaults: Readonly<McpStartupDefaults>;
  private readonly now: () => Date;
  private readonly formatTimestamp: (date: Date, timezone: string) => string;

  constructor(deps: TransitServiceDependencies) {
    this.ephem = deps.ephem;
    this.transitCalc = deps.transitCalc;
    this.houseCalc = deps.houseCalc;
    this.mcpStartupDefaults = deps.mcpStartupDefaults;
    this.now = deps.now;
    this.formatTimestamp = deps.formatTimestamp;
  }

  /**
   * Build the transit payload and readable text for a natal chart query.
   */
  getTransits(
    natalChart: NatalChart,
    input: GetTransitsInput = {}
  ): ServiceResult<Record<string, unknown>> {
    const dateStr = input.date;
    const categories = input.categories ?? ['all'];
    const includeMundane = input.include_mundane ?? false;
    const daysAhead = input.days_ahead ?? 0;
    const requestedMode = input.mode;
    const maxOrb = input.max_orb ?? 8;
    const exactOnly = input.exact_only ?? false;
    const applyingOnly = input.applying_only ?? false;

    if (!Number.isFinite(daysAhead) || daysAhead < 0) {
      throw new Error('days_ahead must be a finite number >= 0');
    }
    if (!Number.isFinite(maxOrb) || maxOrb < 0) {
      throw new Error('max_orb must be a finite number >= 0');
    }
    if (
      requestedMode !== undefined &&
      requestedMode !== 'snapshot' &&
      requestedMode !== 'best_hit' &&
      requestedMode !== 'forecast'
    ) {
      throw new Error('mode must be one of: snapshot, best_hit, forecast');
    }
    if (!natalChart.julianDay) {
      throw new Error('Natal chart is missing julianDay. Re-run set_natal_chart to fix.');
    }

    const mode = requestedMode ?? (daysAhead === 0 ? 'snapshot' : 'best_hit');
    const modeSource = requestedMode === undefined ? 'legacy_default' : 'explicit';
    const transitingPlanetIds = this.resolveTransitingPlanetIds(categories);
    const { calculationTimezone, reportingTimezone } = resolveTimezones(
      this.mcpStartupDefaults,
      input.timezone,
      natalChart.location.timezone
    );

    const targetDate = this.resolveTargetDate(dateStr, calculationTimezone);
    const allTransits: Transit[] = [];
    const transitsByDay = new Map<string, Transit[]>();
    const transitContext = new WeakMap<Transit, { julianDay: number }>();
    const startLocal = utcToLocal(targetDate, calculationTimezone);
    const effectiveDaysAhead = mode === 'snapshot' ? 0 : daysAhead;

    for (let day = 0; day <= effectiveDaysAhead; day++) {
      const dayUTC = addLocalDays(startLocal, calculationTimezone, day);
      const julianDay = this.ephem.dateToJulianDay(dayUTC);
      const transitingPlanets = this.ephem.getAllPlanets(julianDay, transitingPlanetIds);
      const transits = this.transitCalc.findTransits(
        transitingPlanets,
        natalChart.planets || [],
        julianDay
      );

      for (const transit of transits) {
        transitContext.set(transit, { julianDay });
      }

      allTransits.push(...transits);
      transitsByDay.set(this.formatDateLabel(utcToLocal(dayUTC, reportingTimezone)), transits);
    }

    const filterTransits = (transits: Transit[]): Transit[] => {
      let filtered = transits.filter((transit) => transit.orb <= maxOrb);
      if (exactOnly) {
        filtered = filtered.filter((transit) => transit.exactTime !== undefined);
      }
      if (applyingOnly) {
        filtered = filtered.filter((transit) => transit.isApplying);
      }
      filtered.sort((left, right) => left.orb - right.orb);
      return filtered;
    };

    const chartHouseSystem = resolveHouseSystem(natalChart, this.mcpStartupDefaults);
    const natalHouses = this.houseCalc.calculateHouses(
      natalChart.julianDay,
      natalChart.location.latitude,
      natalChart.location.longitude,
      chartHouseSystem
    );
    const transitHouseCache = new Map<number, HouseData>();
    const planetIdsByName = new Map(
      Object.entries(PLANET_IDS_BY_NAME).map(([planetName, planetId]) => [planetName, planetId])
    );
    const getTransitHouses = (julianDay: number): HouseData => {
      const cached = transitHouseCache.get(julianDay);
      if (cached) {
        return cached;
      }

      const houses = this.houseCalc.calculateHouses(
        julianDay,
        natalChart.location.latitude,
        natalChart.location.longitude,
        chartHouseSystem
      );
      transitHouseCache.set(julianDay, houses);
      return houses;
    };

    const serializeTransit = (transit: Transit) => {
      const transitPlacement = getSignAndDegree(transit.transitLongitude);
      const natalPlacement = getSignAndDegree(transit.natalLongitude);
      const context = transitContext.get(transit);
      const transitHouseJulianDay = transit.exactTime
        ? this.ephem.dateToJulianDay(transit.exactTime)
        : (context?.julianDay ?? this.ephem.dateToJulianDay(targetDate));
      const transitHouses = getTransitHouses(transitHouseJulianDay);
      const exactTransitLongitude =
        transit.exactTime && planetIdsByName.has(transit.transitingPlanet)
          ? this.ephem.getPlanetPosition(
              planetIdsByName.get(transit.transitingPlanet) as number,
              transitHouseJulianDay
            ).longitude
          : transit.transitLongitude;

      return {
        transitingPlanet: transit.transitingPlanet,
        aspect: transit.aspect,
        natalPlanet: transit.natalPlanet,
        orb: Number.parseFloat(transit.orb.toFixed(2)),
        isApplying: transit.isApplying,
        exactTimeStatus: transit.exactTimeStatus,
        exactTime: transit.exactTime?.toISOString(),
        transitLongitude: transit.transitLongitude,
        natalLongitude: transit.natalLongitude,
        transitSign: transitPlacement.sign,
        transitDegree: transitPlacement.degree,
        transitHouse: getHouseNumber(exactTransitLongitude, transitHouses),
        natalSign: natalPlacement.sign,
        natalDegree: natalPlacement.degree,
        natalHouse: getHouseNumber(transit.natalLongitude, natalHouses),
      };
    };

    const filteredTransits = filterTransits(deduplicateTransits(allTransits));
    const dateLabel = this.formatDateLabel(utcToLocal(targetDate, reportingTimezone));
    const windowEndLabel = this.formatDateLabel(
      utcToLocal(
        addLocalDays(startLocal, calculationTimezone, effectiveDaysAhead),
        reportingTimezone
      )
    );

    const structuredData: TransitResponse = {
      date: dateLabel,
      timezone: reportingTimezone,
      calculation_timezone: calculationTimezone,
      reporting_timezone: reportingTimezone,
      transits: filteredTransits.map(serializeTransit),
    };

    const metadata = {
      mode,
      mode_source: modeSource,
      days_ahead: effectiveDaysAhead,
      window_start: dateLabel,
      window_end: windowEndLabel,
    };

    let responseData: Record<string, unknown> = structuredData as unknown as Record<
      string,
      unknown
    >;
    let mundaneText = '';

    if (mode === 'forecast') {
      const forecastDays = Array.from(transitsByDay.entries())
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
        .map(([dayDate, dayTransits]) => ({
          date: dayDate,
          transits: filterTransits(deduplicateTransits(dayTransits)).map(serializeTransit),
        }));
      responseData = {
        ...metadata,
        timezone: reportingTimezone,
        calculation_timezone: calculationTimezone,
        reporting_timezone: reportingTimezone,
        forecast: forecastDays,
      };
    } else {
      responseData = {
        ...structuredData,
        ...metadata,
      };
    }

    if (includeMundane) {
      const mundaneDays: MundaneDay[] = [];
      for (let day = 0; day <= daysAhead; day++) {
        const dayUTC = addLocalDays(startLocal, calculationTimezone, day);
        mundaneDays.push(this.getMundaneDay(dayUTC, reportingTimezone, transitingPlanetIds));
      }

      const [anchorMundane] = mundaneDays;
      const mundaneData = {
        date: anchorMundane.date,
        timezone: anchorMundane.timezone,
        positions: anchorMundane.positions,
        aspects: anchorMundane.aspects,
        days: mundaneDays,
      };

      responseData = { transits: responseData, mundane: mundaneData };
      mundaneText = `\n\nCurrent Planetary Positions:\n\n${anchorMundane.positions
        .map(
          (position) =>
            `${position.planet}: ${position.degree.toFixed(1)}° ${position.sign} (${position.isRetrograde ? 'Rx' : 'Direct'})`
        )
        .join('\n')}`;
      if (mode === 'forecast') {
        mundaneText +=
          '\n\nNote: mundane positions remain anchored to the forecast start date in this mode.';
      }
    }

    const formatHumanTransit = (transit: Transit) => {
      const exactStr = transit.exactTime
        ? ` - Exact: ${this.formatTimestamp(transit.exactTime, reportingTimezone)}`
        : '';
      const applyStr = transit.isApplying ? '(applying)' : '(separating)';
      return `${transit.transitingPlanet} ${transit.aspect} ${transit.natalPlanet}: ${transit.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
    };
    const rangeStr = effectiveDaysAhead > 0 ? ` (next ${effectiveDaysAhead + 1} days)` : '';

    let transitHeader: string;
    if (mode === 'forecast') {
      const forecastLines = Array.from(transitsByDay.entries())
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
        .map(([dayDate, dayTransits]) => {
          const dedupedDay = filterTransits(deduplicateTransits(dayTransits));
          const lines =
            dedupedDay.length === 0
              ? 'No transits found matching the specified criteria.'
              : dedupedDay.map(formatHumanTransit).join('\n');
          return `${dayDate}:\n${lines}`;
        })
        .join('\n\n');
      transitHeader = `Forecast transits${rangeStr}:\n\n${forecastLines}`;
    } else {
      const humanLines = filteredTransits.map(formatHumanTransit).join('\n');
      const modeLabel = mode === 'snapshot' ? 'Transit snapshot' : 'Best-hit transits';
      transitHeader =
        filteredTransits.length > 0
          ? `${modeLabel}${rangeStr}:\n\n${humanLines}`
          : 'No transits found matching the specified criteria.';
    }

    return {
      data: responseData,
      text: transitHeader + mundaneText,
    };
  }

  /**
   * Resolve the query anchor instant for a transit lookup.
   *
   * @param dateStr - Optional YYYY-MM-DD date supplied by the caller
   * @param calculationTimezone - Timezone used for local-day interpretation
   * @returns UTC instant representing local noon on the requested day
   */
  private resolveTargetDate(dateStr: string | undefined, calculationTimezone: string): Date {
    if (dateStr) {
      const parsed = parseDateOnlyInput(dateStr);
      return localToUTC(parsed, calculationTimezone);
    }

    const now = this.now();
    const localNow = utcToLocal(now, calculationTimezone);
    return localToUTC({ ...localNow, hour: 12, minute: 0, second: 0 }, calculationTimezone);
  }

  /**
   * Expand category filters into the concrete transiting planet ids to compute.
   *
   * @param categories - Requested category filters from the transit input
   * @returns Deduplicated transiting planet ids in stable insertion order
   */
  private resolveTransitingPlanetIds(categories: string[]): number[] {
    const transitingPlanetIds: number[] = [];

    if (categories.includes('all')) {
      return Object.values(PLANETS);
    }

    if (categories.includes('moon')) {
      transitingPlanetIds.push(PLANETS.MOON);
    }
    if (categories.includes('personal')) {
      transitingPlanetIds.push(
        ...PERSONAL_PLANETS.filter((planetId) => !transitingPlanetIds.includes(planetId))
      );
    }
    if (categories.includes('outer')) {
      transitingPlanetIds.push(
        ...OUTER_PLANETS.filter((planetId) => !transitingPlanetIds.includes(planetId))
      );
    }

    return transitingPlanetIds;
  }

  /**
   * Derive a simple supportive/challenging weather summary from mundane aspects.
   *
   * @param aspects - Mundane aspects for a single reporting day
   * @returns Grouped weather identifiers keyed by tone
   */
  private getMundaneWeather(aspects: MundaneAspect[]): MundaneWeather {
    const supportiveAspects = new Set<AspectType>(['conjunction', 'trine', 'sextile']);
    const challengingAspects = new Set<AspectType>(['square', 'opposition']);

    return {
      supportive: aspects
        .filter((aspect) => supportiveAspects.has(aspect.aspect))
        .map((aspect) => aspect.id),
      challenging: aspects
        .filter((aspect) => challengingAspects.has(aspect.aspect))
        .map((aspect) => aspect.id),
    };
  }

  /**
   * Compute transit-to-transit mundane aspects for a single day's positions.
   *
   * @param date - Reporting date label used in stable aspect ids
   * @param positions - Transiting planetary positions for the day
   * @returns Sorted mundane aspects with orb and applying metadata
   */
  private getMundaneAspects(date: string, positions: PlanetPosition[]): MundaneAspect[] {
    const aspects: MundaneAspect[] = [];

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const planetA = positions[i];
        const planetB = positions[j];
        const angle = this.ephem.calculateAspectAngle(planetA.longitude, planetB.longitude);

        for (const aspect of ASPECTS) {
          const orb = Math.abs(angle - aspect.angle);
          if (orb > aspect.orb) {
            continue;
          }

          const futureLongitudeA = (planetA.longitude + planetA.speed * 0.1 + 360) % 360;
          const futureLongitudeB = (planetB.longitude + planetB.speed * 0.1 + 360) % 360;
          const futureAngle = this.ephem.calculateAspectAngle(futureLongitudeA, futureLongitudeB);
          const futureOrb = Math.abs(futureAngle - aspect.angle);

          aspects.push({
            id: `${date}:${planetA.planet}-${aspect.name}-${planetB.planet}`,
            planetA: planetA.planet,
            planetB: planetB.planet,
            aspect: aspect.name,
            orb: Number.parseFloat(orb.toFixed(2)),
            isApplying: futureOrb < orb,
            longitudeA: planetA.longitude,
            longitudeB: planetB.longitude,
          });
        }
      }
    }

    return aspects.sort(
      (left, right) =>
        left.orb - right.orb ||
        left.planetA.localeCompare(right.planetA) ||
        left.planetB.localeCompare(right.planetB) ||
        left.aspect.localeCompare(right.aspect)
    );
  }

  /**
   * Build the optional mundane payload for one transit day.
   *
   * @param dayUTC - UTC instant representing the day anchor
   * @param timezone - Reporting timezone used for day labels
   * @param transitingPlanetIds - Planet ids included in the mundane calculation
   * @returns Daily mundane bundle with positions, aspects, and weather
   */
  private getMundaneDay(dayUTC: Date, timezone: string, transitingPlanetIds: number[]): MundaneDay {
    const localDay = utcToLocal(dayUTC, timezone);
    const dateLabel = this.formatDateLabel(localDay);
    const currentJD = this.ephem.dateToJulianDay(dayUTC);
    const positions = this.ephem
      .getAllPlanets(currentJD, transitingPlanetIds)
      .map(normalizePlanetPlacement);
    const aspects = this.getMundaneAspects(dateLabel, positions);

    return {
      date: dateLabel,
      timezone,
      positions,
      aspects,
      weather: this.getMundaneWeather(aspects),
    };
  }

  /**
   * Format a local date tuple into the service's canonical YYYY-MM-DD label.
   */
  private formatDateLabel(localDate: { year: number; month: number; day: number }): string {
    return `${localDate.year}-${String(localDate.month).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;
  }
}
