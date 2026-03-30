import type { EclipseCalculator } from '../eclipses.js';
import type { EphemerisCalculator } from '../ephemeris.js';
import type { RiseSetCalculator } from '../riseset.js';
import { localToUTC, utcToLocal } from '../time-utils.js';
import { ASTEROIDS, type NatalChart, NODES, PLANETS } from '../types.js';
import type { ServiceResult } from './service-types.js';

interface SkyServiceDependencies {
  ephem: EphemerisCalculator;
  riseSetCalc: RiseSetCalculator;
  eclipseCalc: EclipseCalculator;
  now: () => Date;
  formatTimestamp: (date: Date, timezone: string) => string;
}

/**
 * Internal current-sky and runtime lookup workflow used by `AstroService`.
 *
 * @remarks
 * This module owns read-only runtime lookups that depend on "now", including
 * retrogrades, asteroid/node snapshots, rise/set tables, and eclipse queries.
 */
export class SkyService {
  private readonly ephem: EphemerisCalculator;
  private readonly riseSetCalc: RiseSetCalculator;
  private readonly eclipseCalc: EclipseCalculator;
  private readonly now: () => Date;
  private readonly formatTimestamp: (date: Date, timezone: string) => string;

  constructor(deps: SkyServiceDependencies) {
    this.ephem = deps.ephem;
    this.riseSetCalc = deps.riseSetCalc;
    this.eclipseCalc = deps.eclipseCalc;
    this.now = deps.now;
    this.formatTimestamp = deps.formatTimestamp;
  }

  /**
   * Return the currently retrograde planets for the requested reporting timezone.
   */
  getRetrogradePlanets(timezone?: string): ServiceResult<Record<string, unknown>> {
    const resolvedTimezone = timezone ?? 'UTC';
    const now = this.now();
    const jd = this.ephem.dateToJulianDay(now);
    const positions = this.ephem.getAllPlanets(jd, Object.values(PLANETS));
    const retrograde = positions.filter((position) => position.isRetrograde);

    const structuredData = {
      date: this.getDateLabel(now, resolvedTimezone),
      timezone: resolvedTimezone,
      reporting_timezone: resolvedTimezone,
      planets: retrograde,
    };

    const humanText =
      retrograde.length === 0
        ? 'No planets are currently retrograde.'
        : `Retrograde Planets:\n\n${retrograde.map((position) => `${position.planet}: ${position.degree.toFixed(2)}° ${position.sign}`).join('\n')}`;

    return { data: structuredData, text: humanText };
  }

  /**
   * Return the next rise and set events after the local day anchor for the chart location.
   */
  async getRiseSetTimes(
    natalChart: NatalChart,
    reportingTimezone: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const calculationTimezone = natalChart.location.timezone;
    const now = this.now();
    const localNow = utcToLocal(now, calculationTimezone);
    const localMidnight = {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const midnightUTC = localToUTC(localMidnight, calculationTimezone);

    const results = await this.riseSetCalc.getAllRiseSet(
      midnightUTC,
      natalChart.location.latitude,
      natalChart.location.longitude
    );

    const structuredData = {
      date: this.getDateLabel(now, calculationTimezone),
      timezone: calculationTimezone,
      calculation_timezone: calculationTimezone,
      reporting_timezone: reportingTimezone,
      times: results.map((result) => ({
        planet: result.planet,
        rise: result.rise?.toISOString() ?? null,
        set: result.set?.toISOString() ?? null,
      })),
    };

    const humanText = `Rise/Set Times:\n\n${results
      .map((result) => {
        const rise = result.rise ? this.formatTimestamp(result.rise, reportingTimezone) : 'none';
        const set = result.set ? this.formatTimestamp(result.set, reportingTimezone) : 'none';
        return `${result.planet}: Rise ${rise}, Set ${set}`;
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
    const resolvedTimezone = timezone ?? 'UTC';
    const now = this.now();
    const jd = this.ephem.dateToJulianDay(now);
    const positions = this.ephem.getAllPlanets(jd, [...ASTEROIDS, ...NODES]);

    const structuredData = {
      date: this.getDateLabel(now, resolvedTimezone),
      timezone: resolvedTimezone,
      reporting_timezone: resolvedTimezone,
      positions,
    };

    const humanText = `Asteroid & Node Positions:\n\n${positions
      .map((position) => {
        const retrogradeLabel = position.isRetrograde ? ' Rx' : '';
        return `${position.planet}: ${position.degree.toFixed(2)}° ${position.sign}${retrogradeLabel}`;
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
    const resolvedTimezone = timezone ?? 'UTC';
    const jd = this.ephem.dateToJulianDay(this.now());

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

    const structuredData = {
      timezone: resolvedTimezone,
      reporting_timezone: resolvedTimezone,
      eclipses,
    };
    const humanText =
      eclipses.length === 0
        ? 'No eclipses found in the near future.'
        : `Upcoming Eclipses:\n\n${humanLines.join('\n')}`;

    return { data: structuredData, text: humanText };
  }

  private getDateLabel(date: Date, timezone: string): string {
    const localDate = utcToLocal(date, timezone);
    return `${localDate.year}-${String(localDate.month).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;
  }
}
