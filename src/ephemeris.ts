import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Constants, load, type SwissEph } from '@fusionstrings/swiss-eph/wasi';
import { logger } from './logger.js';
import { PLANET_NAMES, type PlanetPosition, ZODIAC_SIGNS } from './types.js';

// Constants for exact transit time calculation
const DEFAULT_EXACT_TIME_TOLERANCE = 0.01; // degrees
const MAX_EXACT_TIME_ITERATIONS = 50;
const ROOT_DEDUP_EPSILON_DAYS = 1 / 1440; // 1 minute
const COARSE_SCAN_MAX_STEP_DAYS = 1;
const MAX_COARSE_SCAN_SAMPLES = 500;
const TANGENTIAL_ROOT_SCAN_FACTOR = 20; // candidate threshold in tolerance multiples

/**
 * Ephemeris calculator wrapper for Swiss Ephemeris WASM
 * 
 * @remarks
 * Provides a high-level interface for planetary calculations using the
 * Swiss Ephemeris library compiled to WebAssembly. Handles initialization,
 * coordinate conversions, and common astrological calculations.
 * 
 * All longitudes are tropical (not sidereal) and geocentric.
 */
export class EphemerisCalculator {
  /** Swiss Ephemeris WASM instance */
  public eph: SwissEph | null = null;

  /**
   * Initialize the Swiss Ephemeris WASM module
   * 
   * @returns Promise that resolves when initialization is complete
   * @throws Error if WASM fails to load or initialize
   * 
   * @remarks
   * Must be called before any other methods. Loads the Swiss Ephemeris
   * data files and prepares the calculation engine.
   */
  async init(): Promise<void> {
    if (!this.eph) {
      this.eph = await load();

      // Mount ephemeris files into WASM virtual filesystem
      // dist/ephemeris.js -> up one level -> ether-to-astro-mcp/
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const projectRoot = join(__dirname, '..');
      const ephePath = join(projectRoot, 'data', 'ephemeris');

      try {
        logger.info('Loading ephemeris files from filesystem', { ephePath });
        const files = await readdir(ephePath);
        const se1Files = files.filter((f) => f.endsWith('.se1'));
        logger.info(`Found ${se1Files.length} .se1 files to mount`);

        for (const filename of se1Files) {
          const filePath = join(ephePath, filename);
          const buffer = await readFile(filePath);
          const uint8Array = new Uint8Array(buffer);
          logger.info(
            `Mounting ${filename} into WASM (${(uint8Array.length / 1024).toFixed(2)}KB)`
          );
          this.eph.mount(filename, uint8Array);
        }

        // Set path to current directory since files are mounted at root
        this.eph.set_ephe_path('.');
        logger.info(`✅ Successfully mounted ${se1Files.length} ephemeris files into WASM`);
      } catch (error) {
        logger.warn('⚠️ Failed to mount ephemeris files - using Moshier fallback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Convert a JavaScript Date to Julian Day
   * 
   * @param date - Date to convert (should be in UTC)
   * @returns Julian Day number
   * @throws Error if ephemeris not initialized
   * 
   * @remarks
   * Julian Day is a continuous count of days since noon Universal Time
   * on January 1, 4713 BCE. It's the standard time system for astronomical
   * calculations.
   */
  dateToJulianDay(date: Date): number {
    if (!this.eph) throw new Error('Ephemeris not initialized');

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    return this.eph.swe_julday(year, month, day, hour, Constants.SE_GREG_CAL);
  }

  /**
   * Normalize angle to 0-360 degree range
   * 
   * @param angle - Angle in degrees (may be negative or > 360)
   * @returns Normalized angle in degrees (0-360)
   * 
   * @remarks
   * Uses modulo arithmetic to handle negative angles correctly.
   * Example: -10° becomes 350°, 370° becomes 10°.
   */
  private normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360;
  }

  /**
   * Get position of a single planet at a specific time
   * 
   * @param planetId - Swiss Ephemeris planet ID (from PLANETS constant)
   * @param jd - Julian Day for the calculation
   * @returns Planet position with all relevant data
   * @throws Error if ephemeris not initialized or invalid planet ID
   * 
   * @remarks
   * Returns tropical, geocentric coordinates. Includes zodiac sign
   * calculation and retrograde status.
   */
  getPlanetPosition(planetId: number, jd: number): PlanetPosition {
    if (!this.eph) throw new Error('Ephemeris not initialized');

    const result = this.eph.swe_calc_ut(jd, planetId, Constants.SEFLG_SPEED);

    // Swiss Ephemeris puts warnings in error field even on success
    // Log warnings but only throw if we don't have valid data
    if (result.error) {
      logger.ephemerisWarning(result.error);
    }

    if (!result.xx || result.xx.length < 4) {
      throw new Error(
        `Failed to calculate position for planet ${planetId}: ${result.error || 'No data returned'}`
      );
    }

    const longitude = result.xx[0];
    const latitude = result.xx[1];
    const distance = result.xx[2];
    const speed = result.xx[3];

    const normalizedLon = this.normalizeAngle(longitude);
    const signIndex = Math.floor(normalizedLon / 30);
    const degreeInSign = normalizedLon % 30;

    const planetName = PLANET_NAMES[planetId];
    if (!planetName) {
      throw new Error(`Unknown planet ID: ${planetId}`);
    }

    return {
      planetId,
      planet: planetName,
      longitude: normalizedLon,
      latitude,
      distance,
      speed,
      sign: ZODIAC_SIGNS[signIndex],
      degree: degreeInSign,
      isRetrograde: speed < 0,
    };
  }

  /**
   * Get positions for multiple planets at a specific time
   * 
   * @param planetIds - Array of Swiss Ephemeris planet IDs
   * @param jd - Julian Day for the calculation
   * @returns Array of planet positions in the same order as planetIds
   * @throws Error if ephemeris not initialized
   * 
   * @remarks
   * Convenience wrapper that maps over planetIds and calls getPlanetPosition for each.
   */
  getAllPlanets(jd: number, planetIds: number[]): PlanetPosition[] {
    return planetIds.map((id) => this.getPlanetPosition(id, jd));
  }

  /**
   * Calculate angular distance between two planets
   * 
   * @param lon1 - First planet's longitude
   * @param lon2 - Second planet's longitude
   * @returns Angular distance in degrees (0-180)
   * 
   * @remarks
   * Always returns the shorter arc between the two planets.
   * For example, 350° and 10° have a distance of 20°, not 340°.
   */
  calculateAspectAngle(lon1: number, lon2: number): number {
    let diff = Math.abs(lon1 - lon2);
    if (diff > 180) {
      diff = 360 - diff;
    }
    return diff;
  }


  /**
   * Find all exact times when planet reaches a specific longitude
   * 
   * @param planetId - Swiss Ephemeris planet ID
   * @param targetLongitude - Target longitude in degrees (will be normalized to 0-360)
   * @param startJD - Start of search window (Julian Day)
   * @param endJD - End of search window (Julian Day)
   * @param tolerance - Desired precision in degrees (default: 0.01°)
   * @returns Array of Julian Days where crossings occur, sorted earliest-first, or empty array if none
   * @throws Error if ephemeris not initialized or invalid inputs
   * 
   * @remarks
   * Uses multi-stage search: coarse scan for root detection, then bracket/minimum refinement.
   * Endpoint-near-zero cases are collected directly as candidate roots.
   * Only sign-change intervals are refined via bisection.
   * Local minima of |diff| are refined to catch tangential no-sign-change roots.
   * Returns all detected crossings in the interval, deduplicated within 1 minute,
   * and sorted earliest-first. No guarantees are made outside the searched interval.
   */
  findExactTransitTimes(
    planetId: number,
    targetLongitude: number,
    startJD: number,
    endJD: number,
    tolerance: number = DEFAULT_EXACT_TIME_TOLERANCE
  ): number[] {
    // Validate inputs
    if (!Number.isFinite(startJD) || !Number.isFinite(endJD)) {
      throw new Error('Invalid Julian Day: must be finite numbers');
    }
    if (startJD >= endJD) {
      throw new Error(`Invalid interval: startJD (${startJD}) must be < endJD (${endJD})`);
    }
    if (tolerance <= 0) {
      throw new Error(`Invalid tolerance: ${tolerance} (must be > 0)`);
    }

    // Normalize target longitude to 0-360
    targetLongitude = this.normalizeAngle(targetLongitude);

    // Helper: calculate signed shortest-angle difference
    const signedDiff = (lon: number): number => {
      let diff = lon - targetLongitude;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return diff;
    };

    // Stage 1: Coarse scan for root detection
    // Resolution is driven by max step size, with a hard cap for bounded compute.
    const windowDays = endJD - startJD;
    const rawSamples = Math.ceil(windowDays / COARSE_SCAN_MAX_STEP_DAYS);
    const numSamples = Math.max(1, Math.min(rawSamples, MAX_COARSE_SCAN_SAMPLES));
    const step = windowDays / numSamples;

    const samples: Array<{ jd: number; diff: number }> = [];
    for (let i = 0; i <= numSamples; i++) {
      const jd = startJD + i * step;
      const pos = this.getPlanetPosition(planetId, jd);
      const diff = signedDiff(pos.longitude);
      samples.push({ jd, diff });
    }

    // Root detection outputs:
    // - candidateRoots for near-zero samples
    // - brackets for sign-change intervals (to be refined via bisection)
    // - tangentialIntervals for local minima in |diff| (to catch no-sign-change roots)
    const candidateRoots: number[] = [];
    const brackets: Array<{ start: number; end: number }> = [];
    const tangentialIntervals: Array<{ start: number; end: number }> = [];
    const absDiffs = samples.map((s) => Math.abs(s.diff));

    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i].diff) < tolerance * 5) {
        candidateRoots.push(samples[i].jd);
      }
    }

    for (let i = 0; i < samples.length - 1; i++) {
      const curr = samples[i];
      const next = samples[i + 1];

      // Only true sign-change intervals are refined with bisection
      if ((curr.diff > 0 && next.diff < 0) || (curr.diff < 0 && next.diff > 0)) {
        brackets.push({ start: curr.jd, end: next.jd });
      }
    }

    // Detect local minima in |diff| for tangential roots that do not change sign.
    for (let i = 1; i < samples.length - 1; i++) {
      const prevAbs = absDiffs[i - 1];
      const currAbs = absDiffs[i];
      const nextAbs = absDiffs[i + 1];

      const isLocalMin =
        currAbs <= prevAbs &&
        currAbs <= nextAbs &&
        (currAbs < prevAbs || currAbs < nextAbs);

      if (!isLocalMin) continue;

      const dipProminence = Math.max(prevAbs, nextAbs) - currAbs;
      const looksPromising =
        currAbs < tolerance * TANGENTIAL_ROOT_SCAN_FACTOR ||
        dipProminence > tolerance;

      if (looksPromising) {
        tangentialIntervals.push({
          start: samples[i - 1].jd,
          end: samples[i + 1].jd,
        });
      }
    }

    // Stage 2a: Bisection refinement on sign-change brackets
    const roots: number[] = [...candidateRoots];

    for (const bracket of brackets) {
      let jd1 = bracket.start;
      let jd2 = bracket.end;
      let iteration = 0;

      while (iteration < MAX_EXACT_TIME_ITERATIONS) {
        const jdMid = (jd1 + jd2) / 2;

        // Stop if interval is tiny (< 1 minute)
        if (jd2 - jd1 < ROOT_DEDUP_EPSILON_DAYS) {
          break;
        }

        const posMid = this.getPlanetPosition(planetId, jdMid);
        const diffMid = signedDiff(posMid.longitude);

        // Check if close enough
        if (Math.abs(diffMid) < tolerance) {
          roots.push(jdMid);
          break;
        }

        // Narrow the interval based on which half brackets the target
        const posStart = this.getPlanetPosition(planetId, jd1);
        const diffStart = signedDiff(posStart.longitude);

        // Pick the half that brackets the target (sign change)
        if ((diffStart > 0 && diffMid > 0) || (diffStart < 0 && diffMid < 0)) {
          jd1 = jdMid;
        } else {
          jd2 = jdMid;
        }

        iteration++;
      }

      // If we didn't converge within tolerance, check final midpoint
      if (iteration === MAX_EXACT_TIME_ITERATIONS || jd2 - jd1 < ROOT_DEDUP_EPSILON_DAYS) {
        const finalMid = (jd1 + jd2) / 2;
        const finalPos = this.getPlanetPosition(planetId, finalMid);
        const finalDiff = signedDiff(finalPos.longitude);

        if (Math.abs(finalDiff) < tolerance * 2) {
          roots.push(finalMid);
        }
      }
    }

    // Stage 2b: Minimum refinement on tangential intervals (no sign change required)
    for (const interval of tangentialIntervals) {
      let left = interval.start;
      let right = interval.end;
      let iteration = 0;

      while (iteration < MAX_EXACT_TIME_ITERATIONS && right - left > ROOT_DEDUP_EPSILON_DAYS) {
        const m1 = left + (right - left) / 3;
        const m2 = right - (right - left) / 3;

        const d1 = Math.abs(signedDiff(this.getPlanetPosition(planetId, m1).longitude));
        const d2 = Math.abs(signedDiff(this.getPlanetPosition(planetId, m2).longitude));

        if (d1 <= d2) {
          right = m2;
        } else {
          left = m1;
        }

        iteration++;
      }

      const minJD = (left + right) / 2;
      const minAbs = Math.abs(signedDiff(this.getPlanetPosition(planetId, minJD).longitude));
      if (minAbs < tolerance * 2) {
        roots.push(minJD);
      }
    }

    // Sort all roots chronologically
    roots.sort((a, b) => a - b);

    // Deduplicate roots with epsilon (adjacent brackets can converge to same crossing)
    // Use 1 minute threshold to avoid duplicates
    const deduped: number[] = [];
    for (const root of roots) {
      const last = deduped[deduped.length - 1];
      if (last == null || Math.abs(root - last) > ROOT_DEDUP_EPSILON_DAYS) {
        deduped.push(root);
      }
    }

    return deduped;
  }

  /**
   * Convert Julian Day to JavaScript Date
   * 
   * @param jd - Julian Day number
   * @returns JavaScript Date in UTC
   * @throws Error if ephemeris not initialized
   * 
   * @remarks
   * The returned Date is always in UTC regardless of the original
   * timezone of the calculation.
   */
  julianDayToDate(jd: number): Date {
    if (!this.eph) throw new Error('Ephemeris not initialized');

    const result = this.eph.swe_revjul(jd, Constants.SE_GREG_CAL);

    // Convert fractional hour to milliseconds from midnight and round once.
    // Adding to midnight timestamp naturally handles overflow carries.
    const msFromMidnight = Math.round(result.hour * 3600 * 1000);
    const midnightUtcMs = Date.UTC(result.year, result.month - 1, result.day, 0, 0, 0, 0);
    return new Date(midnightUtcMs + msFromMidnight);
  }
}
