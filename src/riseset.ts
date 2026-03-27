import { Constants } from '@fusionstrings/swiss-eph/wasi';
import type { EphemerisCalculator } from './ephemeris.js';
import { logger } from './logger.js';
import { PLANET_NAMES, type RiseSetTime } from './types.js';

export class RiseSetCalculator {
  private ephem: EphemerisCalculator;

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
   * @param julianDay - Julian Day for calculation
   * @param planetId - Swiss Ephemeris planet ID
   * @param latitude - Observer latitude in degrees
   * @param longitude - Observer longitude in degrees  
   * @param altitude - Observer altitude in meters (default: 0 = sea level)
   * @returns Rise/set/transit times, or undefined fields if event doesn't occur
   * @throws {Error} If ephemeris not initialized or hard calculation error
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

    const planetName = PLANET_NAMES[planetId];
    if (!planetName) {
      throw new Error(`Unknown planet ID: ${planetId}`);
    }

    const result: RiseSetTime = {
      planet: planetName,
    };

    const riseResult = this.ephem.eph.swe_rise_trans(
      julianDay,
      planetId,
      null,
      Constants.SEFLG_SWIEPH,
      Constants.SE_CALC_RISE,
      [longitude, latitude, altitude],
      0, // atpress: 0 = auto-estimate from altitude
      0  // attemp: 0°C
    );
    
    // Handle return codes explicitly
    if (riseResult.returnCode === -1) {
      // Hard error - throw
      throw new Error(`Rise calculation failed for ${planetName}: ${riseResult.error || 'Unknown error'}`);
    } else if (riseResult.returnCode === -2) {
      // No rise event (circumpolar) - leave field undefined
      logger.debug(`No rise event for ${planetName} (circumpolar or below horizon)`, {
        planet: planetName,
        latitude,
      });
    } else if (riseResult.tret) {
      // Success - convert to date
      result.rise = this.ephem.julianDayToDate(riseResult.tret);
    }

    const setResult = this.ephem.eph.swe_rise_trans(
      julianDay,
      planetId,
      null,
      Constants.SEFLG_SWIEPH,
      Constants.SE_CALC_SET,
      [longitude, latitude, altitude],
      0, // atpress: 0 = auto-estimate from altitude
      0  // attemp: 0°C
    );
    
    // Handle return codes explicitly
    if (setResult.returnCode === -1) {
      // Hard error - throw
      throw new Error(`Set calculation failed for ${planetName}: ${setResult.error || 'Unknown error'}`);
    } else if (setResult.returnCode === -2) {
      // No set event (circumpolar) - leave field undefined
      logger.debug(`No set event for ${planetName} (circumpolar or always above horizon)`, {
        planet: planetName,
        latitude,
      });
    } else if (setResult.tret) {
      // Success - convert to date
      result.set = this.ephem.julianDayToDate(setResult.tret);
    }

    // Upper meridian transit (culmination - highest point)
    const upperTransitResult = this.ephem.eph.swe_rise_trans(
      julianDay,
      planetId,
      null,
      Constants.SEFLG_SWIEPH,
      Constants.SE_CALC_MTRANSIT,
      [longitude, latitude, altitude],
      0, // atpress: 0 = auto-estimate from altitude
      0  // attemp: 0°C
    );
    
    // Handle return codes explicitly
    if (upperTransitResult.returnCode === -1) {
      // Hard error - throw
      throw new Error(`Upper meridian calculation failed for ${planetName}: ${upperTransitResult.error || 'Unknown error'}`);
    } else if (upperTransitResult.returnCode === -2) {
      // No event - leave field undefined
      logger.debug(`No upper meridian transit for ${planetName}`, { planet: planetName, latitude });
    } else if (upperTransitResult.tret) {
      // Success
      result.upperMeridianTransit = this.ephem.julianDayToDate(upperTransitResult.tret);
    }
    
    // Lower meridian transit (anti-culmination - lowest point)
    const lowerTransitResult = this.ephem.eph.swe_rise_trans(
      julianDay,
      planetId,
      null,
      Constants.SEFLG_SWIEPH,
      Constants.SE_CALC_ITRANSIT,
      [longitude, latitude, altitude],
      0, // atpress: 0 = auto-estimate from altitude
      0  // attemp: 0°C
    );
    
    // Handle return codes explicitly
    if (lowerTransitResult.returnCode === -1) {
      // Hard error - throw
      throw new Error(`Lower meridian calculation failed for ${planetName}: ${lowerTransitResult.error || 'Unknown error'}`);
    } else if (lowerTransitResult.returnCode === -2) {
      // No event - leave field undefined
      logger.debug(`No lower meridian transit for ${planetName}`, { planet: planetName, latitude });
    } else if (lowerTransitResult.tret) {
      // Success
      result.lowerMeridianTransit = this.ephem.julianDayToDate(lowerTransitResult.tret);
    }

    return result;
  }
}
