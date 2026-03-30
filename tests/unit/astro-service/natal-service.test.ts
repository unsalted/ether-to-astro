import { describe, expect, it, vi } from 'vitest';
import { NatalService } from '../../../src/astro-service/natal-service.js';
import type { McpStartupDefaults } from '../../../src/entrypoint.js';
import type { NatalChart, PlanetPosition } from '../../../src/types.js';

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

function makeNatalService(mcpStartupDefaults: McpStartupDefaults = {}) {
  const ephem = {
    dateToJulianDay: vi.fn((date: Date) => date.getTime() / 86400000 + 2440587.5),
    getAllPlanets: vi.fn(() => [makePlanet('Sun', 204), makePlanet('Moon', 270)]),
  };
  const houseCalc = {
    calculateHouses: vi.fn(() => ({
      ascendant: 270,
      mc: 204,
      cusps: [0, 270, 300, 330, 0, 30, 60, 90, 120, 150, 204, 240, 260],
      system: 'W' as const,
    })),
  };
  const isInitialized = vi.fn(() => true);

  const natalService = new NatalService({
    ephem: ephem as any,
    houseCalc: houseCalc as any,
    mcpStartupDefaults,
    isInitialized,
  });

  return { natalService, ephem, houseCalc, isInitialized };
}

describe('When using the extracted NatalService', () => {
  it('Given a polar latitude chart, then it preserves natal fallback house behavior', () => {
    const { natalService } = makeNatalService();

    const result = natalService.setNatalChart({
      name: 'Polar User',
      year: 1990,
      month: 6,
      day: 12,
      hour: 14,
      minute: 35,
      latitude: 78,
      longitude: 15,
      timezone: 'UTC',
      house_system: 'P',
    });

    expect(result.chart.houseSystem).toBe('W');
    expect(result.data).toMatchObject({
      name: 'Polar User',
      requestedHouseSystem: 'P',
      resolvedHouseSystem: 'W',
      isPolar: true,
    });
  });

  it('Given state, defaults, and runtime preferences, then it preserves server status and house validation behavior', () => {
    const { natalService, isInitialized } = makeNatalService({
      preferredTimezone: 'UTC',
      preferredHouseStyle: 'W',
      weekdayLabels: true,
    });

    const status = natalService.getServerStatus(makeNatalChart(), {
      preferredTimezone: 'Asia/Kolkata',
      preferredHouseStyle: 'P',
    });
    expect(isInitialized).toHaveBeenCalled();
    expect(status.data).toMatchObject({
      hasNatalChart: true,
      natalChartName: 'Test User',
      startupDefaults: {
        preferredTimezone: 'UTC',
        preferredHouseStyle: 'W',
        weekdayLabels: true,
      },
      runtimePreferences: {
        preferredTimezone: 'Asia/Kolkata',
        preferredHouseStyle: 'P',
      },
      effectiveSettings: {
        reportingTimezone: 'Asia/Kolkata',
        reportingTimezoneSource: 'runtime',
        preferredHouseStyle: 'P',
        preferredHouseStyleSource: 'runtime',
      },
      ephemerisInitialized: true,
    });
    expect(status.text).toContain('Reporting timezone: Asia/Kolkata (runtime)');

    expect(() => natalService.getHouses({ ...makeNatalChart(), julianDay: undefined })).toThrow(
      /missing julianDay/i
    );
  });

  it('Given missing Sun or Moon data, then it preserves the natal ephemeris error contract', () => {
    const { natalService, ephem } = makeNatalService();
    ephem.getAllPlanets.mockReturnValue([makePlanet('Sun', 200)]);

    expect(() =>
      natalService.setNatalChart({
        name: 'No Moon',
        year: 1990,
        month: 1,
        day: 1,
        hour: 1,
        minute: 1,
        latitude: 1,
        longitude: 1,
        timezone: 'UTC',
      })
    ).toThrow(/Sun\/Moon/);
  });
});
