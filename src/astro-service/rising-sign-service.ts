import type { EphemerisCalculator } from '../ephemeris.js';
import { formatInTimezone } from '../formatter.js';
import type { HouseCalculator } from '../houses.js';
import {
  addLocalDays,
  formatLocalTimestampWithOffset,
  localToUTC,
  utcToLocal,
} from '../time-utils.js';
import { ZODIAC_SIGNS } from '../types.js';
import { parseDateOnlyInput } from './date-input.js';
import type { GetRisingSignWindowsInput, ServiceResult } from './service-types.js';
import { normalizeLongitude } from './shared.js';

interface RisingSignServiceDependencies {
  ephem: EphemerisCalculator;
  houseCalc: HouseCalculator;
}

/**
 * Internal rising-sign window scanner used by `AstroService`.
 *
 * @remarks
 * This module owns the local-day scan, optional exact-boundary refinement, and
 * serialization of sign windows while the public facade keeps the same method
 * signature and result shape.
 */
export class RisingSignService {
  private readonly ephem: EphemerisCalculator;
  private readonly houseCalc: HouseCalculator;

  constructor(deps: RisingSignServiceDependencies) {
    this.ephem = deps.ephem;
    this.houseCalc = deps.houseCalc;
  }

  /**
   * Find rising-sign windows across a local calendar day.
   */
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

    const stepMs = mode === 'exact' ? 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    const probeStepMs = mode === 'exact' ? 5 * 60 * 1000 : 30 * 60 * 1000;
    const boundaries: Date[] = [dayStartUtc];
    let cursor = dayStartUtc;
    while (cursor < dayEndUtc) {
      const next = new Date(Math.min(cursor.getTime() + stepMs, dayEndUtc.getTime()));
      boundaries.push(...this.findSignTransitionsInBucket(input, mode, cursor, next, probeStepMs));
      cursor = next;
    }
    boundaries.push(dayEndUtc);

    const windows = boundaries.slice(0, -1).map((start, index) => {
      const end = boundaries[index + 1];
      const sample = new Date((start.getTime() + end.getTime()) / 2);
      const sign = this.getAscSign(input, sample).sign;
      return {
        sign,
        start: formatLocalTimestampWithOffset(start, input.timezone),
        end: formatLocalTimestampWithOffset(end, input.timezone),
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

  /**
   * Sample the ascendant sign for a specific moment.
   */
  private getAscSign(
    input: Pick<GetRisingSignWindowsInput, 'latitude' | 'longitude'>,
    date: Date
  ): { sign: string; longitude: number } {
    const jd = this.ephem.dateToJulianDay(date);
    const houses = this.houseCalc.calculateHouses(jd, input.latitude, input.longitude, 'P');
    const normalized = normalizeLongitude(houses.ascendant);
    return { sign: ZODIAC_SIGNS[Math.floor(normalized / 30)], longitude: normalized };
  }

  /**
   * Binary-search a sign change down to a stable exact-mode boundary.
   */
  private refineBoundary(
    input: Pick<GetRisingSignWindowsInput, 'latitude' | 'longitude'>,
    left: Date,
    right: Date
  ): Date {
    const leftSign = this.getAscSign(input, left).sign;
    let lo = left;
    let hi = right;
    for (let i = 0; i < 25; i++) {
      const mid = new Date((lo.getTime() + hi.getTime()) / 2);
      const midSign = this.getAscSign(input, mid).sign;
      if (midSign === leftSign) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return hi;
  }

  /**
   * Probe a scan bucket and emit every sign transition inside it.
   */
  private findSignTransitionsInBucket(
    input: Pick<GetRisingSignWindowsInput, 'latitude' | 'longitude'>,
    mode: 'approximate' | 'exact',
    start: Date,
    end: Date,
    probeStepMs: number
  ): Date[] {
    const boundaries: Date[] = [];
    let probeCursor = start;
    let currentSign = this.getAscSign(input, probeCursor).sign;

    while (probeCursor < end) {
      const probeNext = new Date(Math.min(probeCursor.getTime() + probeStepMs, end.getTime()));
      const nextSign = this.getAscSign(input, probeNext).sign;
      if (nextSign !== currentSign) {
        boundaries.push(
          mode === 'exact' ? this.refineBoundary(input, probeCursor, probeNext) : probeNext
        );
      }
      probeCursor = probeNext;
      currentSign = nextSign;
    }

    return boundaries;
  }
}
