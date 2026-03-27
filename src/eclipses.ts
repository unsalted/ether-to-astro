import { Constants } from '@fusionstrings/swiss-eph/wasi';
import { ErrorCategory } from './constants.js';
import type { EphemerisCalculator } from './ephemeris.js';
import { logger } from './logger.js';
import type { EclipseInfo } from './types.js';

/**
 * Calculator for solar and lunar eclipses
 * 
 * @remarks
 * Finds upcoming solar and lunar eclipses using Swiss Ephemeris.
 * Returns basic eclipse information including type and timing.
 * TODO: Enhance with richer phase timing and visibility data.
 */
export class EclipseCalculator {
  /** Ephemeris calculator instance */
  private ephem: EphemerisCalculator;

  /**
   * Create a new eclipse calculator
   * 
   * @param ephem - Initialized ephemeris calculator
   * @throws Error if ephemeris is not initialized
   * 
   * @remarks
   * The ephemeris calculator must be initialized before passing
   * to the EclipseCalculator constructor.
   */
  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  /**
   * Find the next solar eclipse after a given date
   * 
   * @param startJD - Julian Day to start searching from
   * @returns Solar eclipse info or null if none found
   * @throws Error if ephemeris not initialized
   * 
   * @remarks
   * Searches globally for the next solar eclipse. Returns basic
   * information about the eclipse type and maximum time.
   */
  findNextSolarEclipse(startJD: number): EclipseInfo | null {
    if (!this.ephem.eph) {
      throw new Error('Ephemeris not initialized');
    }

    try {
      const result = this.ephem.eph.swe_sol_eclipse_when_glob(
        startJD,
        Constants.SEFLG_SWIEPH,
        0,
        false
      );

      if (result.error || !result.tret || result.tret.length < 1) {
        return null;
      }

      const eclipseType = this.getSolarEclipseType(result.returnCode);

      return {
        type: 'solar',
        date: this.ephem.julianDayToDate(result.tret[0]),
        eclipseType,
        maxTime: this.ephem.julianDayToDate(result.tret[0]),
      };
    } catch (e) {
      logger.error(
        'Solar eclipse calculation failed',
        ErrorCategory.CALCULATION,
        e instanceof Error ? e : new Error(String(e))
      );
      return null;
    }
  }

  /**
   * Find the next lunar eclipse after a given date
   * 
   * @param startJD - Julian Day to start searching from
   * @returns Lunar eclipse info or null if none found
   * @throws Error if ephemeris not initialized
   * 
   * @remarks
   * Searches globally for the next lunar eclipse. Returns basic
   * information about the eclipse type and maximum time.
   */
  findNextLunarEclipse(startJD: number): EclipseInfo | null {
    if (!this.ephem.eph) {
      throw new Error('Ephemeris not initialized');
    }

    try {
      const result = this.ephem.eph.swe_lun_eclipse_when(startJD, Constants.SEFLG_SWIEPH, 0, false);

      if (result.error || !result.tret || result.tret.length < 1) {
        return null;
      }

      const eclipseType = this.getLunarEclipseType(result.returnCode);

      return {
        type: 'lunar',
        date: this.ephem.julianDayToDate(result.tret[0]),
        eclipseType,
        maxTime: this.ephem.julianDayToDate(result.tret[0]),
      };
    } catch (e) {
      logger.error(
        'Lunar eclipse calculation failed',
        ErrorCategory.CALCULATION,
        e instanceof Error ? e : new Error(String(e))
      );
      return null;
    }
  }

  /**
   * Get the next eclipses (both solar and lunar) after a given date
   * 
   * @param startJD - Julian Day to start searching from
   * @returns Array of upcoming eclipses sorted by date
   * @throws Error if ephemeris not initialized
   * 
   * @remarks
   * Finds the next solar and lunar eclipses. Returns them in
   * chronological order. May return only one type if the other
   * is too far in the future.
   */
  async getNextEclipses(startJD: number): Promise<EclipseInfo[] | null> {
    if (!this.ephem.eph) {
      throw new Error('Ephemeris not initialized');
    }

    try {
      const solarEclipse = this.findNextSolarEclipse(startJD);
      const lunarEclipse = this.findNextLunarEclipse(startJD);

      const eclipses = await Promise.all([solarEclipse, lunarEclipse]);

      const filteredEclipses = eclipses.filter(eclipse => eclipse !== null);

      if (filteredEclipses.length === 0) {
        return null;
      }

      return filteredEclipses.sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (e) {
      logger.error(
        'Eclipse calculation failed',
        ErrorCategory.CALCULATION,
        e instanceof Error ? e : new Error(String(e))
      );
      return null;
    }
  }

  /**
   * Get solar eclipse type from Swiss Ephemeris return code
   * 
   * @param returnCode - Swiss Ephemeris solar eclipse return code
   * @returns Human-readable eclipse type string
   * 
   * @remarks
   * Maps Swiss Ephemeris numeric codes to descriptive types.
   * TODO: Should use constrained union types for better type safety.
   */
  private getSolarEclipseType(returnCode: number): string {
    if (returnCode & Constants.SE_ECL_TOTAL) return 'Total';
    if (returnCode & Constants.SE_ECL_ANNULAR) return 'Annular';
    if (returnCode & Constants.SE_ECL_PARTIAL) return 'Partial';
    return 'Unknown';
  }

  /**
   * Get lunar eclipse type from Swiss Ephemeris return code
   * 
   * @param returnCode - Swiss Ephemeris lunar eclipse return code
   * @returns Human-readable eclipse type string
   * 
   * @remarks
   * Maps Swiss Ephemeris numeric codes to descriptive types.
   * TODO: Should use constrained union types for better type safety.
   */
  private getLunarEclipseType(returnCode: number): string {
    if (returnCode & Constants.SE_ECL_TOTAL) return 'Total';
    if (returnCode & Constants.SE_ECL_PARTIAL) return 'Partial';
    if (returnCode & Constants.SE_ECL_PENUMBRAL) return 'Penumbral';
    return 'Unknown';
  }
}
