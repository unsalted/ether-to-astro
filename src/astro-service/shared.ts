import type { McpStartupDefaults } from '../entrypoint.js';
import {
  type HouseData,
  type HouseSystem,
  type NatalChart,
  type PlanetPosition,
  ZODIAC_SIGNS,
} from '../types.js';

/**
 * Normalize any longitude into the standard 0-360 range.
 *
 * @param longitude - Raw longitude in degrees, including negative or >360 values
 * @returns Longitude normalized into the half-open interval [0, 360)
 */
export function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

/**
 * Convert a raw longitude into zodiac sign and in-sign degree.
 *
 * @param longitude - Raw longitude in degrees
 * @returns Sign name plus degree within that sign
 *
 * @remarks
 * Rounded degree values that would otherwise land on 30.00 are carried into
 * the next sign so serialized placement stays astrologically valid.
 */
export function getSignAndDegree(longitude: number): { sign: string; degree: number } {
  const normalized = normalizeLongitude(longitude);
  const baseSignIndex = Math.floor(normalized / 30);
  const roundedDegree = Number.parseFloat((normalized % 30).toFixed(2));
  const shouldCarryToNextSign = roundedDegree >= 30;
  const signIndex = shouldCarryToNextSign
    ? (baseSignIndex + 1) % ZODIAC_SIGNS.length
    : baseSignIndex;

  return {
    sign: ZODIAC_SIGNS[signIndex],
    degree: shouldCarryToNextSign ? 0 : roundedDegree,
  };
}

/**
 * Normalize a serialized planet placement to the shared sign-boundary policy.
 *
 * @param position - Planet position to normalize for response output
 * @returns Copy of the position with sign/degree derived from shared boundary handling
 */
export function normalizePlanetPlacement(position: PlanetPosition): PlanetPosition {
  const placement = getSignAndDegree(position.longitude);

  return {
    ...position,
    sign: placement.sign,
    degree: placement.degree,
  };
}

/**
 * Map a longitude to its house number for a resolved house table.
 *
 * @param longitude - Longitude to place into a house
 * @param houses - Resolved house cusps for the relevant chart or moment
 * @returns 1-based house number
 */
export function getHouseNumber(longitude: number, houses: HouseData): number {
  const normalized = normalizeLongitude(longitude);

  for (let house = 1; house <= 12; house++) {
    const start = normalizeLongitude(houses.cusps[house]);
    const nextHouse = house === 12 ? 1 : house + 1;
    const end = normalizeLongitude(houses.cusps[nextHouse]);
    const span = (end - start + 360) % 360;
    const offset = (normalized - start + 360) % 360;

    if (span === 0 || offset === 0 || offset < span) {
      return house;
    }
  }

  return 12;
}

/**
 * Resolve the house system precedence shared by service entrypoints.
 *
 * @param natalChart - Natal chart carrying stored and requested house system state
 * @param startupDefaults - Process startup defaults that can provide fallback policy
 * @param explicitSystem - Per-call override when the caller requested a specific system
 * @returns Final house system to use for the calculation
 */
export function resolveHouseSystem(
  natalChart: NatalChart,
  startupDefaults: Readonly<McpStartupDefaults>,
  explicitSystem?: string
): HouseSystem {
  return (explicitSystem ||
    natalChart.requestedHouseSystem ||
    startupDefaults.preferredHouseStyle ||
    natalChart.houseSystem ||
    'P') as HouseSystem;
}

/**
 * Resolve the reporting timezone precedence shared by service entrypoints.
 *
 * @param startupDefaults - Process startup defaults
 * @param explicitTimezone - Per-call reporting timezone override
 * @param natalTimezone - Natal chart timezone used as fallback
 * @returns Final reporting timezone for text and date labels
 */
export function resolveReportingTimezone(
  startupDefaults: Readonly<McpStartupDefaults>,
  explicitTimezone?: string,
  natalTimezone?: string
): string {
  return explicitTimezone ?? startupDefaults.preferredTimezone ?? natalTimezone ?? 'UTC';
}

/**
 * Resolve both calculation and reporting timezones for chart-based workflows.
 *
 * @param startupDefaults - Process startup defaults
 * @param explicitReportingTimezone - Per-call reporting timezone override
 * @param natalTimezone - Natal chart timezone used for local-day interpretation
 * @returns Calculation timezone plus reporting timezone
 *
 * @remarks
 * Calculation timezone controls local-day math and ephemeris lookups. Reporting
 * timezone controls user-facing labels and formatted timestamps.
 */
export function resolveTimezones(
  startupDefaults: Readonly<McpStartupDefaults>,
  explicitReportingTimezone?: string,
  natalTimezone?: string
): {
  calculationTimezone: string;
  reportingTimezone: string;
} {
  return {
    calculationTimezone: natalTimezone ?? 'UTC',
    reportingTimezone: resolveReportingTimezone(
      startupDefaults,
      explicitReportingTimezone,
      natalTimezone
    ),
  };
}
