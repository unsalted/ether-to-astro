import { Constants } from '@fusionstrings/swiss-eph/wasi';
import { EphemerisCalculator } from './ephemeris.js';
import { RiseSetTime, PLANET_NAMES } from './types.js';
import { logger } from './logger.js';

export class RiseSetCalculator {
  private ephem: EphemerisCalculator;

  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  calculateRiseSet(
    julianDay: number,
    planetId: number,
    latitude: number,
    longitude: number,
    altitude: number = 0
  ): RiseSetTime {
    if (!this.ephem['eph']) {
      throw new Error('Ephemeris not initialized');
    }

    const planetName = PLANET_NAMES[planetId];
    if (!planetName) {
      throw new Error(`Unknown planet ID: ${planetId}`);
    }

    const result: RiseSetTime = {
      planet: planetName
    };

    try {
      const riseResult = this.ephem['eph'].swe_rise_trans(
        julianDay,
        planetId,
        null,
        Constants.SEFLG_SWIEPH,
        Constants.SE_CALC_RISE,
        [longitude, latitude, altitude],
        0,
        0
      );
      if (!riseResult.error && riseResult.tret) {
        result.rise = this.ephem.julianDayToDate(riseResult.tret);
      }
    } catch (e) {
      // Rise time not available - this is normal for some planets/locations
      logger.debug(`Rise time not available for ${planetName}`, { 
        planet: planetName,
        error: e instanceof Error ? e.message : String(e)
      });
    }

    try {
      const setResult = this.ephem['eph'].swe_rise_trans(
        julianDay,
        planetId,
        null,
        Constants.SEFLG_SWIEPH,
        Constants.SE_CALC_SET,
        [longitude, latitude, altitude],
        0,
        0
      );
      if (!setResult.error && setResult.tret) {
        result.set = this.ephem.julianDayToDate(setResult.tret);
      }
    } catch (e) {
      // Set time not available - this is normal for some planets/locations
      logger.debug(`Set time not available for ${planetName}`, {
        planet: planetName,
        error: e instanceof Error ? e.message : String(e)
      });
    }

    try {
      const transitResult = this.ephem['eph'].swe_rise_trans(
        julianDay,
        planetId,
        null,
        Constants.SEFLG_SWIEPH,
        Constants.SE_CALC_MTRANSIT,
        [longitude, latitude, altitude],
        0,
        0
      );
      if (!transitResult.error && transitResult.tret) {
        result.transit = this.ephem.julianDayToDate(transitResult.tret);
      }
    } catch (e) {
      // Transit time not available - this is normal for some planets/locations
      logger.debug(`Transit time not available for ${planetName}`, {
        planet: planetName,
        error: e instanceof Error ? e.message : String(e)
      });
    }

    return result;
  }
}
