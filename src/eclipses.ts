import { Constants } from '@fusionstrings/swiss-eph/wasi';
import { EphemerisCalculator } from './ephemeris.js';
import { logger } from './logger.js';
import { ErrorCategory } from './constants.js';
import { EclipseInfo } from './types.js';

export class EclipseCalculator {
  private ephem: EphemerisCalculator;

  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  findNextSolarEclipse(startJD: number): EclipseInfo | null {
    if (!this.ephem['eph']) {
      throw new Error('Ephemeris not initialized');
    }

    try {
      const result = this.ephem['eph'].swe_sol_eclipse_when_glob(
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
        maxTime: this.ephem.julianDayToDate(result.tret[0])
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

  findNextLunarEclipse(startJD: number): EclipseInfo | null {
    if (!this.ephem['eph']) {
      throw new Error('Ephemeris not initialized');
    }

    try {
      const result = this.ephem['eph'].swe_lun_eclipse_when(
        startJD,
        Constants.SEFLG_SWIEPH,
        0,
        false
      );

      if (result.error || !result.tret || result.tret.length < 1) {
        return null;
      }

      const eclipseType = this.getLunarEclipseType(result.returnCode);

      return {
        type: 'lunar',
        date: this.ephem.julianDayToDate(result.tret[0]),
        eclipseType,
        maxTime: this.ephem.julianDayToDate(result.tret[0])
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

  private getSolarEclipseType(flags: number): string {
    if (flags & Constants.SE_ECL_TOTAL) return 'Total';
    if (flags & Constants.SE_ECL_ANNULAR) return 'Annular';
    if (flags & Constants.SE_ECL_PARTIAL) return 'Partial';
    return 'Unknown';
  }

  private getLunarEclipseType(flags: number): string {
    if (flags & Constants.SE_ECL_TOTAL) return 'Total';
    if (flags & Constants.SE_ECL_PARTIAL) return 'Partial';
    if (flags & Constants.SE_ECL_PENUMBRAL) return 'Penumbral';
    return 'Unknown';
  }
}
