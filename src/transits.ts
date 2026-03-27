import type { EphemerisCalculator } from './ephemeris.js';
import { ASPECTS, type NatalChart, type PlanetPosition, type Transit, type TransitData, type TransitResponse } from './types.js';

// Constants for transit calculations
const EXACT_TIME_ORB_THRESHOLD = 2; // degrees - only calculate exact times within this orb
const EXACT_TIME_SEARCH_WINDOW = 5; // days - search window for exact transit time
const UPCOMING_TRANSITS_ORB_FILTER = 2; // degrees - filter for upcoming transits
const DEFAULT_UPCOMING_DAYS = 7; // days - default lookahead for upcoming transits

/**
 * Calculator for astrological transits and aspects
 * 
 * @remarks
 * Analyzes relationships between current planetary positions (transits)
 * and natal chart positions. Calculates aspects, orbs, and exact timing
 * when aspects become perfect.
 */
export class TransitCalculator {
  /** Ephemeris calculator instance */
  private ephem: EphemerisCalculator;

  /**
   * Create a new transit calculator
   * 
   * @param ephem - Initialized ephemeris calculator
   * @throws Error if ephemeris is not initialized
   * 
   * @remarks
   * The ephemeris calculator must be initialized before passing
   * to the TransitCalculator constructor.
   */
  constructor(ephem: EphemerisCalculator) {
    this.ephem = ephem;
  }

  /**
   * Find all active transits between two sets of planets
   * 
   * @param transitingPlanets - Current planetary positions
   * @param natalPlanets - Birth chart planetary positions
   * @param currentJD - Current Julian Day
   * @returns Array of active transits with aspect details
   * 
   * @remarks
   * Checks all combinations of transiting and natal planets against
   * all defined aspects. Includes exact time calculation for close aspects.
   */
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
              exactTime = this.calculateExactTransitTime(
                transitPlanet,
                natalPlanet,
                aspect,
                currentJD
              );
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

  /**
   * Calculate exact time when a transit aspect becomes perfect
   * 
   * @param transitingPlanet - Current transiting planet position
   * @param natalPlanet - Natal planet position
   * @param aspect - Aspect configuration
   * @param currentJD - Current Julian Day
   * @returns Date when aspect is exact, or undefined if not within orb
   * 
   * @remarks
   * Only calculates exact times for aspects within EXACT_TIME_ORB_THRESHOLD.
   * Uses binary search within a time window around the current date.
   */
  private calculateExactTransitTime(
    transitingPlanet: PlanetPosition,
    natalPlanet: PlanetPosition,
    aspect: { name: string; angle: number; orb: number },
    currentJD: number
  ): Date | undefined {
    // For non-conjunction/opposition aspects, there are 2 possible target longitudes
    const target1 = (natalPlanet.longitude + aspect.angle) % 360;
    const target2 = (natalPlanet.longitude - aspect.angle + 360) % 360;
    
    const planetId = this.getPlanetIdByName(transitingPlanet.planet);
    
    // Skip exact time calculation for unknown bodies
    if (planetId === null) {
      return undefined;
    }
    
    // Calculate dynamic search window based on planet speed
    // Slow movers (Saturn/Uranus/Neptune/Pluto) need wider windows
    const speed = Math.abs(transitingPlanet.speed);
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
      return this.ephem.julianDayToDate(exactJD);
    } else {
      return undefined;
    }
  }

  /**
   * Determine if an aspect is applying or separating
   * 
   * @param transitLon - Transiting planet longitude
   * @param natalLon - Natal planet longitude
   * @param transitSpeed - Transiting planet's daily motion
   * @param aspectAngle - Target aspect angle
   * @returns true if applying, false if separating
   * 
   * @remarks
   * Applying: Aspect getting stronger (closer to exact)
   * Separating: Aspect getting weaker (moving away from exact)
   */
  private isApplying(
    transitLon: number,
    natalLon: number,
    transitSpeed: number,
    aspectAngle: number
  ): boolean {
    if (transitSpeed === 0) return false;

    const currentAngle = this.ephem.calculateAspectAngle(transitLon, natalLon);
    const futureAngle = this.ephem.calculateAspectAngle(transitLon + transitSpeed, natalLon);

    return Math.abs(futureAngle - aspectAngle) < Math.abs(currentAngle - aspectAngle);
  }

  /**
   * Get target longitude for a specific aspect
   * 
   * @param natalLon - Natal planet longitude
   * @param aspectAngle - Target aspect angle
   * @returns Target longitude
   */
  private calculateTargetLongitude(natalLon: number, aspectAngle: number): number {
    let target = (natalLon + aspectAngle) % 360;
    if (target < 0) target += 360;
    return target;
  }

  /**
   * Get Swiss Ephemeris planet ID by name
   * 
   * @param planetName - Planet name string
   * @returns Swiss Ephemeris planet ID or null if not found
   * 
   * @remarks
   * Used to convert string names back to numeric IDs for
   * exact transit time calculations.
   */
  private getPlanetIdByName(planetName: string): number | null {
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
    const id = planetMap[planetName];
    if (id === undefined) {
      // Return null for unknown bodies - skip exact time calculation
      return null;
    }
    return id;
  }

  /**
   * Get all transits for a specific date
   * 
   * @param natalChart - Birth chart data
   * @param date - Date for transit calculation
   * @returns TransitResponse with all active transits
   * @throws Error if natal chart is invalid
   * 
   * @remarks
   * Calculates transits for the entire day at midnight UTC.
   * Returns formatted response with metadata.
   */
  async getTransitsForDate(natalChart: NatalChart, date: Date): Promise<TransitResponse> {
    const jd = this.ephem.dateToJulianDay(date);
    const transitingPlanets = this.ephem.getAllPlanets(jd, []);
    const transits = this.findTransits(transitingPlanets, natalChart.planets || [], jd);

    // Convert Transit[] to TransitData[] (serialize Date to ISO string)
    const transitData: TransitData[] = transits.map(t => ({
      ...t,
      exactTime: t.exactTime?.toISOString(),
    }));

    return {
      date: date.toISOString().split('T')[0], // ISO date string
      timezone: 'UTC', // TODO: Get from natalChart or parameter
      transits: transitData,
    };
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
