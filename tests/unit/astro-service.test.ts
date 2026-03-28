import { describe, expect, it, vi } from 'vitest';
import { AstroService, parseDateOnlyInput } from '../../src/astro-service.js';
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

function makeService(mcpStartupDefaults: McpStartupDefaults = {}) {
  const ephem = {
    eph: {},
    init: vi.fn(async () => {}),
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

  return { service, ephem, houseCalc, transitCalc, riseSetCalc, eclipseCalc, chartRenderer, writeFile, now };
}

describe('When using AstroService', () => {
  it('Given a date-only input, then it parses valid values and rejects invalid calendar parts', () => {
    expect(parseDateOnlyInput('2024-03-26')).toEqual({
      year: 2024,
      month: 3,
      day: 26,
      hour: 12,
      minute: 0,
    });
    expect(() => parseDateOnlyInput('2024-13-01')).toThrow(/Invalid month/);
    expect(() => parseDateOnlyInput('2024-02-00')).toThrow(/Invalid day/);
  });

  it('Given injected dependencies, then init initializes ephemeris', async () => {
    const { service, ephem } = makeService();
    await service.init();
    expect(ephem.init).toHaveBeenCalledTimes(1);
    expect(service.isInitialized()).toBe(true);
  });

  it('Given a polar latitude chart, then setNatalChart returns fallback house system details', () => {
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
      requestedHouseSystem: 'P',
      resolvedHouseSystem: 'W',
      isPolar: true,
    });
  });

  it('Given missing Sun or Moon data, then setNatalChart throws a clear error', () => {
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

  it('Given transit filters, then getTransits returns filtered data and optional mundane payload', () => {
    const { service } = makeService();
    const natal = makeNatalChart();
    const result = service.getTransits(natal, {
      include_mundane: true,
      days_ahead: 1,
      max_orb: 2,
      exact_only: true,
      applying_only: true,
    });

    expect(result.data).toHaveProperty('transits');
    expect(result.data).toHaveProperty('mundane');
    expect(result.text).toContain('Transits');
  });

  it('Given exact-time lookup metadata, then getTransits serializes exactTimeStatus', () => {
    const { service, transitCalc } = makeService();
    transitCalc.findTransits.mockReturnValue([
      {
        transitingPlanet: 'Mars',
        natalPlanet: 'Sun',
        aspect: 'square',
        orb: 1.25,
        isApplying: true,
        exactTimeStatus: 'outside_preview',
        transitLongitude: 100,
        natalLongitude: 10,
        exactTime: undefined,
      },
    ]);

    const result = service.getTransits(makeNatalChart());
    expect((result.data as any).transits[0]).toMatchObject({
      exactTimeStatus: 'outside_preview',
      exactTime: undefined,
    });
  });

  it('Given a natal chart location, then getRiseSetTimes returns ISO payload and readable text', async () => {
    const { service, riseSetCalc } = makeService();
    const result = await service.getRiseSetTimes(makeNatalChart());
    expect(riseSetCalc.getAllRiseSet).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({
      timezone: 'America/Los_Angeles',
    });
    expect(result.text).toContain('Rise/Set Times');
  });

  it('Given MCP startup defaults, then output timezone fallback and status expose deterministic config', () => {
    const { service } = makeService({
      preferredTimezone: 'America/New_York',
      preferredHouseStyle: 'W',
      weekdayLabels: true,
    });

    expect(service.resolveOutputTimezone(undefined, undefined)).toBe('America/New_York');

    const status = service.getServerStatus(null);
    expect(status.data).toMatchObject({
      startupDefaults: {
        preferredTimezone: 'America/New_York',
        preferredHouseStyle: 'W',
        weekdayLabels: true,
      },
    });
  });

  it('Given preferred house style and weekday labels, then deterministic defaults do not override chart house system', () => {
    const { service, houseCalc } = makeService({
      preferredTimezone: 'America/New_York',
      preferredHouseStyle: 'W',
      weekdayLabels: true,
    });

    const houses = service.getHouses(makeNatalChart());
    const eclipses = service.getNextEclipses();

    expect(houseCalc.calculateHouses).toHaveBeenLastCalledWith(
      makeNatalChart().julianDay,
      makeNatalChart().location.latitude,
      makeNatalChart().location.longitude,
      'P'
    );
    expect((houses.data as any).system).toBe('W');
    expect((eclipses.data as any).timezone).toBe('America/New_York');
    expect(eclipses.text).toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
  });

  it('Given no house system on the chart, then preferred house style is used as the fallback', () => {
    const { service, houseCalc } = makeService({
      preferredHouseStyle: 'W',
    });
    const natalChart = { ...makeNatalChart(), houseSystem: undefined };

    service.getHouses(natalChart);

    expect(houseCalc.calculateHouses).toHaveBeenLastCalledWith(
      natalChart.julianDay,
      natalChart.location.latitude,
      natalChart.location.longitude,
      'W'
    );
  });

  it('Given a preferred reporting timezone, then rise/set text renders in that timezone', async () => {
    const { service } = makeService({
      preferredTimezone: 'America/New_York',
    });

    const result = await service.getRiseSetTimes(makeNatalChart());

    expect(result.data).toMatchObject({
      timezone: 'America/Los_Angeles',
    });
    expect(result.text).toContain('EDT');
  });

  it('Given eclipse availability, then getNextEclipses returns summary or empty-state text', () => {
    const { service, eclipseCalc } = makeService();
    const withOne = service.getNextEclipses('UTC');
    expect(withOne.data).toMatchObject({ timezone: 'UTC' });
    expect(withOne.text).toContain('Upcoming Eclipses');

    eclipseCalc.findNextSolarEclipse.mockReturnValue(null);
    const none = service.getNextEclipses('UTC');
    expect(none.text).toContain('No eclipses found');
  });

  it('Given current planetary motion, then getRetrogradePlanets returns retrograde payload', () => {
    const { service, ephem } = makeService();
    ephem.getAllPlanets.mockReturnValue([
      { ...makePlanet('Mercury', 10), isRetrograde: true, speed: -0.2 },
      { ...makePlanet('Venus', 20), isRetrograde: false, speed: 1.2 },
    ]);

    const result = service.getRetrogradePlanets('UTC');
    expect(result.data).toMatchObject({ timezone: 'UTC' });
    expect(result.text).toContain('Mercury');
  });

  it('Given output_path for natal chart generation, then it writes the file and returns path text', async () => {
    const { service, writeFile } = makeService();
    const result = await service.generateNatalChart(makeNatalChart(), {
      format: 'svg',
      output_path: '/tmp/chart.svg',
      theme: 'light',
    });
    expect(writeFile).toHaveBeenCalledWith('/tmp/chart.svg', '<svg>ok</svg>', 'utf-8');
    expect(result.outputPath).toBe('/tmp/chart.svg');
  });

  it('Given binary chart output, then it returns base64 image payload with mime type', async () => {
    const { service } = makeService();
    const result = await service.generateTransitChart(makeNatalChart(), {
      format: 'png',
      theme: 'dark',
    });
    expect(result.image?.mimeType).toBe('image/png');
    expect(result.image?.data).toBe(Buffer.from([4, 5, 6]).toString('base64'));
  });

  it('Given natal chart presence or absence, then getServerStatus reports correct state', () => {
    const { service } = makeService();
    const empty = service.getServerStatus(null);
    const loaded = service.getServerStatus(makeNatalChart());
    expect(empty.data).toMatchObject({ hasNatalChart: false });
    expect(loaded.data).toMatchObject({ hasNatalChart: true });
  });

  it('Given invalid transit filters or missing Julian day, then validation errors are thrown', () => {
    const { service } = makeService();
    expect(() => service.getTransits(makeNatalChart(), { days_ahead: -1 })).toThrow(/days_ahead/);
    expect(() => service.getTransits(makeNatalChart(), { max_orb: -1 })).toThrow(/max_orb/);
    expect(() => service.getHouses({ ...makeNatalChart(), julianDay: undefined })).toThrow(/missing julianDay/i);
  });

  it('Given empty transit/retrograde results, then user-facing empty-state text is returned', () => {
    const { service, transitCalc, ephem } = makeService();
    transitCalc.findTransits.mockReturnValue([]);
    ephem.getAllPlanets.mockReturnValue([{ ...makePlanet('Sun', 10), isRetrograde: false, speed: 1 }]);
    const transits = service.getTransits(makeNatalChart(), { include_mundane: false });
    expect(transits.text).toContain('No transits found');
    const retro = service.getRetrogradePlanets('UTC');
    expect(retro.text).toContain('No planets are currently retrograde');
  });

  it('Given chart format/output variants, then chart generation returns the correct branch payload', async () => {
    const { service, chartRenderer, writeFile } = makeService();
    chartRenderer.generateNatalChart.mockResolvedValueOnce('<svg>inline</svg>');
    const inlineSvg = await service.generateNatalChart(makeNatalChart(), { format: 'svg' });
    expect(inlineSvg.svg).toBe('<svg>inline</svg>');

    chartRenderer.generateNatalChart.mockResolvedValueOnce(Buffer.from([9, 9]));
    const inlinePng = await service.generateNatalChart(makeNatalChart(), { format: 'png' });
    expect(inlinePng.image?.mimeType).toBe('image/png');

    chartRenderer.generateTransitChart.mockResolvedValueOnce('<svg>transit-inline</svg>');
    const transitSvg = await service.generateTransitChart(makeNatalChart(), { format: 'svg', date: '2024-03-26' });
    expect(transitSvg.svg).toContain('transit-inline');

    chartRenderer.generateTransitChart.mockResolvedValueOnce(Buffer.from([8, 8]));
    const saved = await service.generateTransitChart(makeNatalChart(), {
      format: 'webp',
      output_path: '/tmp/transit.webp',
      date: '2024-03-26',
    });
    expect(writeFile).toHaveBeenCalledWith('/tmp/transit.webp', Buffer.from([8, 8]));
    expect(saved.outputPath).toBe('/tmp/transit.webp');
  });

  it('Given both solar and lunar eclipses exist, then both are included in the response', () => {
    const { service, eclipseCalc } = makeService();
    eclipseCalc.findNextLunarEclipse.mockReturnValue({
      type: 'lunar',
      date: new Date('2024-09-18T00:00:00Z'),
      eclipseType: 'Partial',
      maxTime: new Date('2024-09-18T00:00:00Z'),
    });
    const result = service.getNextEclipses('UTC');
    expect((result.data as any).eclipses).toHaveLength(2);
    expect(result.text).toContain('Next Lunar Eclipse');
  });

  it('Given date/location inputs, then getRisingSignWindows returns deterministic sign intervals', () => {
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

    const windows = (result.data as any).windows;
    expect((result.data as any)).toMatchObject({
      date: '2026-03-28',
      timezone: 'America/New_York',
      mode: 'exact',
    });
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0]).toMatchObject({
      sign: expect.any(String),
      start: expect.any(String),
      end: expect.any(String),
      durationMinutes: expect.any(Number),
    });
    expect(windows[0].start).toMatch(/[-+]\d{2}:\d{2}$/);
    expect(windows[0].start.endsWith('Z')).toBe(false);
    expect(result.text).toContain('Rising Sign Windows');
    expect(result.text.toLowerCase()).not.toContain('best');
  });

  it('Given multiple sign transitions inside one scan bucket, then exact mode emits all boundary windows', () => {
    const { service, houseCalc } = makeService();
    const transitions = [
      Date.parse('2026-03-28T00:10:00Z'),
      Date.parse('2026-03-28T00:30:00Z'),
      Date.parse('2026-03-28T00:50:00Z'),
    ];
    houseCalc.calculateHouses.mockImplementation((jd: number) => {
      const date = new Date((jd - 2440587.5) * 86400000);
      const millis = date.getTime();
      const signIndex =
        transitions.filter((transitionMs) => millis >= transitionMs).length % 2 === 0 ? 0 : 1;
      return {
        ascendant: signIndex * 30 + 0.1,
        mc: 204,
        cusps: [0, 270, 300, 330, 0, 30, 60, 90, 120, 150, 204, 240, 260],
        system: 'P' as const,
      };
    });

    const result = service.getRisingSignWindows({
      date: '2026-03-28',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'UTC',
      mode: 'exact',
    });

    const windows = (result.data as any).windows as Array<{ start: string; end: string; sign: string }>;
    const firstHourWindows = windows.filter((window) => window.start < '2026-03-28T01:00:00+00:00');

    expect(firstHourWindows).toHaveLength(4);
    expect(firstHourWindows.map((window) => window.sign)).toEqual(['Aries', 'Taurus', 'Aries', 'Taurus']);
  });

  it('Given invalid rising-sign inputs, then getRisingSignWindows throws clear validation errors', () => {
    const { service } = makeService();

    expect(() =>
      service.getRisingSignWindows({
        date: '2026-03-28',
        latitude: 95,
        longitude: -74,
        timezone: 'America/New_York',
      })
    ).toThrow(/Invalid latitude/);

    expect(() =>
      service.getRisingSignWindows({
        date: '2026-03-28',
        latitude: 40,
        longitude: -190,
        timezone: 'America/New_York',
      })
    ).toThrow(/Invalid longitude/);

    expect(() =>
      service.getRisingSignWindows({
        date: '2026/03/28',
        latitude: 40,
        longitude: -74,
        timezone: 'America/New_York',
      })
    ).toThrow(/Invalid date format/);

    expect(() =>
      service.getRisingSignWindows({
        date: '2026-03-28',
        latitude: 40,
        longitude: -74,
        timezone: 'Nope/Not-A-Timezone',
      })
    ).toThrow(/Invalid timezone/);

    expect(() =>
      service.getRisingSignWindows({
        date: '2026-03-28',
        latitude: 40,
        longitude: -74,
        timezone: 'UTC',
        mode: 'fast' as any,
      })
    ).toThrow(/Invalid mode/);
  });
});
