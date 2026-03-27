import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Constants, load, type SwissEph } from '@fusionstrings/swiss-eph/wasi';
import { logger } from './logger.js';
import { PLANET_NAMES, type PlanetPosition, ZODIAC_SIGNS } from './types.js';

// Constants for exact transit time calculation
const DEFAULT_EXACT_TIME_TOLERANCE = 0.01; // degrees
const MAX_EXACT_TIME_ITERATIONS = 50;
const TOLERANCE_TO_MINUTES_RATIO = 1440; // Convert tolerance to minutes (1 day = 1440 minutes)

export class EphemerisCalculator {
  public eph: SwissEph | null = null;

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

  dateToJulianDay(date: Date): number {
    if (!this.eph) throw new Error('Ephemeris not initialized');

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    return this.eph.swe_julday(year, month, day, hour, Constants.SE_GREG_CAL);
  }

  getPlanetPosition(planetId: number, julianDay: number): PlanetPosition {
    if (!this.eph) throw new Error('Ephemeris not initialized');

    const result = this.eph.swe_calc_ut(julianDay, planetId, Constants.SEFLG_SPEED);

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

    // Normalize longitude to 0-360 range
    const normalizedLon = ((longitude % 360) + 360) % 360;
    const signIndex = Math.floor(normalizedLon / 30);
    const degreeInSign = normalizedLon % 30;

    const planetName = PLANET_NAMES[planetId];
    if (!planetName) {
      throw new Error(`Unknown planet ID: ${planetId}`);
    }

    return {
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

  getAllPlanets(julianDay: number, planetIds: number[]): PlanetPosition[] {
    return planetIds.map((id) => this.getPlanetPosition(id, julianDay));
  }

  calculateAspectAngle(lon1: number, lon2: number): number {
    let diff = Math.abs(lon1 - lon2);
    if (diff > 180) {
      diff = 360 - diff;
    }
    return diff;
  }

  findExactTransitTime(
    planetId: number,
    targetLongitude: number,
    startJD: number,
    endJD: number,
    tolerance: number = DEFAULT_EXACT_TIME_TOLERANCE
  ): number | null {
    // First, check if interval brackets the target
    const pos1 = this.getPlanetPosition(planetId, startJD);
    const pos2 = this.getPlanetPosition(planetId, endJD);
    
    // Calculate angular distance to target for both endpoints
    let diff1 = pos1.longitude - targetLongitude;
    if (diff1 > 180) diff1 -= 360;
    if (diff1 < -180) diff1 += 360;
    
    let diff2 = pos2.longitude - targetLongitude;
    if (diff2 > 180) diff2 -= 360;
    if (diff2 < -180) diff2 += 360;
    
    // Check if we bracket the target (signs differ)
    // If both same sign, no crossing in this interval
    if ((diff1 > 0 && diff2 > 0) || (diff1 < 0 && diff2 < 0)) {
      // No crossing - return null instead of fabricating
      return null;
    }
    
    // If already very close at either endpoint, return that
    if (Math.abs(diff1) < tolerance) return startJD;
    if (Math.abs(diff2) < tolerance) return endJD;
    
    // Binary search for the crossing
    let jd1 = startJD;
    let jd2 = endJD;
    let iteration = 0;
    
    while (iteration < MAX_EXACT_TIME_ITERATIONS) {
      const jdMid = (jd1 + jd2) / 2;
      
      // Stop if interval is tiny (< 1 minute)
      if (jd2 - jd1 < 1 / TOLERANCE_TO_MINUTES_RATIO) {
        break;
      }
      
      const posMid = this.getPlanetPosition(planetId, jdMid);
      let diffMid = posMid.longitude - targetLongitude;
      if (diffMid > 180) diffMid -= 360;
      if (diffMid < -180) diffMid += 360;
      
      // Check if close enough
      if (Math.abs(diffMid) < tolerance) {
        return jdMid;
      }
      
      // Narrow the interval
      const posStart = this.getPlanetPosition(planetId, jd1);
      let diffStart = posStart.longitude - targetLongitude;
      if (diffStart > 180) diffStart -= 360;
      if (diffStart < -180) diffStart += 360;
      
      // Pick the half that brackets the target
      if ((diffStart > 0 && diffMid > 0) || (diffStart < 0 && diffMid < 0)) {
        jd1 = jdMid;
      } else {
        jd2 = jdMid;
      }
      
      iteration++;
    }
    
    // Return midpoint only if we actually converged
    const finalMid = (jd1 + jd2) / 2;
    const finalPos = this.getPlanetPosition(planetId, finalMid);
    let finalDiff = finalPos.longitude - targetLongitude;
    if (finalDiff > 180) finalDiff -= 360;
    if (finalDiff < -180) finalDiff += 360;
    
    // Only return if we're actually close (within 2x tolerance)
    return Math.abs(finalDiff) < tolerance * 2 ? finalMid : null;
  }

  julianDayToDate(jd: number): Date {
    if (!this.eph) throw new Error('Ephemeris not initialized');

    const result = this.eph.swe_revjul(jd, Constants.SE_GREG_CAL);
    return new Date(
      Date.UTC(
        result.year,
        result.month - 1,
        result.day,
        Math.floor(result.hour),
        Math.floor((result.hour % 1) * 60),
        Math.floor(((result.hour % 1) * 3600) % 60)
      )
    );
  }
}
