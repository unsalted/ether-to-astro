import { describe, expect, it, vi } from 'vitest';
import { SignBoundaryService } from '../../../src/astro-service/sign-boundary-service.js';
import type { PlanetPosition } from '../../../src/types.js';

const HOUR_IN_DAYS = 1 / 24;

function makePlanet(
  planet: PlanetPosition['planet'],
  longitude: number,
  speed: number
): PlanetPosition {
  return {
    planetId: 0,
    planet,
    longitude,
    latitude: 0,
    distance: 1,
    speed,
    sign: 'Aries',
    degree: longitude % 30,
    isRetrograde: speed < 0,
  };
}

function makeService() {
  const ephem = {
    dateToJulianDay: vi.fn((date: Date) => date.getTime() / 86400000 + 2440587.5),
    julianDayToDate: vi.fn((jd: number) => new Date((jd - 2440587.5) * 86400000)),
    findExactTransitTimes: vi.fn(() => [] as number[]),
    getPlanetPosition: vi.fn(() => makePlanet('Venus', 30, 1)),
  };

  const signBoundaryService = new SignBoundaryService({
    ephem: ephem as any,
    now: () => new Date('2024-03-26T12:00:00Z'),
  });

  return { signBoundaryService, ephem };
}

describe('When using the extracted SignBoundaryService', () => {
  it('Given direct crossings, then it returns sorted sign-boundary events with both signs', () => {
    const { signBoundaryService, ephem } = makeService();
    const venusRoot = 2460396.25;
    const marsRoot = 2460396.49;
    ephem.findExactTransitTimes.mockImplementation((planetId: number, boundary: number) => {
      if (planetId === 3 && boundary === 30) return [venusRoot];
      if (planetId === 4 && boundary === 90) return [marsRoot];
      return [];
    });
    ephem.getPlanetPosition.mockImplementation((planetId: number, jd: number) => {
      if (planetId === 3 && jd === venusRoot - HOUR_IN_DAYS) return makePlanet('Venus', 29.8, 1);
      if (planetId === 3 && jd === venusRoot) return makePlanet('Venus', 30, 1);
      if (planetId === 3 && jd === venusRoot + HOUR_IN_DAYS) return makePlanet('Venus', 30.2, 1);
      if (planetId === 4 && jd === marsRoot - HOUR_IN_DAYS) return makePlanet('Mars', 89.7, 0.5);
      if (planetId === 4 && jd === marsRoot) return makePlanet('Mars', 90, 0.5);
      if (planetId === 4 && jd === marsRoot + HOUR_IN_DAYS) return makePlanet('Mars', 90.3, 0.5);
      return makePlanet('Venus', 30, 1);
    });

    const result = signBoundaryService.getSignBoundaryEvents({
      date: '2024-03-26',
      timezone: 'UTC',
      days_ahead: 0,
      bodies: ['Mars', 'Venus'],
    });

    expect(result.data).toMatchObject({
      date: '2024-03-26',
      timezone: 'UTC',
      reporting_timezone: 'UTC',
      calculation_timezone: 'UTC',
      events: [
        expect.objectContaining({
          body: 'Venus',
          from_sign: 'Aries',
          to_sign: 'Taurus',
          direction: 'direct',
        }),
        expect.objectContaining({
          body: 'Mars',
          from_sign: 'Gemini',
          to_sign: 'Cancer',
          direction: 'direct',
        }),
      ],
    });
    expect((result.data as any).events).toHaveLength(2);
    expect(result.text).toContain('Venus: Aries -> Taurus');
  });

  it('Given retrograde crossings and duplicate roots, then it reverses the sign labels and dedupes rows', () => {
    const { signBoundaryService, ephem } = makeService();
    const root = 2460396.25;
    ephem.findExactTransitTimes.mockImplementation((planetId: number, boundary: number) => {
      if (planetId === 3 && boundary === 30) return [root, root];
      return [];
    });
    ephem.getPlanetPosition.mockImplementation((_planetId: number, jd: number) => {
      if (jd === root - HOUR_IN_DAYS) return makePlanet('Venus', 30.2, -0.4);
      if (jd === root) return makePlanet('Venus', 30, -0.4);
      if (jd === root + HOUR_IN_DAYS) return makePlanet('Venus', 29.8, -0.4);
      return makePlanet('Venus', 30, -0.4);
    });

    const result = signBoundaryService.getSignBoundaryEvents({
      date: '2024-03-26',
      timezone: 'UTC',
      bodies: ['Venus'],
    });

    expect((result.data as any).events).toEqual([
      expect.objectContaining({
        body: 'Venus',
        from_sign: 'Taurus',
        to_sign: 'Aries',
        direction: 'retrograde',
      }),
    ]);
  });

  it('Given a tangential cusp touch, then it does not emit a false sign-boundary event', () => {
    const { signBoundaryService, ephem } = makeService();
    const root = 2460396.25;
    ephem.findExactTransitTimes.mockImplementation((planetId: number, boundary: number) => {
      if (planetId === 3 && boundary === 30) return [root];
      return [];
    });
    ephem.getPlanetPosition.mockImplementation((_planetId: number, jd: number) => {
      if (jd === root - HOUR_IN_DAYS) return makePlanet('Venus', 29.95, 0.01);
      if (jd === root) return makePlanet('Venus', 30, 0);
      if (jd === root + HOUR_IN_DAYS) return makePlanet('Venus', 29.96, -0.01);
      return makePlanet('Venus', 29.95, 0.01);
    });

    const result = signBoundaryService.getSignBoundaryEvents({
      date: '2024-03-26',
      timezone: 'UTC',
      bodies: ['Venus'],
    });

    expect((result.data as any).events).toEqual([]);
  });

  it('Given a root exactly at the window end, then it excludes the next-day event', () => {
    const { signBoundaryService, ephem } = makeService();
    const endRoot = 2460396.5;
    ephem.findExactTransitTimes.mockImplementation((planetId: number, boundary: number) => {
      if (planetId === 3 && boundary === 30) return [endRoot];
      return [];
    });
    ephem.getPlanetPosition.mockImplementation((_planetId: number, jd: number) => {
      if (jd === endRoot - HOUR_IN_DAYS) return makePlanet('Venus', 29.8, 1);
      if (jd === endRoot) return makePlanet('Venus', 30, 1);
      if (jd === endRoot + HOUR_IN_DAYS) return makePlanet('Venus', 30.2, 1);
      return makePlanet('Venus', 30, 1);
    });

    const result = signBoundaryService.getSignBoundaryEvents({
      date: '2024-03-26',
      timezone: 'UTC',
      days_ahead: 0,
      bodies: ['Venus'],
    });

    expect((result.data as any).events).toEqual([]);
  });

  it('Given invalid days_ahead or unsupported bodies, then it preserves strict validation semantics', () => {
    const { signBoundaryService } = makeService();

    expect(() =>
      signBoundaryService.getSignBoundaryEvents({
        date: '2024-03-26',
        timezone: 'UTC',
        days_ahead: -1,
      })
    ).toThrow(/days_ahead/);

    expect(() =>
      signBoundaryService.getSignBoundaryEvents({
        date: '2024-03-26',
        timezone: 'UTC',
        bodies: ['Chiron' as any],
      })
    ).toThrow(/Invalid body/);
  });
});
