import { PLANETS } from '../../../../src/types.js';
import type {
  AstrologEdgeParityFixture,
  AstrologHouseParityFixture,
  AstrologPositionParityFixture,
  AstrologTransitSnapshotFixture,
} from '../../utils/fixtureTypes.js';

const CORE_PARITY_PLANET_IDS = [
  PLANETS.SUN,
  PLANETS.MOON,
  PLANETS.MERCURY,
  PLANETS.VENUS,
  PLANETS.MARS,
  PLANETS.JUPITER,
  PLANETS.SATURN,
  PLANETS.URANUS,
  PLANETS.NEPTUNE,
  PLANETS.PLUTO,
];

export const astrologPositionParityFixtures: AstrologPositionParityFixture[] = [
  { name: 'positions-modern-baseline-noon', isoUtc: '2024-03-26T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-modern-baseline-midnight', isoUtc: '2024-03-26T00:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-leap-day-2024-02-29', isoUtc: '2024-02-29T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-year-boundary-dec31', isoUtc: '2024-12-31T23:59:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-spring-equinox-window', isoUtc: '2024-03-20T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-autumn-equinox-window', isoUtc: '2024-09-22T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-mercury-retrograde', isoUtc: '2024-04-10T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-venus-retrograde', isoUtc: '2023-08-10T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-mars-station-window', isoUtc: '2024-12-08T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-pluto-or-uranus-station-window', isoUtc: '2024-09-02T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-far-past-date', isoUtc: '1905-06-15T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
  { name: 'positions-near-future-date', isoUtc: '2035-05-10T12:00:00Z', planetIds: CORE_PARITY_PLANET_IDS },
];

export const astrologHouseParityFixtures: AstrologHouseParityFixture[] = [
  {
    name: 'houses-whole-sign-midlat-north',
    isoUtc: '2024-03-26T12:00:00Z',
    latitude: 40.7128,
    longitude: -74.006,
    houseSystem: 'W',
  },
  {
    name: 'houses-whole-sign-southern-hemisphere',
    isoUtc: '2024-09-01T00:00:00Z',
    latitude: -33.8688,
    longitude: 151.2093,
    houseSystem: 'W',
  },
  {
    name: 'houses-whole-sign-date-line-ish-longitude',
    isoUtc: '2024-06-01T12:00:00Z',
    latitude: -18.1248,
    longitude: 178.4501,
    houseSystem: 'W',
  },
  {
    name: 'houses-placidus-midlat-sanity',
    isoUtc: '2024-03-26T12:00:00Z',
    latitude: 51.5072,
    longitude: -0.1276,
    houseSystem: 'P',
  },
  {
    name: 'houses-high-latitude-fallback',
    isoUtc: '2024-12-21T00:00:00Z',
    latitude: 78.2232,
    longitude: 15.6267,
    houseSystem: 'P',
    expectFallbackToWholeSign: true,
  },
];

export const astrologTransitSnapshotFixtures: AstrologTransitSnapshotFixture[] = [
  {
    name: 'transits-mercury-retrograde-snapshot',
    currentIsoUtc: '2024-04-10T12:00:00Z',
    transitingPlanetId: PLANETS.MERCURY,
    natalPlanetId: PLANETS.VENUS,
    natalOffsetDegrees: 92,
    expectedAspect: 'square',
    maxOrb: 8,
  },
  {
    name: 'transits-moon-fast-motion-snapshot',
    currentIsoUtc: '2024-03-26T12:00:00Z',
    transitingPlanetId: PLANETS.MOON,
    natalPlanetId: PLANETS.MARS,
    natalOffsetDegrees: 120,
    expectedAspect: 'trine',
    maxOrb: 8,
  },
  {
    name: 'transits-square-dual-target',
    currentIsoUtc: '2024-03-15T00:00:00Z',
    transitingPlanetId: PLANETS.MARS,
    natalPlanetId: PLANETS.VENUS,
    natalOffsetDegrees: 90,
    expectedAspect: 'square',
    maxOrb: 8,
  },
  {
    name: 'transits-trine-or-sextile-dual-target',
    currentIsoUtc: '2024-03-15T00:00:00Z',
    transitingPlanetId: PLANETS.JUPITER,
    natalPlanetId: PLANETS.SUN,
    natalOffsetDegrees: 60,
    expectedAspect: 'sextile',
    maxOrb: 8,
  },
  {
    name: 'transits-slow-mover-in-orb',
    currentIsoUtc: '2024-10-01T00:00:00Z',
    transitingPlanetId: PLANETS.PLUTO,
    natalPlanetId: PLANETS.MARS,
    natalOffsetDegrees: 180,
    expectedAspect: 'opposition',
    maxOrb: 8,
  },
];

export const astrologEdgeParityFixtures: AstrologEdgeParityFixture[] = [
  {
    name: 'edge-longitude-wrap-near-zero',
    isoUtc: '2024-03-20T03:06:00Z',
    planetIds: CORE_PARITY_PLANET_IDS,
  },
  {
    name: 'edge-dst-ambiguous-local-time',
    isoUtc: '2024-11-03T08:30:00.000Z',
    planetIds: CORE_PARITY_PLANET_IDS,
    local: { year: 2024, month: 11, day: 3, hour: 1, minute: 30 },
    timezone: 'America/Los_Angeles',
    disambiguation: 'earlier',
  },
  {
    name: 'edge-dst-nonexistent-local-time',
    isoUtc: '2024-03-10T10:30:00.000Z',
    planetIds: CORE_PARITY_PLANET_IDS,
    local: { year: 2024, month: 3, day: 10, hour: 2, minute: 30 },
    timezone: 'America/Los_Angeles',
    disambiguation: 'compatible',
  },
];
