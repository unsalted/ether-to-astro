import type { EphemerisCalculator } from './ephemeris.js';
import { type HouseData, type HouseSystem, ZODIAC_SIGNS } from './types.js';

/**
 * Calculator for astrological houses, Ascendant, and Midheaven
 *
 * @remarks
 * Calculates house cusps using various house systems. Handles polar
 * latitude edge cases by falling back to Whole Sign when needed.
 * Uses Swiss Ephemeris 1-based indexing for cusps array.
 */
export class HouseCalculator {
  /** Ephemeris calculator instance */
  private ephem: EphemerisCalculator;

  /**
   * Create a new house calculator
   *
   * @param ephem - Initialized ephemeris calculator
   * @throws Error if ephemeris is not initialized
   *
   * @remarks
   * The ephemeris calculator must be initialized before passing
   * to the HouseCalculator constructor.
   */
  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  /**
   * Calculate house cusps, Ascendant, and Midheaven for a given time and location
   *
   * Supported house systems:
   * - P: Placidus (most common, fails >66° latitude)
   * - W: Whole Sign (works at all latitudes)
   * - K: Koch
   * - E: Equal
   * - O: Porphyry
   * - R: Regiomontanus
   * - C: Campanus
   * - A: Equal (MC)
   * - V: Vehlow Equal
   * - X: Axial Rotation
   * - H: Azimuthal/Horizontal
   * - T: Polich/Page (Topocentric)
   * - B: Alcabitus
   *
   * Polar latitude handling:
   * - For latitudes >66°, Placidus/Koch/etc may fail mathematically
   * - Automatically falls back to Whole Sign if requested system fails
   * - Returns actual system used in result.system field
   *
   * Cusp array format:
   * - Swiss Ephemeris 1-based indexing: cusps[0] is unused, cusps[1..12] are houses 1-12
   * - This preserves the original Swiss Ephemeris convention
   *
   * @param julianDay - Julian Day for calculation
   * @param latitude - Observer latitude in degrees
   * @param longitude - Observer longitude in degrees
   * @param houseSystem - Single-character house system code (default: 'P')
   * @returns House data with cusps, ascendant, MC, and actual system used
   * @throws {Error} If house calculation fails or invalid system specified
   */
  calculateHouses(
    julianDay: number,
    latitude: number,
    longitude: number,
    houseSystem: string = 'P'
  ): HouseData {
    if (!this.ephem.eph) {
      throw new Error('Ephemeris not initialized');
    }

    // Validate and normalize house system
    const normalized = this.normalizeHouseSystem(houseSystem);

    const isPolar = Math.abs(latitude) > 66;
    let systemToUse = normalized as HouseSystem;

    // Try requested system
    const result = this.ephem.eph.houses_ex2(julianDay, 0, latitude, longitude, systemToUse);

    // Handle polar latitude failure with real fallback
    if (result.flag < 0 && isPolar && systemToUse !== 'W') {
      // Retry with Whole Sign (works at all latitudes)
      systemToUse = 'W';
      const fallbackResult = this.ephem.eph.houses_ex2(
        julianDay,
        0,
        latitude,
        longitude,
        systemToUse
      );

      if (fallbackResult.flag < 0) {
        // Even Whole Sign failed - this should never happen
        throw new Error(
          `House calculation failed even with Whole Sign fallback at latitude ${latitude.toFixed(1)}°`
        );
      }

      // Return fallback result with actual system used
      return {
        ascendant: fallbackResult.data.points[0],
        mc: fallbackResult.data.points[1],
        cusps: [0, ...Array.from(fallbackResult.data.houses)], // Swiss 1-based: [0] unused, [1..12] houses
        system: systemToUse, // Return 'W', not original requested system
      };
    }

    // For non-polar failures, throw error (don't return fake data)
    if (result.flag < 0) {
      throw new Error(
        `House calculation failed for ${systemToUse} system at latitude ${latitude.toFixed(1)}°`
      );
    }

    // Success - return actual data
    return {
      ascendant: result.data.points[0],
      mc: result.data.points[1],
      cusps: [0, ...Array.from(result.data.houses)], // Swiss 1-based: [0] unused, [1..12] houses
      system: systemToUse,
    };
  }

  /**
   * Normalize house system code
   *
   * @param system - House system code (single character or name)
   * @returns Normalized single-character code
   * @throws Error if invalid system
   *
   * @remarks
   * Accepts both single-letter codes and full names.
   * Validates against supported systems.
   */
  private normalizeHouseSystem(system: string): HouseSystem {
    const upperSystem = system.toUpperCase().trim();

    // Map common names to single-letter codes
    const nameMap: { [key: string]: string } = {
      PLACIDUS: 'P',
      'WHOLE SIGN': 'W',
      KOCH: 'K',
      EQUAL: 'E',
      PORPHYRY: 'O',
      REGIOMONTANUS: 'R',
      CAMPANUS: 'C',
      'EQUAL MC': 'A',
      'VEHLOW EQUAL': 'V',
      'AXIAL ROTATION': 'X',
      AZIMUTHAL: 'H',
      HORIZONTAL: 'H',
      TOPOCENTRIC: 'T',
      POLICH: 'T',
      PAGE: 'T',
      ALCABITUS: 'B',
    };

    const normalized = nameMap[upperSystem] || upperSystem;

    // Validate against allowed systems
    const validSystems: HouseSystem[] = [
      'P',
      'W',
      'K',
      'E',
      'O',
      'R',
      'C',
      'A',
      'V',
      'X',
      'H',
      'T',
      'B',
    ];
    if (!validSystems.includes(normalized as HouseSystem)) {
      throw new Error(`Invalid house system: ${system}. Valid systems: ${validSystems.join(', ')}`);
    }

    return normalized as HouseSystem;
  }

  /**
   * Format house position as readable string
   *
   * @param longitude - House cusp longitude in degrees
   * @returns Formatted string like "15.30° Aries"
   *
   * @remarks
   * Normalizes longitude to 0-360° range and determines zodiac sign.
   */
  formatHousePosition(longitude: number): string {
    // Normalize longitude to 0-360 range
    const normalizedLon = ((longitude % 360) + 360) % 360;
    const signIndex = Math.floor(normalizedLon / 30);
    const degree = normalizedLon % 30;
    return `${degree.toFixed(2)}° ${ZODIAC_SIGNS[signIndex]}`;
  }
}
