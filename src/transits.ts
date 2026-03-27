import type { EphemerisCalculator } from './ephemeris.js';
import { ASPECTS, type NatalChart, type PlanetPosition, type Transit } from './types.js';

// Constants for transit calculations
const EXACT_TIME_ORB_THRESHOLD = 2; // degrees - only calculate exact times within this orb
const EXACT_TIME_SEARCH_WINDOW = 5; // days - search window for exact transit time
const UPCOMING_TRANSITS_ORB_FILTER = 2; // degrees - filter for upcoming transits
const DEFAULT_UPCOMING_DAYS = 7; // days - default lookahead for upcoming transits

export class TransitCalculator {
  private ephem: EphemerisCalculator;

  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  findTransits(
    transitingPlanets: PlanetPosition[],
    natalPlanets: PlanetPosition[],
    currentJD: number
  ): Transit[] {
    const transits: Transit[] = [];

    for (const transitPlanet of transitingPlanets) {
      for (const natalPlanet of natalPlanets) {
        const angle = this.ephem.calculateAspectAngle(
          transitPlanet.longitude,
          natalPlanet.longitude
        );

        for (const aspect of ASPECTS) {
          const orb = Math.abs(angle - aspect.angle);

          if (orb <= aspect.orb) {
            const isApplying = this.isApplying(
              transitPlanet.longitude,
              natalPlanet.longitude,
              transitPlanet.speed,
              aspect.angle
            );

            let exactTime: Date | undefined;
            if (orb < EXACT_TIME_ORB_THRESHOLD) {
              // For non-conjunction/opposition aspects, there are 2 possible target longitudes
              const target1 = (natalPlanet.longitude + aspect.angle) % 360;
              const target2 = (natalPlanet.longitude - aspect.angle + 360) % 360;
              
              const planetId = this.getPlanetIdByName(transitPlanet.planet);
              
              // Skip exact time calculation for unknown bodies
              if (planetId === null) {
                continue;
              }
              
              // Calculate dynamic search window based on planet speed
              // Slow movers (Saturn/Uranus/Neptune/Pluto) need wider windows
              const speed = Math.abs(transitPlanet.speed);
              const daysToMove2Deg = speed > 0 ? 2 / speed : 30;
              const searchWindow = Math.min(Math.max(daysToMove2Deg, EXACT_TIME_SEARCH_WINDOW), 90);
              
              // Search both targets (for conjunction/opposition, they're the same or opposite)
              const exactJD1 = this.ephem.findExactTransitTime(
                planetId, target1,
                currentJD - searchWindow, currentJD + searchWindow
              );
              const exactJD2 = aspect.angle !== 0 && aspect.angle !== 180
                ? this.ephem.findExactTransitTime(
                    planetId, target2,
                    currentJD - searchWindow, currentJD + searchWindow
                  )
                : null;
              
              // Pick the closer one to current JD
              let exactJD: number | null = null;
              if (exactJD1 && exactJD2) {
                exactJD = Math.abs(exactJD1 - currentJD) < Math.abs(exactJD2 - currentJD) 
                  ? exactJD1 
                  : exactJD2;
              } else {
                exactJD = exactJD1 || exactJD2;
              }
              
              if (exactJD) {
                exactTime = this.ephem.julianDayToDate(exactJD);
              }
            }

            transits.push({
              transitingPlanet: transitPlanet.planet,
              natalPlanet: natalPlanet.planet,
              aspect: aspect.name,
              orb,
              exactTime,
              isApplying,
              transitLongitude: transitPlanet.longitude,
              natalLongitude: natalPlanet.longitude,
            });
          }
        }
      }
    }

    return transits.sort((a, b) => a.orb - b.orb);
  }

  private isApplying(
    transitLon: number,
    natalLon: number,
    speed: number,
    aspectAngle: number
  ): boolean {
    if (speed === 0) return false;

    const currentAngle = this.ephem.calculateAspectAngle(transitLon, natalLon);
    const futureAngle = this.ephem.calculateAspectAngle(transitLon + speed, natalLon);

    return Math.abs(futureAngle - aspectAngle) < Math.abs(currentAngle - aspectAngle);
  }

  private calculateTargetLongitude(natalLon: number, aspectAngle: number): number {
    let target = (natalLon + aspectAngle) % 360;
    if (target < 0) target += 360;
    return target;
  }

  private getPlanetIdByName(name: string): number | null {
    const planetMap: { [key: string]: number } = {
      Sun: 0,
      Moon: 1,
      Mercury: 2,
      Venus: 3,
      Mars: 4,
      Jupiter: 5,
      Saturn: 6,
      Uranus: 7,
      Neptune: 8,
      Pluto: 9,
      Chiron: 15,
      Ceres: 17,
      Pallas: 18,
      Juno: 19,
      Vesta: 20,
      'North Node (Mean)': 10,
      'North Node (True)': 11,
    };
    const id = planetMap[name];
    if (id === undefined) {
      // Return null for unknown bodies - skip exact time calculation
      return null;
    }
    return id;
  }

  getUpcomingTransits(
    transitingPlanetIds: number[],
    natalChart: NatalChart,
    daysAhead: number = DEFAULT_UPCOMING_DAYS
  ): Transit[] {
    const now = new Date();
    const allTransits: Transit[] = [];

    for (let day = 0; day <= daysAhead; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      const jd = this.ephem.dateToJulianDay(date);

      const transitingPlanets = this.ephem.getAllPlanets(jd, transitingPlanetIds);
      const transits = this.findTransits(transitingPlanets, natalChart.planets || [], jd);

      allTransits.push(...transits);
    }

    const uniqueTransits = this.deduplicateTransits(allTransits);
    return uniqueTransits.filter((t) => t.orb <= UPCOMING_TRANSITS_ORB_FILTER);
  }

  private deduplicateTransits(transits: Transit[]): Transit[] {
    const bestTransits = new Map<string, Transit>();
    
    for (const t of transits) {
      const key = `${t.transitingPlanet}-${t.natalPlanet}-${t.aspect}`;
      const existing = bestTransits.get(key);
      
      if (!existing) {
        bestTransits.set(key, t);
      } else {
        // Keep the better instance:
        // 1. Prefer exact time if available
        // 2. Otherwise prefer smaller orb
        const shouldReplace = 
          (t.exactTime && !existing.exactTime) ||
          (!t.exactTime && !existing.exactTime && t.orb < existing.orb);
        
        if (shouldReplace) {
          bestTransits.set(key, t);
        }
      }
    }
    
    return Array.from(bestTransits.values());
  }
}
