// Type unions for domain constraints
export type HouseSystem = 'P' | 'K' | 'W' | 'E' | 'O' | 'R' | 'C' | 'A' | 'V' | 'X' | 'H' | 'T' | 'B';
export type SolarEclipseType = 'partial' | 'annular' | 'total' | 'annular-total';
export type LunarEclipseType = 'penumbral' | 'partial' | 'total';
export type PlanetName = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Pluto' | 'Chiron' | 'North Node (Mean)' | 'North Node (True)' | 'Ceres' | 'Pallas' | 'Juno' | 'Vesta';

export interface NatalChart {
  name: string;
  birthDate: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  };
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
  };
  planets?: PlanetPosition[];
  julianDay?: number; // Cached Julian Day for birth time (UTC)
  houseSystem?: HouseSystem; // Preferred house system
  utcDateTime?: { // UTC equivalent of birth time
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  };
}

export interface PlanetPosition {
  planet: PlanetName;
  longitude: number;
  latitude: number;
  distance: number;
  speed: number;
  sign: string;
  degree: number;
  isRetrograde: boolean;
}

interface BaseTransit {
  transitingPlanet: PlanetName;
  natalPlanet: PlanetName;
  aspect: AspectType;
  orb: number;
  isApplying: boolean;
  transitLongitude: number;
  natalLongitude: number;
}

export interface Transit extends BaseTransit {
  exactTime?: Date;
}

export interface TransitData extends BaseTransit {
  exactTime?: string; // ISO timestamp
}

export interface TransitResponse {
  date: string; // ISO date
  timezone: string;
  transits: TransitData[];
}

export interface PlanetPositionResponse {
  date: string; // ISO date
  timezone: string;
  positions: PlanetPosition[];
}

export type AspectType = 'conjunction' | 'opposition' | 'square' | 'trine' | 'sextile';

export const ASPECTS: Array<{ name: AspectType; angle: number; orb: number }> = [
  { name: 'conjunction', angle: 0, orb: 8 },
  { name: 'opposition', angle: 180, orb: 8 },
  { name: 'square', angle: 90, orb: 7 },
  { name: 'trine', angle: 120, orb: 7 },
  { name: 'sextile', angle: 60, orb: 6 },
];

export const PLANETS = {
  SUN: 0,
  MOON: 1,
  MERCURY: 2,
  VENUS: 3,
  MARS: 4,
  JUPITER: 5,
  SATURN: 6,
  URANUS: 7,
  NEPTUNE: 8,
  PLUTO: 9,
  MEAN_NODE: 10,
  TRUE_NODE: 11,
  CHIRON: 15,
  CERES: 17,
  PALLAS: 18,
  JUNO: 19,
  VESTA: 20,
} as const;

export type PlanetId = typeof PLANETS[keyof typeof PLANETS];

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

export const PERSONAL_PLANETS = [
  PLANETS.SUN,
  PLANETS.MOON,
  PLANETS.MERCURY,
  PLANETS.VENUS,
  PLANETS.MARS,
];
export const OUTER_PLANETS = [
  PLANETS.JUPITER,
  PLANETS.SATURN,
  PLANETS.URANUS,
  PLANETS.NEPTUNE,
  PLANETS.PLUTO,
];
export const ASTEROIDS = [
  PLANETS.CHIRON,
  PLANETS.CERES,
  PLANETS.PALLAS,
  PLANETS.JUNO,
  PLANETS.VESTA,
];
export const NODES = [PLANETS.MEAN_NODE, PLANETS.TRUE_NODE];

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
 * - Index 0: Unused (by convention)
 * - Index 1-12: Houses 1-12
 * - Length: 13
 */
export type HouseCusps = number[];

export interface HouseData {
  ascendant: number;
  mc: number;
  cusps: HouseCusps;
  system: HouseSystem;
}

export interface RiseSetTime {
  planet: string;
  rise?: Date;
  set?: Date;
  upperMeridianTransit?: Date; // Upper meridian crossing (highest point)
  lowerMeridianTransit?: Date; // Lower meridian crossing (lowest point)
}

export interface EclipseInfo {
  type: 'solar' | 'lunar';
  date: Date;
  eclipseType: string;
  maxTime: Date;
}
