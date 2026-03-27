import type { EphemerisCalculator } from './ephemeris.js';
import { type HouseData, ZODIAC_SIGNS } from './types.js';

export class HouseCalculator {
  private ephem: EphemerisCalculator;

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
    const normalized = houseSystem.trim().toUpperCase();
    if (normalized.length !== 1) {
      throw new Error(`Invalid house system: "${houseSystem}". Must be single character (e.g., 'P', 'W', 'K').`);
    }
    
    const validSystems = ['P', 'K', 'W', 'E', 'O', 'R', 'C', 'A', 'V', 'X', 'H', 'T', 'B'];
    if (!validSystems.includes(normalized)) {
      throw new Error(`Unsupported house system: "${normalized}". Valid systems: ${validSystems.join(', ')}`);
    }

    const isPolar = Math.abs(latitude) > 66;
    let systemToUse = normalized;
    
    // Try requested system
    const result = this.ephem.eph.swe_houses(
      julianDay,
      latitude,
      longitude,
      systemToUse.charCodeAt(0)
    );

    // Handle polar latitude failure with real fallback
    if (result.returnCode < 0 && isPolar && systemToUse !== 'W') {
      // Retry with Whole Sign (works at all latitudes)
      systemToUse = 'W';
      const fallbackResult = this.ephem.eph.swe_houses(
        julianDay,
        latitude,
        longitude,
        systemToUse.charCodeAt(0)
      );
      
      if (fallbackResult.returnCode < 0) {
        // Even Whole Sign failed - this should never happen
        throw new Error(`House calculation failed even with Whole Sign fallback at latitude ${latitude.toFixed(1)}°`);
      }
      
      // Return fallback result with actual system used
      return {
        ascendant: fallbackResult.ascmc[0],
        mc: fallbackResult.ascmc[1],
        cusps: Array.from(fallbackResult.cusps), // Swiss 1-based: [0] unused, [1..12] houses
        system: systemToUse, // Return 'W', not original requested system
      };
    }

    // For non-polar failures, throw error (don't return fake data)
    if (result.returnCode < 0) {
      throw new Error(`House calculation failed for ${systemToUse} system at latitude ${latitude.toFixed(1)}°`);
    }

    // Success - return actual data
    return {
      ascendant: result.ascmc[0],
      mc: result.ascmc[1],
      cusps: Array.from(result.cusps), // Swiss 1-based: [0] unused, [1..12] houses
      system: systemToUse,
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
