import { constants as Constants } from 'sweph';
import type { EphemerisCalculator } from './ephemeris.js';
import { logger } from './logger.js';
import { PLANET_NAMES, type RiseSetTime } from './types.js';

/**
 * Calculator for rise, set, and meridian transit times
 *
 * @remarks
 * Calculates when celestial bodies rise above and set below the horizon,
 * plus upper and lower meridian transits. Handles circumpolar objects
 * and atmospheric refraction corrections.
 */
export class RiseSetCalculator {
  /** Ephemeris calculator instance */
  private ephem: EphemerisCalculator;

  /**
   * Create a new rise/set calculator
   *
   * @param ephem - Initialized ephemeris calculator
   * @throws Error if ephemeris is not initialized
   *
   * @remarks
   * The ephemeris calculator must be initialized before passing
   * to the RiseSetCalculator constructor.
   */
  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  /**
   * Calculate rise, set, and meridian transit times for a celestial body
   *
   * Uses standard astronomical definitions:
   * - Rise/Set: Upper limb of disc with atmospheric refraction considered
   * - Atmospheric pressure: Estimated from altitude (sea level if altitude=0)
   * - Temperature: 0°C (default assumption)
   * - Upper meridian: Highest point in sky (culmination)
   * - Lower meridian: Lowest point in sky (anti-culmination)
   *
   * Swiss Ephemeris return codes:
   * - 0 or positive: Event found successfully
   * - -1: Calculation error (hard failure)
   * - -2: No event exists (circumpolar object)
   *
   * @param julianDay - Julian Day to start search from (typically midnight of target date)
   * @param planetId - Swiss Ephemeris planet ID
   * @param latitude - Observer latitude in degrees (-90 to 90)
   * @param longitude - Observer longitude in degrees
   * @param altitude - Observer altitude in meters (default: 0 = sea level)
   * @returns Rise/set/transit times, or undefined fields if event doesn't occur
   * @throws {Error} If ephemeris not initialized, invalid inputs, or hard calculation error
   */
  calculateRiseSet(
    julianDay: number,
    planetId: number,
    latitude: number,
    longitude: number,
    altitude: number = 0
  ): RiseSetTime {
    if (!this.ephem.eph) {
      throw new Error('Ephemeris not initialized');
    }

    // Input validation
    if (!Number.isFinite(julianDay)) {
      throw new Error('Invalid Julian Day: must be a finite number');
    }
    if (latitude < -90 || latitude > 90) {
      throw new Error(`Invalid latitude: ${latitude} (must be -90 to 90)`);
    }
    if (!Number.isFinite(longitude)) {
      throw new Error('Invalid longitude: must be a finite number');
    }
    if (!Number.isFinite(altitude)) {
      throw new Error('Invalid altitude: must be a finite number');
    }

    const planetName = PLANET_NAMES[planetId];
    if (!planetName) {
      throw new Error(`Unknown planet ID: ${planetId}`);
    }

    const result: RiseSetTime = {
      planet: planetName,
    };

    // Helper to call rise_trans and handle return codes
    const calculateEvent = (eventType: number, eventName: string): Date | undefined => {
      const eventResult = this.ephem.eph!.rise_trans(
        julianDay,
        planetId,
        null,
        Constants.SEFLG_SWIEPH,
        eventType,
        [longitude, latitude, altitude],
        0, // atpress: 0 = auto-estimate from altitude
        0 // attemp: 0°C
      );

      if (eventResult.flag === -1) {
        throw new Error(
          `${eventName} calculation failed for ${planetName}: ${eventResult.error || 'Unknown error'}`
        );
      } else if (eventResult.flag === -2) {
        logger.debug(`No ${eventName} for ${planetName} (circumpolar or no event)`, {
          planet: planetName,
          latitude,
        });
        return undefined;
      } else if (Number.isFinite(eventResult.data)) {
        return this.ephem.julianDayToDate(eventResult.data);
      }
      return undefined;
    };

    result.rise = calculateEvent(Constants.SE_CALC_RISE, 'rise');
    result.set = calculateEvent(Constants.SE_CALC_SET, 'set');
    result.upperMeridianTransit = calculateEvent(
      Constants.SE_CALC_MTRANSIT,
      'upper meridian transit'
    );
    result.lowerMeridianTransit = calculateEvent(
      Constants.SE_CALC_ITRANSIT,
      'lower meridian transit'
    );

    return result;
  }

  /**
   * Get rise/set times for all planets for a given date
   *
   * @param date - Date/time to use as search anchor (typically current instant or midnight of target date)
   * @param latitude - Observer latitude in degrees (-90 to 90)
   * @param longitude - Observer longitude in degrees
   * @param altitude - Observer altitude in meters (default: 0)
   * @returns Array of rise/set times for all planets
   * @throws Error if ephemeris not initialized or invalid inputs
   *
   * @remarks
   * Calculates for Sun through Pluto. Some fields may be undefined
   * for circumpolar objects at extreme latitudes.
   *
   * Swiss Ephemeris searches for the NEXT event after the given instant,
   * so to get events for a specific civil date, pass midnight of that date.
   */
  async getAllRiseSet(
    date: Date,
    latitude: number,
    longitude: number,
    altitude: number = 0
  ): Promise<RiseSetTime[]> {
    // Validate shared inputs once - these are configuration errors, not planet-specific failures
    if (!this.ephem.eph) {
      throw new Error('Ephemeris not initialized');
    }
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    if (latitude < -90 || latitude > 90) {
      throw new Error(`Invalid latitude: ${latitude} (must be -90 to 90)`);
    }
    if (!Number.isFinite(longitude)) {
      throw new Error('Invalid longitude: must be a finite number');
    }
    if (!Number.isFinite(altitude)) {
      throw new Error('Invalid altitude: must be a finite number');
    }

    const jd = this.ephem.dateToJulianDay(date);
    const results: RiseSetTime[] = [];

    // Calculate for Sun through Pluto (0-9)
    // Only catch planet-specific computation failures (e.g., circumpolar edge cases)
    for (let planetId = 0; planetId <= 9; planetId++) {
      try {
        const riseSet = this.calculateRiseSet(jd, planetId, latitude, longitude, altitude);
        results.push(riseSet);
      } catch (error) {
        // Planet-specific calculation failure - log and continue with other planets
        logger.warn(`Failed to calculate rise/set for planet ${planetId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Get Sun rise/set times for the current instant
   *
   * @param latitude - Observer latitude in degrees (-90 to 90)
   * @param longitude - Observer longitude in degrees
   * @param altitude - Observer altitude in meters (default: 0)
   * @returns Rise/set times for the Sun
   * @throws Error if ephemeris not initialized or invalid inputs
   *
   * @remarks
   * Searches for the next sunrise/sunset after the current instant.
   * If called in the afternoon, sunrise will be tomorrow.
   * For events on a specific civil date, use calculateRiseSet with midnight JD.
   */
  async getSunRiseSet(
    latitude: number,
    longitude: number,
    altitude: number = 0
  ): Promise<RiseSetTime> {
    // Validate inputs before calculation
    if (!this.ephem.eph) {
      throw new Error('Ephemeris not initialized');
    }
    if (latitude < -90 || latitude > 90) {
      throw new Error(`Invalid latitude: ${latitude} (must be -90 to 90)`);
    }
    if (!Number.isFinite(longitude)) {
      throw new Error('Invalid longitude: must be a finite number');
    }
    if (!Number.isFinite(altitude)) {
      throw new Error('Invalid altitude: must be a finite number');
    }

    const now = new Date();
    const jd = this.ephem.dateToJulianDay(now);
    return this.calculateRiseSet(jd, 0, latitude, longitude, altitude); // Sun is planet ID 0
  }
}
