import type { EphemerisCalculator } from './ephemeris.js';
import {
  ASPECTS,
  type NatalChart,
  PLANETS,
  type PlanetPosition,
  type Transit,
  type TransitData,
  type TransitResponse,
} from './types.js';

// Constants for transit calculations
const EXACT_TIME_ORB_THRESHOLD = 2; // degrees - only calculate exact times within this orb (inclusive)
const EXACT_TIME_SEARCH_WINDOW = 5; // days - minimum solver search window for root finding
const PREVIEW_HORIZON_DAYS = 90; // days - product preview horizon for exposing exactTime

/**
 * Deduplicate transits by keeping the best hit per aspect
 * Priority: exact time > smallest orb > earliest exact time > deterministic tiebreakers
 *
 * @param transits - Array of transits to deduplicate
 * @returns Deduplicated array with one transit per unique aspect key
 *
 * @remarks
 * This is the production dedupe logic used by get_transits when collecting
 * transits over multiple days. The key is: transitingPlanet + natalPlanet + aspect.
 * Final tiebreakers use longitude and planet names for deterministic ordering.
 */
export function deduplicateTransits(transits: Transit[]): Transit[] {
  const bestTransits = new Map<string, Transit>();

  for (const t of transits) {
    const key = `${t.transitingPlanet}-${t.natalPlanet}-${t.aspect}`;
    const existing = bestTransits.get(key);

    if (!existing) {
      bestTransits.set(key, t);
    } else {
      // Priority: exact > smallest orb > earliest exact time > deterministic tiebreakers
      const shouldReplace =
        (t.exactTime && !existing.exactTime) ||
        (!!t.exactTime === !!existing.exactTime && t.orb < existing.orb) ||
        (t.orb === existing.orb &&
          t.exactTime &&
          existing.exactTime &&
          t.exactTime < existing.exactTime) ||
        (t.orb === existing.orb &&
          !t.exactTime &&
          !existing.exactTime &&
          t.transitLongitude < existing.transitLongitude) ||
        (t.orb === existing.orb &&
          !t.exactTime &&
          !existing.exactTime &&
          t.transitLongitude === existing.transitLongitude &&
          t.natalLongitude < existing.natalLongitude) ||
        (t.orb === existing.orb &&
          !t.exactTime &&
          !existing.exactTime &&
          t.transitLongitude === existing.transitLongitude &&
          t.natalLongitude === existing.natalLongitude &&
          t.transitingPlanet < existing.transitingPlanet) ||
        (t.orb === existing.orb &&
          !t.exactTime &&
          !existing.exactTime &&
          t.transitLongitude === existing.transitLongitude &&
          t.natalLongitude === existing.natalLongitude &&
          t.transitingPlanet === existing.transitingPlanet &&
          t.natalPlanet < existing.natalPlanet);

      if (shouldReplace) {
        bestTransits.set(key, t);
      }
    }
  }

  return Array.from(bestTransits.values());
}

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
  private readonly exactTimeSupportedPlanetIds = new Set<number>(Object.values(PLANETS));

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
   * all defined aspects. Includes exact time resolution for close aspects.
   *
   * Exact-time policy:
   * - Solver computes candidate roots in a bounded interval, capped to PREVIEW_HORIZON_DAYS.
   * - Product layer exposes exactTime only when root is within PREVIEW_HORIZON_DAYS.
   * - exactTimeStatus communicates why exactTime may be omitted.
   * - exactTimeStatus is only set when exact-time resolution is attempted
   *   (i.e. orb <= EXACT_TIME_ORB_THRESHOLD). When orb is wider, exactTimeStatus is undefined.
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
            const heuristicApplying = this.isApplying(
              transitPlanet.longitude,
              natalPlanet.longitude,
              transitPlanet.speed,
              aspect.angle
            );

            let exactTime: Date | undefined;
            let exactTimeStatus: Transit['exactTimeStatus'];
            let isApplying = heuristicApplying;
            if (orb <= EXACT_TIME_ORB_THRESHOLD) {
              const exactResult = this.calculateExactTransitTime(
                transitPlanet,
                natalPlanet,
                aspect,
                currentJD,
                heuristicApplying
              );
              exactTime = exactResult.exactTime;
              exactTimeStatus = exactResult.status;

              // Strong applying/separating policy:
              // selected root in future => applying, past => separating
              if (exactResult.selectedRoot != null) {
                isApplying = exactResult.selectedRoot >= currentJD;
              }
            }

            transits.push({
              transitingPlanet: transitPlanet.planet,
              natalPlanet: natalPlanet.planet,
              aspect: aspect.name,
              orb,
              exactTime,
              exactTimeStatus,
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
   * @param heuristicApplying - Applying/separating estimate used as fallback selector
   * @returns Exact-time resolution result including status and selected root
   *
   * @remarks
   * Solver and product concerns are intentionally separated:
   * - Solver: find candidate roots in [currentJD - searchWindow, currentJD + searchWindow]
   * - Product: expose exactTime only when selected root is within PREVIEW_HORIZON_DAYS
   *
   * Status semantics:
   * - within_preview: root found and exactTime exposed
   * - outside_preview: root found but exactTime hidden by product policy
   * - not_found: no root found in solver interval
   * - unsupported_body: exact-time solver not supported for the transiting body
   */
  private calculateExactTransitTime(
    transitingPlanet: PlanetPosition,
    natalPlanet: PlanetPosition,
    aspect: { name: string; angle: number; orb: number },
    currentJD: number,
    heuristicApplying: boolean
  ): {
    exactTime?: Date;
    status: NonNullable<Transit['exactTimeStatus']>;
    selectedRoot: number | null;
  } {
    // For non-conjunction/opposition aspects, there are 2 possible target longitudes
    const target1 = (natalPlanet.longitude + aspect.angle) % 360;
    const target2 = (natalPlanet.longitude - aspect.angle + 360) % 360;

    const planetId = transitingPlanet.planetId;

    // Skip exact time calculation for unsupported bodies
    if (!this.exactTimeSupportedPlanetIds.has(planetId)) {
      return { status: 'unsupported_body', selectedRoot: null };
    }

    // Calculate dynamic search window based on planet speed
    // Slow movers (Saturn/Uranus/Neptune/Pluto) need wider windows,
    // but solver horizon is capped to product preview horizon for bounded compute and aligned policy.
    const speed = Math.abs(transitingPlanet.speed);
    const daysToMove2Deg = speed > 0 ? 2 / speed : 30;
    const searchWindow = Math.min(
      Math.max(daysToMove2Deg, EXACT_TIME_SEARCH_WINDOW),
      PREVIEW_HORIZON_DAYS
    );

    // Search both targets (for conjunction/opposition, they're the same or opposite)
    // Solver returns all roots sorted earliest-first
    const roots1 = this.ephem.findExactTransitTimes(
      planetId,
      target1,
      currentJD - searchWindow,
      currentJD + searchWindow
    );
    const roots2 =
      aspect.angle !== 0 && aspect.angle !== 180
        ? this.ephem.findExactTransitTimes(
            planetId,
            target2,
            currentJD - searchWindow,
            currentJD + searchWindow
          )
        : [];

    // Combine all roots from both targets and sort
    const allRoots = [...roots1, ...roots2].sort((a, b) => a - b);

    // Split into past and future roots
    const futureRoots = allRoots.filter((jd) => jd >= currentJD);
    const pastRoots = allRoots.filter((jd) => jd < currentJD);

    // Select root based on applying/separating:
    // - Applying: pick earliest future root (approaching exact)
    // - Separating: pick latest past root (just passed exact), fallback to earliest future
    const selectedRoot = heuristicApplying
      ? (futureRoots[0] ?? null)
      : (pastRoots[pastRoots.length - 1] ?? futureRoots[0] ?? null);

    if (selectedRoot === null) {
      return { status: 'not_found', selectedRoot: null };
    }

    const daysUntilExact = selectedRoot - currentJD;

    // Product policy: only show exact time if within preview horizon
    // For outer planets, it's normal to be within 2° orb but months from exact
    if (Math.abs(daysUntilExact) > PREVIEW_HORIZON_DAYS) {
      return { status: 'outside_preview', selectedRoot };
    }

    return {
      exactTime: this.ephem.julianDayToDate(selectedRoot),
      status: 'within_preview',
      selectedRoot,
    };
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
   * Get all transits for a specific date
   *
   * @param natalChart - Birth chart data
   * @param date - Date for transit calculation (interpreted as-is, no timezone conversion)
   * @returns TransitResponse with all active transits
   * @throws Error if natal chart is invalid
   *
   * @remarks
   * Internal UTC primitive: calculates transits for the provided date/time as-is.
   * Caller is responsible for any user-facing timezone semantics.
   */
  async getTransitsForDate(date: Date, natalChart: NatalChart): Promise<TransitResponse> {
    const jd = this.ephem.dateToJulianDay(date);
    // Get all major planets (Sun through Pluto)
    const planetIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const transitingPlanets = this.ephem.getAllPlanets(jd, planetIds);
    const transits = this.findTransits(transitingPlanets, natalChart.planets || [], jd);

    // Convert Transit[] to TransitData[] (serialize Date to ISO string)
    const transitData: TransitData[] = transits.map((t) => ({
      ...t,
      exactTime: t.exactTime?.toISOString(),
    }));

    return {
      date: date.toISOString().split('T')[0],
      timezone: 'UTC',
      transits: transitData,
    };
  }
}
