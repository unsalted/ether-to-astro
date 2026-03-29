import { describe, expect, it, vi } from 'vitest';
import { TransitService } from '../../../src/astro-service/transit-service.js';
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

  it('Given omitted mode and days_ahead > 0, then it preserves best-hit semantics', () => {
    const { transitService, transitCalc } = makeTransitService();

    const result = transitService.getTransits(makeNatalChart(), { days_ahead: 2 });

    expect(transitCalc.findTransits).toHaveBeenCalledTimes(3);
    expect(result.data).toMatchObject({
      mode: 'best_hit',
      mode_source: 'legacy_default',
      days_ahead: 2,
      window_start: '2024-03-26',
      window_end: '2024-03-28',
    });
    expect(result.text).toContain('Best-hit transits');
  });

  it('Given explicit snapshot mode with days_ahead, then it still reports a single-day window', () => {
    const { transitService, transitCalc } = makeTransitService();

    const result = transitService.getTransits(makeNatalChart(), {
      mode: 'snapshot',
      days_ahead: 5,
    });

    expect(transitCalc.findTransits).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({
      mode: 'snapshot',
      mode_source: 'explicit',
      days_ahead: 0,
      window_start: '2024-03-26',
      window_end: '2024-03-26',
    });
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

  it('Given a transit near a sign boundary, then serialized placement carries into the next sign', () => {
    const { transitService, transitCalc } = makeTransitService();
    transitCalc.findTransits.mockReturnValue([
      {
        transitingPlanet: 'Sun',
        natalPlanet: 'Sun',
        aspect: 'conjunction',
        orb: 0.01,
        isApplying: true,
        exactTimeStatus: 'within_preview',
        transitLongitude: 29.999,
        natalLongitude: 10,
        exactTime: undefined,
      },
    ]);

    const result = transitService.getTransits(makeNatalChart(), { mode: 'snapshot' });

    expect((result.data as any).transits[0]).toMatchObject({
      transitSign: 'Taurus',
      transitDegree: 0,
    });
  });

  it('Given forecast mode across multiple days, then each day is deduped independently', () => {
    const { transitService, transitCalc } = makeTransitService();
    transitCalc.findTransits
      .mockReturnValueOnce([
        {
          transitingPlanet: 'Mars',
          natalPlanet: 'Sun',
          aspect: 'square',
          orb: 1.25,
          isApplying: true,
          exactTimeStatus: 'within_preview',
          transitLongitude: 100,
          natalLongitude: 10,
          exactTime: new Date('2024-03-26T12:00:00Z'),
        },
        {
          transitingPlanet: 'Mars',
          natalPlanet: 'Sun',
          aspect: 'square',
          orb: 0.75,
          isApplying: true,
          exactTimeStatus: 'within_preview',
          transitLongitude: 100.5,
          natalLongitude: 10,
          exactTime: new Date('2024-03-26T13:00:00Z'),
        },
      ])
      .mockReturnValueOnce([
        {
          transitingPlanet: 'Mars',
          natalPlanet: 'Sun',
          aspect: 'square',
          orb: 0.5,
          isApplying: false,
          exactTimeStatus: 'within_preview',
          transitLongitude: 101,
          natalLongitude: 10,
          exactTime: new Date('2024-03-27T12:00:00Z'),
        },
      ]);

    const result = transitService.getTransits(makeNatalChart(), { mode: 'forecast', days_ahead: 1 });

    expect(result.data).toMatchObject({
      mode: 'forecast',
      mode_source: 'explicit',
      days_ahead: 1,
      forecast: [
        { date: '2024-03-26', transits: [{ orb: 0.75 }] },
        { date: '2024-03-27', transits: [{ orb: 0.5 }] },
      ],
    });
    expect(((result.data as any).forecast[0].transits as Array<unknown>)).toHaveLength(1);
  });

  it('Given invalid numeric filters, then validation fails before expansion', () => {
    const { transitService } = makeTransitService();

    expect(() =>
      transitService.getTransits(makeNatalChart(), { include_mundane: true, days_ahead: Number.NaN })
    ).toThrow(/days_ahead must be a finite number >= 0/);

    expect(() => transitService.getTransits(makeNatalChart(), { max_orb: Number.NaN })).toThrow(
      /max_orb must be a finite number >= 0/
    );
  });

  it('Given an exact-time lookup without a match, then exactTimeStatus is preserved in the payload', () => {
    const { transitService, transitCalc } = makeTransitService();
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

    const result = transitService.getTransits(makeNatalChart(), { mode: 'snapshot' });
    expect((result.data as any).transits[0]).toMatchObject({
      exactTimeStatus: 'outside_preview',
      exactTime: undefined,
    });
  });

  it('Given no transits, then it preserves the empty-state text branch', () => {
    const { transitService, transitCalc } = makeTransitService();
    transitCalc.findTransits.mockReturnValue([]);

    const result = transitService.getTransits(makeNatalChart(), { include_mundane: false });

    expect(result.text).toContain('No transits found');
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
