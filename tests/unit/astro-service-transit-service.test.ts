import { describe, expect, it, vi } from 'vitest';
import { TransitService } from '../../src/astro-service/transit-service.js';
import type { McpStartupDefaults } from '../../src/entrypoint.js';
import type { NatalChart, PlanetPosition } from '../../src/types.js';

function makePlanet(planet: PlanetPosition['planet'], longitude: number): PlanetPosition {
  return {
    planetId: 0,
    planet,
    longitude,
    latitude: 0,
    distance: 1,
    speed: 1,
    sign: 'Aries',
    degree: longitude % 30,
    isRetrograde: false,
  };
}

function makeNatalChart(): NatalChart {
  return {
    name: 'Test User',
    birthDate: { year: 1990, month: 6, day: 12, hour: 14, minute: 35 },
    location: { latitude: 37.7749, longitude: -122.4194, timezone: 'America/Los_Angeles' },
    planets: [makePlanet('Sun', 10), makePlanet('Moon', 20)],
    julianDay: 2451545,
    houseSystem: 'P',
    utcDateTime: { year: 1990, month: 6, day: 12, hour: 21, minute: 35 },
  };
}

function makeTransitService(mcpStartupDefaults: McpStartupDefaults = {}) {
  const ephem = {
    dateToJulianDay: vi.fn((date: Date) => date.getTime() / 86400000 + 2440587.5),
    calculateAspectAngle: vi.fn((a: number, b: number) => {
      const diff = Math.abs(a - b);
      return diff > 180 ? 360 - diff : diff;
    }),
    getAllPlanets: vi.fn(() => [makePlanet('Sun', 204), makePlanet('Moon', 270)]),
    getPlanetPosition: vi.fn((planetId: number) => makePlanet(planetId === 1 ? 'Moon' : 'Sun', 100)),
  };
  const houseCalc = {
    calculateHouses: vi.fn(() => ({
      ascendant: 270,
      mc: 204,
      cusps: [0, 270, 300, 330, 0, 30, 60, 90, 120, 150, 204, 240, 260],
      system: 'W' as const,
    })),
  };
  const transitCalc = {
    findTransits: vi.fn(() => [
      {
        transitingPlanet: 'Mars',
        natalPlanet: 'Sun',
        aspect: 'square',
        orb: 1.25,
        isApplying: true,
        exactTimeStatus: 'within_preview' as const,
        transitLongitude: 100,
        natalLongitude: 10,
        exactTime: new Date('2024-03-27T12:00:00Z'),
      },
    ]),
  };
  const now = vi.fn(() => new Date('2024-03-26T12:00:00Z'));
  const formatTimestamp = vi.fn((date: Date, timezone: string) => `${timezone}:${date.toISOString()}`);

  const transitService = new TransitService({
    ephem: ephem as any,
    transitCalc: transitCalc as any,
    houseCalc: houseCalc as any,
    mcpStartupDefaults,
    now,
    formatTimestamp,
  });

  return { transitService, ephem, houseCalc, transitCalc, now, formatTimestamp };
}

describe('When using the extracted TransitService', () => {
  it('Given omitted mode and days_ahead 0, then it preserves snapshot semantics', () => {
    const { transitService, transitCalc } = makeTransitService();

    const result = transitService.getTransits(makeNatalChart(), {});

    expect(transitCalc.findTransits).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({
      mode: 'snapshot',
      mode_source: 'legacy_default',
      days_ahead: 0,
      window_start: '2024-03-26',
      window_end: '2024-03-26',
    });
    expect(result.text).toContain('Transit snapshot');
  });

  it('Given a preferred reporting timezone that crosses midnight, then forecast labels use reporting time while payload keeps both zones', () => {
    const { transitService } = makeTransitService({
      preferredTimezone: 'Asia/Tokyo',
    });

    const result = transitService.getTransits(makeNatalChart(), {
      date: '2024-03-26',
      mode: 'forecast',
    });

    expect(result.data).toMatchObject({
      timezone: 'Asia/Tokyo',
      calculation_timezone: 'America/Los_Angeles',
      reporting_timezone: 'Asia/Tokyo',
      window_start: '2024-03-27',
      window_end: '2024-03-27',
      forecast: [{ date: '2024-03-27' }],
    });
  });

  it('Given an exact transit time, then house placement uses exact-time longitude instead of the sampled longitude', () => {
    const { transitService, ephem } = makeTransitService();
    ephem.dateToJulianDay.mockImplementation((date: Date) => {
      if (date.toISOString() === '2024-03-27T12:00:00.000Z') {
        return 9999;
      }
      return date.getTime() / 86400000 + 2440587.5;
    });
    ephem.getPlanetPosition.mockReturnValue(makePlanet('Mars', 330));

    const result = transitService.getTransits(makeNatalChart(), { mode: 'snapshot' });

    expect((result.data as any).transits[0]).toMatchObject({
      transitLongitude: 100,
      transitHouse: 3,
    });
  });

  it('Given mundane expansion over multiple days, then it returns an anchored payload plus per-day mundane slices', () => {
    const { transitService, ephem } = makeTransitService();
    ephem.getAllPlanets.mockReturnValue([
      { ...makePlanet('Sun', 0), speed: 1 },
      { ...makePlanet('Moon', 90), speed: 1 },
      { ...makePlanet('Mars', 120), speed: 1 },
    ]);

    const result = transitService.getTransits(makeNatalChart(), {
      include_mundane: true,
      days_ahead: 1,
    });

    expect((result.data as any).mundane).toMatchObject({
      date: '2024-03-26',
      timezone: 'America/Los_Angeles',
    });
    expect((result.data as any).mundane.days).toHaveLength(2);
    expect(result.text).toContain('Current Planetary Positions');
  });
});
