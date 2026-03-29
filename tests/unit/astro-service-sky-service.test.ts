import { describe, expect, it, vi } from 'vitest';
import { SkyService } from '../../src/astro-service/sky-service.js';
import type { McpStartupDefaults } from '../../src/entrypoint.js';
import type { NatalChart, PlanetPosition, RiseSetTime } from '../../src/types.js';

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

function makeSkyService(mcpStartupDefaults: McpStartupDefaults = {}) {
  const ephem = {
    dateToJulianDay: vi.fn((date: Date) => date.getTime() / 86400000 + 2440587.5),
    getAllPlanets: vi.fn(() => [makePlanet('Mercury', 42), { ...makePlanet('Saturn', 315), sign: 'Aquarius', isRetrograde: true }]),
  };
  const riseSetCalc = {
    getAllRiseSet: vi.fn(async () => [
      {
        planet: 'Sun',
        rise: new Date('2024-03-26T13:00:00Z'),
        set: new Date('2024-03-27T01:00:00Z'),
      },
    ] as RiseSetTime[]),
  };
  const eclipseCalc = {
    findNextSolarEclipse: vi.fn(() => ({
      type: 'solar' as const,
      date: new Date('2024-04-08T18:00:00Z'),
      eclipseType: 'Total',
      maxTime: new Date('2024-04-08T18:00:00Z'),
    })),
    findNextLunarEclipse: vi.fn(() => null),
  };
  const now = vi.fn(() => new Date('2024-03-26T12:00:00Z'));
  const formatTimestamp = vi.fn((date: Date, timezone: string) => `${timezone}:${date.toISOString()}`);

  const skyService = new SkyService({
    ephem: ephem as any,
    riseSetCalc: riseSetCalc as any,
    eclipseCalc: eclipseCalc as any,
    mcpStartupDefaults,
    now,
    formatTimestamp,
  });

  return { skyService, ephem, riseSetCalc, eclipseCalc, now, formatTimestamp };
}

describe('When using the extracted SkyService', () => {
  it('Given current planetary motion, then it preserves retrograde and asteroid payloads', () => {
    const { skyService, ephem } = makeSkyService({ preferredTimezone: 'UTC' });

    const retro = skyService.getRetrogradePlanets();
    expect(retro.data).toMatchObject({
      date: '2024-03-26',
      timezone: 'UTC',
    });
    expect((retro.data as any).planets).toEqual(
      expect.arrayContaining([expect.objectContaining({ planet: 'Saturn', isRetrograde: true })])
    );

    ephem.getAllPlanets.mockReturnValueOnce([
      { ...makePlanet('True Node', 120), sign: 'Leo' },
      { ...makePlanet('Chiron', 210), sign: 'Scorpio', isRetrograde: true },
    ]);
    const asteroidPositions = skyService.getAsteroidPositions('UTC');
    expect(asteroidPositions.text).toContain('Rx');
  });

  it('Given runtime rise-set and eclipse lookups, then it preserves readable summaries', async () => {
    const { skyService } = makeSkyService({ preferredTimezone: 'UTC' });

    const riseSet = await skyService.getRiseSetTimes(makeNatalChart());
    expect(riseSet.data).toMatchObject({
      date: '2024-03-26',
      timezone: 'America/Los_Angeles',
    });
    expect(riseSet.text).toContain('Rise/Set Times');

    const eclipses = skyService.getNextEclipses('UTC');
    expect(eclipses.data).toMatchObject({
      timezone: 'UTC',
      eclipses: [expect.objectContaining({ type: 'solar', eclipseType: 'Total' })],
    });
    expect(eclipses.text).toContain('Next Solar Eclipse');
  });
});
