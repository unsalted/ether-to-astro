// Type unions for domain constraints
export type HouseSystem =
  | 'P'
  | 'K'
  | 'W'
  | 'E'
  | 'O'
  | 'R'
  | 'C'
  | 'A'
  | 'V'
  | 'X'
  | 'H'
  | 'T'
  | 'B';
export type SolarEclipseType = 'partial' | 'annular' | 'total' | 'annular-total';
export type LunarEclipseType = 'penumbral' | 'partial' | 'total';
export type PlanetName =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto'
  | 'Chiron'
  | 'North Node (Mean)'
  | 'North Node (True)'
  | 'Ceres'
  | 'Pallas'
  | 'Juno'
  | 'Vesta';

/**
 * Represents a complete natal birth chart with all necessary data for calculations
 *
 * @remarks
 * This is the core data structure for the MCP server. All calculations (transits,
 * houses, charts) are based on this chart data.
 *
 * The julianDay field is calculated during set_natal_chart and should always be
 * present for charts created in the current session.
 */
export interface NatalChart {
  name: string;
  /** Birth date and time in local timezone */
  birthDate: {
    /** Full year (e.g., 1990) */
    year: number;
    /** Month number (1-12) */
    month: number;
    /** Day of month (1-31) */
    day: number;
    /** Hour in 24-hour format (0-23) */
    hour: number;
    /** Minute (0-59) */
    minute: number;
    /** Optional seconds for precision */
    second?: number;
  };
  /** Birth location coordinates and timezone */
  location: {
    /** Latitude in decimal degrees (-90 to 90, negative for South) */
    latitude: number;
    /** Longitude in decimal degrees (-180 to 180, negative for West) */
    longitude: number;
    /** IANA timezone identifier (e.g., 'America/New_York') */
    timezone: string;
  };
  /** Optional pre-calculated planet positions (rarely used) */
  planets?: PlanetPosition[];
  /**
   * Cached Julian Day for birth time (UTC)
   * @remarks
   * This is calculated during set_natal_chart and should always be present.
   * Required for chart generation and transit calculations.
   */
  julianDay?: number;
  /**
   * Preferred house system for calculations
   * @default 'P' (Placidus)
   * @remarks
   * For polar latitudes (>66°), Whole Sign ('W') may be used as fallback.
   */
  houseSystem?: HouseSystem;
  /**
   * Explicit house system requested when the natal chart was created
   * @remarks
   * This stays undefined when the caller relied on runtime defaults.
   */
  requestedHouseSystem?: HouseSystem;
  /**
   * UTC equivalent of birth time
   * @remarks
   * Calculated from local birth time using timezone conversion.
   * Used for Julian Day calculation to avoid timezone bugs.
   */
  utcDateTime?: {
    /** UTC year */
    year: number;
    /** UTC month */
    month: number;
    /** UTC day */
    day: number;
    /** UTC hour */
    hour: number;
    /** UTC minute */
    minute: number;
    /** Optional UTC seconds */
    second?: number;
  };
}

/**
 * Represents a planet's position at a specific time
 *
 * @remarks
 * All angular measurements are in degrees. Longitude is along the ecliptic,
 * latitude is celestial latitude (distance from ecliptic).
 */
export interface PlanetPosition {
  /** Swiss Ephemeris planet ID */
  planetId: number;
  /** Planet name (e.g., 'Sun', 'Moon', 'Mercury') */
  planet: PlanetName;
  /**
   * Ecliptic longitude in degrees (0-360)
   * @remarks
   * 0° Aries, 90° Cancer, 180° Libra, 270° Capricorn
   */
  longitude: number;
  /**
   * Celestial latitude in degrees (-90 to 90)
   * @remarks
   * Positive is north of ecliptic, negative is south
   */
  latitude: number;
  /** Distance from Earth in AU (Astronomical Units) */
  distance: number;
  /**
   * Daily motion in degrees per day
   * @remarks
   * Positive = direct motion, Negative = retrograde
   */
  speed: number;
  /** Zodiac sign the planet is in (e.g., 'Aries', 'Taurus') */
  sign: string;
  /** Degree within the sign (0-30) */
  degree: number;
  /**
   * Whether the planet is in retrograde motion
   * @remarks
   * Retrograde means the planet appears to move backward from Earth's perspective
   */
  isRetrograde: boolean;
}

/**
 * Base interface for all transit data
 *
 * @remarks
 * Contains the core transit information shared between internal Transit
 * and serialized TransitData types.
 */
interface BaseTransit {
  /** Planet currently transiting (moving) */
  transitingPlanet: PlanetName;
  /** Planet in the natal chart being aspected */
  natalPlanet: PlanetName;
  /** Type of aspect between the planets */
  aspect: AspectType;
  /**
   * Angular distance from exact aspect in degrees
   * @remarks
   * Lower values indicate stronger aspects. 0° is exact.
   */
  orb: number;
  /**
   * Whether the aspect is applying (getting stronger) or separating (weakening)
   * @remarks
   * true = applying (getting closer to exact)
   * false = separating (moving away from exact)
   */
  isApplying: boolean;
  /** Status of exact time lookup for this transit */
  exactTimeStatus?: 'within_preview' | 'outside_preview' | 'not_found' | 'unsupported_body';
  /** Current longitude of transiting planet */
  transitLongitude: number;
  /** Longitude of natal planet at birth time */
  natalLongitude: number;
}

/**
 * Internal transit representation with Date object
 *
 * @remarks
 * Used for calculations and internal storage. The exactTime is a Date object
 * for precise time comparisons.
 */
export interface Transit extends BaseTransit {
  /**
   * Exact time when aspect becomes perfect (0° orb)
   * @remarks
   * May be undefined if aspect is not within orb or exact time not calculated
   */
  exactTime?: Date;
}

/**
 * Serialized transit representation for API responses
 *
 * @remarks
 * Used when sending transit data to MCP clients. The exactTime is an ISO string
 * for JSON serialization.
 */
export interface TransitData extends BaseTransit {
  /**
   * Exact time when aspect becomes perfect (0° orb) as ISO string
   * @remarks
   * May be undefined if aspect is not within orb or exact time not calculated
   */
  exactTime?: string; // ISO timestamp
  /** Zodiac sign of the transiting planet */
  transitSign?: string;
  /** Degree of the transiting planet within its sign (0-30) */
  transitDegree?: number;
  /** House occupied by the transiting planet at the transit calculation time */
  transitHouse?: number;
  /** Zodiac sign of the natal planet */
  natalSign?: string;
  /** Degree of the natal planet within its sign (0-30) */
  natalDegree?: number;
  /** House occupied by the natal planet in the natal chart */
  natalHouse?: number;
}

/**
 * Response wrapper for transit data
 *
 * @remarks
 * Contains all transits for a specific date along with metadata
 * about the calculation context.
 */
export interface TransitResponse {
  /** ISO date of the transit calculation (YYYY-MM-DD) */
  date: string;
  /** Timezone used for reporting and user-facing day labels */
  timezone: string;
  /** Natal/local timezone used for date interpretation and astro calculations */
  calculation_timezone?: string;
  /** Timezone used for reporting and user-facing day labels */
  reporting_timezone?: string;
  /** Array of all active transits for the date */
  transits: TransitData[];
}

/**
 * Response wrapper for planet position data
 *
 * @remarks
 * Contains positions for all requested planets at a specific time.
 */
export interface PlanetPositionResponse {
  /** ISO date of the position calculation (YYYY-MM-DD) */
  date: string;
  /** Timezone used for the calculation */
  timezone: string;
  /** Array of planet positions */
  positions: PlanetPosition[];
}

export type ElectionalHouseSystem = Extract<HouseSystem, 'P' | 'K' | 'W' | 'R'>;

/**
 * Types of astrological aspects
 *
 * @remarks
 * Aspects are angular relationships between planets that indicate
 * specific types of interactions and energies.
 */
export type AspectType = 'conjunction' | 'opposition' | 'square' | 'trine' | 'sextile';

export type ElectionalPhaseName =
  | 'new'
  | 'crescent'
  | 'first_quarter'
  | 'gibbous'
  | 'full'
  | 'disseminating'
  | 'last_quarter'
  | 'balsamic';

export interface ElectionalAspect {
  from_body: PlanetName;
  to_body: PlanetName;
  aspect: AspectType;
  orb: number;
  applying: boolean;
  exact_at_utc?: string;
}

export interface ElectionalContextResponse {
  input: {
    date: string;
    time: string;
    timezone: string;
    latitude: number;
    longitude: number;
    house_system: ElectionalHouseSystem;
    instant_utc: string;
    jd_ut: number;
  };
  ascendant: {
    longitude: number;
    sign: string;
    degree_in_sign: number;
  };
  sect: {
    is_day_chart: boolean;
    sun_altitude_degrees: number;
    classification: 'day' | 'night';
  };
  moon: {
    longitude: number;
    sign: string;
    phase_angle: number;
    phase_name: ElectionalPhaseName;
    is_void_of_course: boolean | null;
    applying_aspects?: ElectionalAspect[];
  };
  applying_aspects?: ElectionalAspect[];
  ruler_basics?: {
    asc_sign_ruler: {
      body: PlanetName;
      longitude: number;
      sign: string;
      speed: number;
      is_retrograde: boolean;
    };
  };
  meta: {
    deterministic: true;
    requires_natal: false;
    warnings: string[];
    deferred_features: string[];
  };
}

/**
 * Aspect definitions with angles and default orbs
 *
 * @remarks
 * Each aspect has a specific angular relationship and an orb (tolerance).
 * The orb determines how far from exact the aspect can still be considered active.
 */
export const ASPECTS: Array<{ name: AspectType; angle: number; orb: number }> = [
  { name: 'conjunction', angle: 0, orb: 8 },
  { name: 'opposition', angle: 180, orb: 8 },
  { name: 'square', angle: 90, orb: 7 },
  { name: 'trine', angle: 120, orb: 7 },
  { name: 'sextile', angle: 60, orb: 6 },
];

/**
 * Swiss Ephemeris planet IDs
 *
 * @remarks
 * These are the numeric IDs used by the Swiss Ephemeris library.
 * The `as const` assertion ensures type safety when referencing planets.
 */
export const PLANETS = {
  /** Sun */
  SUN: 0,
  /** Moon */
  MOON: 1,
  /** Mercury */
  MERCURY: 2,
  /** Venus */
  VENUS: 3,
  /** Mars */
  MARS: 4,
  /** Jupiter */
  JUPITER: 5,
  /** Saturn */
  SATURN: 6,
  /** Uranus */
  URANUS: 7,
  /** Neptune */
  NEPTUNE: 8,
  /** Pluto */
  PLUTO: 9,
  /** Mean North Node (average position) */
  MEAN_NODE: 10,
  /** True North Node (actual position) */
  TRUE_NODE: 11,
  /** Chiron (comet/centaur) */
  CHIRON: 15,
  /** Ceres (dwarf planet/asteroid) */
  CERES: 17,
  /** Pallas (asteroid) */
  PALLAS: 18,
  /** Juno (asteroid) */
  JUNO: 19,
  /** Vesta (asteroid) */
  VESTA: 20,
} as const;

/**
 * Type derived from PLANETS constants
 *
 * @remarks
 * Ensures type safety when working with planet IDs.
 * Only values present in PLANETS are valid PlanetId values.
 */
export type PlanetId = (typeof PLANETS)[keyof typeof PLANETS];

/**
 * Mapping from planet IDs to human-readable names
 *
 * @remarks
 * Used for display purposes and converting between numeric IDs
 * and string names. Index signature allows number-based lookup.
 */
export const PLANET_NAMES: { [key: number]: PlanetName } = {
  0: 'Sun',
  1: 'Moon',
  2: 'Mercury',
  3: 'Venus',
  4: 'Mars',
  5: 'Jupiter',
  6: 'Saturn',
  7: 'Uranus',
  8: 'Neptune',
  9: 'Pluto',
  10: 'North Node (Mean)',
  11: 'North Node (True)',
  15: 'Chiron',
  17: 'Ceres',
  18: 'Pallas',
  19: 'Juno',
  20: 'Vesta',
};

/**
 * Personal planets (inner planets)
 *
 * @remarks
 * These planets move quickly and represent personal, day-to-day concerns:
 * - Sun: Identity, vitality
 * - Moon: Emotions, instincts
 * - Mercury: Communication, thinking
 * - Venus: Values, relationships
 * - Mars: Action, desire
 */
export const PERSONAL_PLANETS = [
  PLANETS.SUN,
  PLANETS.MOON,
  PLANETS.MERCURY,
  PLANETS.VENUS,
  PLANETS.MARS,
];
/**
 * Slow-moving planets (Jupiter through Pluto)
 *
 * @remarks
 * These planets move slowly and represent generational, societal themes.
 * Note: Includes Jupiter and Saturn (social planets) plus the true outer planets.
 */
export const OUTER_PLANETS = [
  PLANETS.JUPITER,
  PLANETS.SATURN,
  PLANETS.URANUS,
  PLANETS.NEPTUNE,
  PLANETS.PLUTO,
];
/**
 * Major asteroids
 *
 * @remarks
 * The four main asteroids used in astrology, representing feminine archetypes:
 * - Ceres: Nurturing, agriculture
 * - Pallas: Wisdom, strategy
 * - Juno: Partnership, commitment
 * - Vesta: Devotion, service
 */
export const ASTEROIDS = [
  PLANETS.CHIRON,
  PLANETS.CERES,
  PLANETS.PALLAS,
  PLANETS.JUNO,
  PLANETS.VESTA,
];
/**
 * Lunar nodes
 *
 * @remarks
 * The North and South Nodes represent points where the Moon's orbit
 * crosses the ecliptic. They indicate life path and evolutionary direction.
 */
export const NODES = [PLANETS.MEAN_NODE, PLANETS.TRUE_NODE];

/**
 * Zodiac signs in order
 *
 * @remarks
 * The 12 signs of the tropical zodiac, each spanning 30° of the ecliptic.
 * Used for determining which sign a planet is in.
 */
export const ZODIAC_SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

/**
 * House cusps in Swiss Ephemeris 1-based format
 *
 * @remarks
 * - Index 0: Unused (by convention)
 * - Index 1-12: Houses 1-12
 * - Length: 13
 *
 * The Swiss Ephemeris uses 1-based indexing for house cusps,
 * with index 0 unused by convention.
 */
export type HouseCusps = number[];

/**
 * Complete house system calculation results
 *
 * @remarks
 * Contains the angles (Ascendant, MC) and all house cusps for a given
 * time and location. The cusps array follows Swiss Ephemeris 1-based format.
 */
export interface HouseData {
  /**
   * Ascendant angle in degrees (0-360)
   * @remarks
   * The point where the ecliptic crosses the eastern horizon.
   * Represents the self, identity, and personal appearance.
   */
  ascendant: number;
  /**
   * Midheaven (Medium Coeli) angle in degrees (0-360)
   * @remarks
   * The highest point in the sky at the time of birth.
   * Represents career, public life, and reputation.
   */
  mc: number;
  /**
   * House cusps in Swiss 1-based format
   * @remarks
   * cusps[1] = House 1, cusps[2] = House 2, ..., cusps[12] = House 12
   * cusps[0] is unused by convention
   */
  cusps: HouseCusps;
  /**
   * The house system actually used for calculation
   * @remarks
   * May differ from requested system if fallback was used
   * (e.g., Whole Sign for polar latitudes)
   */
  system: HouseSystem;
}

/**
 * Rise, set, and meridian transit times for a celestial body
 *
 * @remarks
 * Contains the times when a planet rises above the horizon, sets below it,
 * and crosses the upper and lower meridians. Times may be undefined for
 * circumpolar objects (never rise/set) or at extreme latitudes.
 */
export interface RiseSetTime {
  /** Planet name */
  planet: string;
  /**
   * Time when planet rises above eastern horizon
   * @remarks
   * Undefined for circumpolar objects (always visible)
   */
  rise?: Date;
  /**
   * Time when planet sets below western horizon
   * @remarks
   * Undefined for circumpolar objects (always visible)
   */
  set?: Date;
  /**
   * Time when planet crosses upper meridian (highest point)
   * @remarks
   * This is the planet's "culmination" or "upper transit"
   */
  upperMeridianTransit?: Date;
  /**
   * Time when planet crosses lower meridian (lowest point)
   * @remarks
   * This is the planet's "lower transit" or "anti-culmination"
   */
  lowerMeridianTransit?: Date;
}

/**
 * Basic eclipse information
 *
 * @remarks
 * TODO: This should be replaced with a discriminated union for solar vs lunar eclipses
 * with richer phase timing data. See planning documents for details.
 */
export interface EclipseInfo {
  /** Type of eclipse: 'solar' or 'lunar' */
  type: 'solar' | 'lunar';
  /** Date of the eclipse */
  date: Date;
  /**
   * Eclipse classification
   * @remarks
   * TODO: Should use constrained union types:
   * - Solar: 'partial' | 'annular' | 'total' | 'annular-total'
   * - Lunar: 'penumbral' | 'partial' | 'total'
   */
  eclipseType: string;
  /** Time of maximum eclipse */
  maxTime: Date;
}
