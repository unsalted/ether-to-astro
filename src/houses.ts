import type { EphemerisCalculator } from './ephemeris.js';
import { type HouseData, ZODIAC_SIGNS } from './types.js';

export class HouseCalculator {
  private ephem: EphemerisCalculator;

  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  calculateHouses(
    julianDay: number,
    latitude: number,
    longitude: number,
    houseSystem: string = 'P'
  ): HouseData {
    if (!this.ephem.eph) {
      throw new Error('Ephemeris not initialized');
    }

    const result = this.ephem.eph.swe_houses(
      julianDay,
      latitude,
      longitude,
      houseSystem.charCodeAt(0)
    );

    if (result.returnCode < 0) {
      throw new Error(`House calculation error`);
    }

    return {
      ascendant: result.ascmc[0],
      mc: result.ascmc[1],
      cusps: Array.from(result.cusps),
      system: houseSystem,
    };
  }

  formatHousePosition(longitude: number): string {
    // Normalize longitude to 0-360 range
    const normalizedLon = ((longitude % 360) + 360) % 360;
    const signIndex = Math.floor(normalizedLon / 30);
    const degree = normalizedLon % 30;
    return `${degree.toFixed(2)}° ${ZODIAC_SIGNS[signIndex]}`;
  }
}
