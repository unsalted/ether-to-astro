import type {
  GetElectionalContextInput,
  GetRisingSignWindowsInput,
  GetTransitsInput,
} from '../../../src/astro-service/service-types.js';
import type { McpStartupDefaults } from '../../../src/entrypoint.js';
import type { HouseSystem, PlanetName } from '../../../src/types.js';

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

export interface NormalizedElectionalContext {
  houseSystem: string;
  classification: 'day' | 'night';
  isDayChart: boolean;
  sunAltitudeDegrees: number;
  rawSunAltitudeDegrees: number;
  sunAltitudeDisplaysZero: boolean;
  warnings: string[];
  hasApplyingAspects: boolean;
  applyingAspectCount: number;
  hasMoonApplyingAspects: boolean;
  moonApplyingAspectCount: number;
  hasRulerBasics: boolean;
}

export interface NormalizedRisingSignWindow {
  sign: string;
  start: string;
  end: string;
  durationMs: number;
}

export interface NormalizedRisingSignWindowResult {
  date: string;
  timezone: string;
  mode: 'approximate' | 'exact';
  windows: NormalizedRisingSignWindow[];
}

export interface NormalizedServiceTransit {
  transitingPlanet: string;
  natalPlanet: string;
  aspect: string;
  orb: number;
  exactTime?: string;
  exactTimeStatus?: 'within_preview' | 'outside_preview' | 'not_found' | 'unsupported_body';
  isApplying: boolean;
  transitSign?: string;
  transitDegree?: number;
  transitHouse?: number;
  natalSign?: string;
  natalDegree?: number;
  natalHouse?: number;
}

export interface NormalizedServiceTransitForecastDay {
  date: string;
  transits: NormalizedServiceTransit[];
}

export interface NormalizedServiceTransitResult {
  mode?: 'snapshot' | 'best_hit' | 'forecast';
  modeSource?: 'legacy_default' | 'explicit';
  date?: string;
  timezone: string;
  calculationTimezone?: string;
  reportingTimezone?: string;
  daysAhead?: number;
  windowStart?: string;
  windowEnd?: string;
  transits?: NormalizedServiceTransit[];
  forecast?: NormalizedServiceTransitForecastDay[];
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
  expectExactTimeStatus?:
    | 'within_preview'
    | 'outside_preview'
    | 'not_found'
    | 'unsupported_body'
    | 'undefined';
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

export interface ElectionalFixture {
  name: string;
  input: GetElectionalContextInput;
  expected: {
    classification: 'day' | 'night';
    isDayChart: boolean;
    houseSystem?: string;
    rawSunAltitudeSign?: 'positive' | 'negative' | 'zero';
    sunAltitudeDisplaysZero?: boolean;
    warningsContain?: string[];
    hasApplyingAspects?: boolean;
    hasMoonApplyingAspects?: boolean;
    hasRulerBasics?: boolean;
  };
}

export interface RisingSignWindowsFixture {
  name: string;
  input: GetRisingSignWindowsInput;
  expectedTotalDurationMinutes: number;
  minWindows?: number;
  expectOffsetChange?: boolean;
}

export interface RisingSignModeComparisonFixture {
  name: string;
  baseInput: Omit<GetRisingSignWindowsInput, 'mode'>;
}

export interface ServiceTransitNatalFixture {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  julianDayIsoUtc: string;
  houseSystem?: HouseSystem;
  planetOffsets: Array<{
    transitingPlanetId: number;
    natalPlanetId: number;
    natalOffsetDegrees: number;
  }>;
}

export interface ServiceTransitFixture {
  name: string;
  natalChart: ServiceTransitNatalFixture;
  input: GetTransitsInput;
  startupDefaults?: McpStartupDefaults;
  expected: {
    mode: 'snapshot' | 'best_hit' | 'forecast';
    timezone: string;
    calculationTimezone: string;
    reportingTimezone: string;
    windowStart?: string;
    windowEnd?: string;
    forecastDays?: number;
    expectTransit: {
      transitingPlanet: string;
      natalPlanet: string;
      aspect: string;
      transitSign?: string;
      transitDegree?: number;
      natalSign?: string;
      natalDegree?: number;
    };
  };
}
