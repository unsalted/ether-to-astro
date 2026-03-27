import type { PlanetName } from '../../../src/types.js';

export interface NormalizedBody {
  body: PlanetName | string;
  longitude: number;
  latitude?: number;
  speed?: number;
  retrograde?: boolean;
}

export interface NormalizedHouseResult {
  system: string;
  cusps: number[];
  ascendant: number;
  mc: number;
}

export interface NormalizedTransit {
  transitingPlanet: string;
  natalPlanet: string;
  aspect: string;
  orb: number;
  exactTime?: string;
  exactTimeStatus?: 'within_preview' | 'outside_preview' | 'not_found' | 'unsupported_body';
  isApplying: boolean;
}

export interface NormalizedRoot {
  jd: number;
  isoUtc: string;
}

export interface NormalizedRiseSet {
  body: string;
  rise?: string;
  set?: string;
  upperMeridianTransit?: string;
  lowerMeridianTransit?: string;
}

export interface NormalizedEclipse {
  type: 'solar' | 'lunar';
  eclipseType: string;
  maxTime: string;
}

export interface PositionFixture {
  name: string;
  isoUtc: string;
  planetIds: number[];
  expected: NormalizedBody[];
}

export interface AstrologPositionParityFixture {
  name: string;
  isoUtc: string;
  planetIds: number[];
}

export interface HouseFixture {
  name: string;
  isoUtc: string;
  latitude: number;
  longitude: number;
  houseSystem: string;
  expected: NormalizedHouseResult;
}

export interface AstrologHouseParityFixture {
  name: string;
  isoUtc: string;
  latitude: number;
  longitude: number;
  houseSystem: 'P' | 'W';
  expectFallbackToWholeSign?: boolean;
}

export interface RootFixture {
  name: string;
  planetId: number;
  startIsoUtc: string;
  endIsoUtc: string;
  targetLongitude?: number;
  targetFromStartLongitude?: boolean;
  targetFromSampledMinimum?: {
    samples: number;
  };
  expectedMinRoots?: number;
  expectedMaxRoots?: number;
}

export interface TransitFixture {
  name: string;
  currentIsoUtc: string;
  transitingPlanetId: number;
  natalPlanetId: number;
  natalOffsetDegrees: number;
  expectedAspect: 'conjunction' | 'opposition' | 'square' | 'trine' | 'sextile';
  expectedIsApplying?: boolean;
  expectExactTimeStatus?: 'within_preview' | 'outside_preview' | 'not_found' | 'unsupported_body' | 'undefined';
}

export interface AstrologTransitSnapshotFixture {
  name: string;
  currentIsoUtc: string;
  transitingPlanetId: number;
  natalPlanetId: number;
  natalOffsetDegrees: number;
  expectedAspect: 'conjunction' | 'opposition' | 'square' | 'trine' | 'sextile';
  maxOrb: number;
}

export interface RiseSetFixture {
  name: string;
  isoUtc: string;
  latitude: number;
  longitude: number;
  planetId: number;
  expectedNoRiseSet?: boolean;
}

export interface EclipseFixture {
  name: string;
  startIsoUtc: string;
  type: 'solar' | 'lunar';
}

export interface AstrologEdgeParityFixture {
  name: string;
  isoUtc: string;
  planetIds: number[];
  local?: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  };
  timezone?: string;
  disambiguation?: 'compatible' | 'earlier' | 'later' | 'reject';
}
