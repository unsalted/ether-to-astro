import { describe, expect, it, vi } from 'vitest';
import { RisingSignService } from '../../src/astro-service/rising-sign-service.js';

function makeRisingSignService() {
  const ephem = {
    dateToJulianDay: vi.fn((date: Date) => date.getTime() / 86400000 + 2440587.5),
  };
  const houseCalc = {
    calculateHouses: vi.fn(() => ({
      ascendant: 0,
      mc: 204,
      cusps: [0, 270, 300, 330, 0, 30, 60, 90, 120, 150, 204, 240, 260],
      system: 'P' as const,
    })),
  };

  const risingSignService = new RisingSignService({
    ephem: ephem as any,
    houseCalc: houseCalc as any,
  });

  return { risingSignService, ephem, houseCalc };
}

describe('When using the extracted RisingSignService', () => {
  it('Given multiple transitions inside one scan bucket, then exact mode emits every sign window', () => {
    const { risingSignService, houseCalc } = makeRisingSignService();
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

    const result = risingSignService.getRisingSignWindows({
      date: '2026-03-28',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'UTC',
      mode: 'exact',
    });

    const windows = (result.data as any).windows as Array<{ start: string; sign: string }>;
    const firstHourWindows = windows.filter((window) => window.start < '2026-03-28T01:00:00+00:00');

    expect(firstHourWindows).toHaveLength(4);
    expect(firstHourWindows.map((window) => window.sign)).toEqual([
      'Aries',
      'Taurus',
      'Aries',
      'Taurus',
    ]);
    expect(result.text).toContain('Rising Sign Windows');
  });

  it('Given invalid location or timezone inputs, then it preserves clear validation errors', () => {
    const { risingSignService } = makeRisingSignService();

    expect(() =>
      risingSignService.getRisingSignWindows({
        date: '2026-03-28',
        latitude: 95,
        longitude: -74,
        timezone: 'America/New_York',
      })
    ).toThrow(/Invalid latitude/);

    expect(() =>
      risingSignService.getRisingSignWindows({
        date: '2026-03-28',
        latitude: 40,
        longitude: -190,
        timezone: 'America/New_York',
      })
    ).toThrow(/Invalid longitude/);

    expect(() =>
      risingSignService.getRisingSignWindows({
        date: '2026-03-28',
        latitude: 40,
        longitude: -74,
        timezone: 'Nope/Not-A-Timezone',
      })
    ).toThrow(/Invalid timezone/);
  });
});
