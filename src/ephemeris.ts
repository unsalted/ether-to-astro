import { Constants, load, SwissEph } from '@fusionstrings/swiss-eph/wasi';
import { PlanetPosition, PLANET_NAMES, ZODIAC_SIGNS } from './types.js';
import { logger } from './logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile, readdir } from 'fs/promises';

export class EphemerisCalculator {
  private eph: SwissEph | null = null;

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
        const se1Files = files.filter(f => f.endsWith('.se1'));
        logger.info(`Found ${se1Files.length} .se1 files to mount`);
        
        for (const filename of se1Files) {
          const filePath = join(ephePath, filename);
          const buffer = await readFile(filePath);
          const uint8Array = new Uint8Array(buffer);
          logger.info(`Mounting ${filename} into WASM (${(uint8Array.length / 1024).toFixed(2)}KB)`);
          this.eph.mount(filename, uint8Array);
        }
        
        // Set path to current directory since files are mounted at root
        this.eph.set_ephe_path('.');
        logger.info(`✅ Successfully mounted ${se1Files.length} ephemeris files into WASM`);
      } catch (error) {
        logger.warn('⚠️ Failed to mount ephemeris files - using Moshier fallback', {
          error: error instanceof Error ? error.message : String(error)
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
    
    const result = this.eph.swe_calc_ut(
      julianDay,
      planetId,
      Constants.SEFLG_SPEED
    );
    
    // Swiss Ephemeris puts warnings in error field even on success
    // Log warnings but only throw if we don't have valid data
    if (result.error) {
      logger.ephemerisWarning(result.error);
    }
    
    if (!result.xx || result.xx.length < 4) {
      throw new Error(`Failed to calculate position for planet ${planetId}: ${result.error || 'No data returned'}`);
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
      isRetrograde: speed < 0
    };
  }

  getAllPlanets(julianDay: number, planetIds: number[]): PlanetPosition[] {
    return planetIds.map(id => this.getPlanetPosition(id, julianDay));
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
    tolerance: number = 0.01
  ): number | null {
    let jd1 = startJD;
    let jd2 = endJD;
    
    const maxIterations = 50;
    let iteration = 0;
    
    while (iteration < maxIterations && (jd2 - jd1) > tolerance / 1440) {
      const jdMid = (jd1 + jd2) / 2;
      const pos = this.getPlanetPosition(planetId, jdMid);
      
      let diff = pos.longitude - targetLongitude;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      
      if (Math.abs(diff) < tolerance) {
        return jdMid;
      }
      
      const pos1 = this.getPlanetPosition(planetId, jd1);
      let diff1 = pos1.longitude - targetLongitude;
      if (diff1 > 180) diff1 -= 360;
      if (diff1 < -180) diff1 += 360;
      
      if ((diff1 > 0 && diff > 0) || (diff1 < 0 && diff < 0)) {
        jd1 = jdMid;
      } else {
        jd2 = jdMid;
      }
      
      iteration++;
    }
    
    return (jd1 + jd2) / 2;
  }

  julianDayToDate(jd: number): Date {
    if (!this.eph) throw new Error('Ephemeris not initialized');
    
    const result = this.eph.swe_revjul(jd, Constants.SE_GREG_CAL);
    return new Date(Date.UTC(
      result.year,
      result.month - 1,
      result.day,
      Math.floor(result.hour),
      Math.floor((result.hour % 1) * 60),
      Math.floor(((result.hour % 1) * 3600) % 60)
    ));
  }
}
