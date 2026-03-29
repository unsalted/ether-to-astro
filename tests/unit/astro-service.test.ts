import { describe, expect, it, vi } from 'vitest';
import { AstroService, parseDateOnlyInput } from '../../src/astro-service.js';
import type { McpStartupDefaults } from '../../src/entrypoint.js';
import type { NatalChart, PlanetPosition, RiseSetTime } from '../../src/types.js';

/**
 * Facade contract suite for `AstroService`.
 *
 * Detailed domain behavior lives under `tests/unit/astro-service/`; this file
 * intentionally stays focused on public method shape, delegation smoke tests,
 * and the key user-visible error contracts.
 */

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

function makeService(mcpStartupDefaults: McpStartupDefaults = {}) {
  const ephem = {
    eph: {},
    init: vi.fn(async () => {}),
    dateToJulianDay: vi.fn((date: Date) => date.getTime() / 86400000 + 2440587.5),
    calculateAspectAngle: vi.fn((a: number, b: number) => {
      const diff = Math.abs(a - b);
      return diff > 180 ? 360 - diff : diff;
    }),
    getHorizontalCoordinates: vi.fn(() => ({
      azimuth: 180,
      trueAltitude: 25,
      apparentAltitude: 25,
    })),
    getAllPlanets: vi.fn(() => [makePlanet('Sun', 204), makePlanet('Moon', 270)]),
    getPlanetPosition: vi.fn((planetId: number) =>
      makePlanet(planetId === 1 ? 'Moon' : 'Sun', 100)
    ),
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
  const chartRenderer = {
    generateNatalChart: vi.fn(async (_chart, _theme, format) => {
      if (format === 'svg') return '<svg>ok</svg>';
      return Buffer.from([1, 2, 3]);
    }),
    generateTransitChart: vi.fn(async (_chart, _date, _theme, format) => {
      if (format === 'svg') return '<svg>transit</svg>';
      return Buffer.from([4, 5, 6]);
    }),
  };
  const writeFile = vi.fn(async () => {});
  const now = vi.fn(() => new Date('2024-03-26T12:00:00Z'));

  const service = new AstroService({
    ephem: ephem as any,
    houseCalc: houseCalc as any,
    transitCalc: transitCalc as any,
    riseSetCalc: riseSetCalc as any,
    eclipseCalc: eclipseCalc as any,
    chartRenderer: chartRenderer as any,
    mcpStartupDefaults,
    writeFile,
    now,
  });

  return {
    service,
    ephem,
    houseCalc,
    transitCalc,
    riseSetCalc,
    eclipseCalc,
    chartRenderer,
    writeFile,
  };
}

describe('When using AstroService as a facade', () => {
  it('Given a date-only input, then parseDateOnlyInput preserves the public helper contract', () => {
    expect(parseDateOnlyInput('2024-03-26')).toEqual({
      year: 2024,
      month: 3,
      day: 26,
      hour: 12,
      minute: 0,
    });
    expect(() => parseDateOnlyInput('2024-13-01')).toThrow(/Invalid month/);
  });

  it('Given injected dependencies, then init initializes ephemeris and exposes initialized state', async () => {
    const { service, ephem } = makeService();

    await service.init();

    expect(ephem.init).toHaveBeenCalledTimes(1);
    expect(service.isInitialized()).toBe(true);
  });

  it('Given natal chart input, then setNatalChart returns the public chart payload shape', () => {
    const { service, houseCalc } = makeService();

    const result = service.setNatalChart({
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

    expect(houseCalc.calculateHouses).toHaveBeenCalled();
    expect(result.chart.houseSystem).toBe('W');
    expect(result.data).toMatchObject({
      name: 'Polar User',
      resolvedHouseSystem: 'W',
      isPolar: true,
    });
  });

  it('Given missing Sun or Moon data, then setNatalChart preserves the natal error contract', () => {
    const { service, ephem } = makeService();
    ephem.getAllPlanets.mockReturnValue([makePlanet('Sun', 200)]);

    expect(() =>
      service.setNatalChart({
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

  it('Given a natal chart, then getTransits preserves the top-level transit payload shape', () => {
    const { service, transitCalc } = makeService();

    const result = service.getTransits(makeNatalChart(), {});

    expect(transitCalc.findTransits).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({
      mode: 'snapshot',
      mode_source: 'legacy_default',
      days_ahead: 0,
      transits: [expect.objectContaining({ transitingPlanet: 'Mars', natalPlanet: 'Sun' })],
    });
    expect(result.text).toContain('Transit snapshot');
  });

  it('Given invalid transit filters or missing Julian day, then facade validation errors remain stable', () => {
    const { service } = makeService();

    expect(() => service.getTransits(makeNatalChart(), { days_ahead: -1 })).toThrow(/days_ahead/);
    expect(() => service.getTransits(makeNatalChart(), { max_orb: -1 })).toThrow(/max_orb/);
    expect(() => service.getTransits(makeNatalChart(), { mode: 'weekly' as any })).toThrow(/mode/);
    expect(() => service.getHouses({ ...makeNatalChart(), julianDay: undefined })).toThrow(
      /missing julianDay/i
    );
  });

  it('Given stateless electional inputs, then getElectionalContext preserves the public response shape', () => {
    const { service, ephem } = makeService();
    ephem.getAllPlanets.mockReturnValue([
      { ...makePlanet('Sun', 0), sign: 'Aries', speed: 1 },
      { ...makePlanet('Moon', 58), sign: 'Taurus', speed: 13 },
      { ...makePlanet('Mercury', 120), sign: 'Leo', speed: 1.2 },
      { ...makePlanet('Venus', 180), sign: 'Libra', speed: 1.1 },
      { ...makePlanet('Mars', 240), sign: 'Sagittarius', speed: 0.7 },
      { ...makePlanet('Jupiter', 300), sign: 'Aquarius', speed: 0.2 },
      { ...makePlanet('Saturn', 315), sign: 'Aquarius', speed: 0.05, isRetrograde: true },
      { ...makePlanet('Uranus', 30), sign: 'Taurus', speed: 0.03 },
      { ...makePlanet('Neptune', 330), sign: 'Pisces', speed: 0.02 },
      { ...makePlanet('Pluto', 270), sign: 'Capricorn', speed: 0.01 },
    ]);

    const result = service.getElectionalContext({
      date: '2026-03-28',
      time: '09:30',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
      include_ruler_basics: true,
    });

    expect(result.data).toMatchObject({
      input: { date: '2026-03-28', timezone: 'America/Los_Angeles' },
      ascendant: { sign: 'Capricorn' },
      moon: { sign: 'Taurus' },
      meta: { deterministic: true, requires_natal: false },
    });
    expect(result.text).toContain('Electional context');
  });

  it('Given DST-gap or overlap electional times, then getElectionalContext rejects ambiguous local instants', () => {
    const { service } = makeService();

    expect(() =>
      service.getElectionalContext({
        date: '2026-03-08',
        time: '02:30',
        timezone: 'America/Los_Angeles',
        latitude: 37.7749,
        longitude: -122.4194,
      })
    ).toThrow(/ambiguous or nonexistent due to a DST transition/);

    expect(() =>
      service.getElectionalContext({
        date: '2026-11-01',
        time: '01:30',
        timezone: 'America/Los_Angeles',
        latitude: 37.7749,
        longitude: -122.4194,
      })
    ).toThrow(/ambiguous or nonexistent due to a DST transition/);
  });

  it('Given a slightly negative Sun altitude that rounds to zero, then getElectionalContext still classifies the chart as night', () => {
    const { service, ephem } = makeService();
    ephem.getHorizontalCoordinates.mockReturnValue({
      azimuth: 180,
      trueAltitude: -0.004,
      apparentAltitude: -0.004,
    });

    const result = service.getElectionalContext({
      date: '2026-03-28',
      time: '06:59',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
    });

    expect((result.data as any).sect).toMatchObject({
      is_day_chart: false,
      classification: 'night',
    });
    expect((result.data as any).meta.warnings).toContain(
      'Sun is near the horizon; day/night classification is close to the boundary.'
    );
    expect(result.text).toContain('Sect: night');
  });

  it('Given a natal chart, then getHouses preserves the public house payload shape', () => {
    const { service, houseCalc } = makeService({ preferredHouseStyle: 'W' });

    const result = service.getHouses(makeNatalChart());

    expect(houseCalc.calculateHouses).toHaveBeenCalled();
    expect((result.data as any).system).toBe('W');
    expect(result.text).toContain('Houses');
  });

  it('Given date and location inputs, then getRisingSignWindows preserves the public window payload shape', () => {
    const { service, houseCalc } = makeService();
    houseCalc.calculateHouses.mockImplementation((jd: number) => {
      const dayFraction = ((jd % 1) + 1) % 1;
      const ascendant = (dayFraction * 360 * 12) % 360;
      return {
        ascendant,
        mc: 204,
        cusps: [0, 270, 300, 330, 0, 30, 60, 90, 120, 150, 204, 240, 260],
        system: 'P' as const,
      };
    });

    const result = service.getRisingSignWindows({
      date: '2026-03-28',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'America/New_York',
      mode: 'exact',
    });

    expect((result.data as any)).toMatchObject({
      date: '2026-03-28',
      timezone: 'America/New_York',
      mode: 'exact',
    });
    expect(result.text).toContain('Rising Sign Windows');
  });

  it('Given runtime sky lookups, then the facade preserves retrograde, asteroid, and eclipse payload branches', () => {
    const { service, ephem } = makeService();
    ephem.getAllPlanets.mockReturnValueOnce([
      { ...makePlanet('Mercury', 10), isRetrograde: true, speed: -0.2 },
      { ...makePlanet('Venus', 20), isRetrograde: false, speed: 1.2 },
    ]);
    const retro = service.getRetrogradePlanets('UTC');
    expect(retro.data).toMatchObject({ timezone: 'UTC' });

    ephem.getAllPlanets.mockReturnValueOnce([
      { ...makePlanet('True Node', 120), sign: 'Leo' },
      { ...makePlanet('Chiron', 210), sign: 'Scorpio', isRetrograde: true },
    ]);
    const asteroidPositions = service.getAsteroidPositions('UTC');
    expect(asteroidPositions.data).toMatchObject({ timezone: 'UTC' });

    const eclipses = service.getNextEclipses('UTC');
    expect(eclipses.data).toMatchObject({ timezone: 'UTC' });
    expect(eclipses.text).toContain('Upcoming Eclipses');
  });

  it('Given a natal chart location, then getRiseSetTimes preserves the public rise/set payload shape', async () => {
    const { service, riseSetCalc } = makeService();

    const result = await service.getRiseSetTimes(makeNatalChart());

    expect(riseSetCalc.getAllRiseSet).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({ timezone: 'America/Los_Angeles' });
    expect(result.text).toContain('Rise/Set Times');
  });

  it('Given startup defaults, then resolveReportingTimezone and getServerStatus preserve deterministic config reporting', () => {
    const { service } = makeService({
      preferredTimezone: 'America/New_York',
      preferredHouseStyle: 'W',
      weekdayLabels: true,
    });

    expect(service.resolveReportingTimezone(undefined, undefined)).toBe('America/New_York');
    expect(service.resolveReportingTimezone(undefined, 'America/Los_Angeles')).toBe(
      'America/New_York'
    );

    const empty = service.getServerStatus(null);
    const loaded = service.getServerStatus(makeNatalChart());
    expect(empty.data).toMatchObject({
      hasNatalChart: false,
      startupDefaults: {
        preferredTimezone: 'America/New_York',
        preferredHouseStyle: 'W',
        weekdayLabels: true,
      },
    });
    expect(loaded.data).toMatchObject({ hasNatalChart: true });
  });

  it('Given chart generation requests, then the facade preserves file-output and inline-image branches', async () => {
    const { service, writeFile } = makeService();

    const savedNatal = await service.generateNatalChart(makeNatalChart(), {
      format: 'svg',
      output_path: '/tmp/chart.svg',
      theme: 'light',
    });
    expect(writeFile).toHaveBeenCalledWith('/tmp/chart.svg', '<svg>ok</svg>', 'utf-8');
    expect(savedNatal.outputPath).toBe('/tmp/chart.svg');

    const inlineTransit = await service.generateTransitChart(makeNatalChart(), {
      format: 'png',
      theme: 'dark',
    });
    expect(inlineTransit.image?.mimeType).toBe('image/png');
    expect(inlineTransit.image?.data).toBe(Buffer.from([4, 5, 6]).toString('base64'));
  });
});
