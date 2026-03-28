import { describe, expect, it, vi } from 'vitest';
import { RiseSetCalculator } from '../../src/riseset.js';

describe('When calculating rise/set events', () => {
  it('Given Swiss Ephemeris success and no-event flags, then rise/set fields map correctly', () => {
    const riseTrans = vi
      .fn()
      .mockReturnValueOnce({ flag: 1, data: 2451545.25 })
      .mockReturnValueOnce({ flag: -2 })
      .mockReturnValueOnce({ flag: 1, data: 2451545.5 })
      .mockReturnValueOnce({ flag: 1, data: 2451545.75 });

    const ephem = {
      eph: { rise_trans: riseTrans },
      julianDayToDate: vi.fn((jd: number) => new Date((jd - 2440587.5) * 86400000)),
      dateToJulianDay: vi.fn(() => 2451545),
    };

    const calc = new RiseSetCalculator(ephem as any);
    const result = calc.calculateRiseSet(2451545, 0, 40, -74, 0);

    expect(result.planet).toBe('Sun');
    expect(result.rise).toBeInstanceOf(Date);
    expect(result.set).toBeUndefined();
    expect(result.upperMeridianTransit).toBeInstanceOf(Date);
  });

  it('Given a hard rise_trans failure flag, then calculation throws an error', () => {
    const ephem = {
      eph: { rise_trans: vi.fn(() => ({ flag: -1, error: 'boom' })) },
      julianDayToDate: vi.fn(),
    };
    const calc = new RiseSetCalculator(ephem as any);
    expect(() => calc.calculateRiseSet(2451545, 0, 40, -74)).toThrow(/calculation failed/i);
  });

  it('Given per-planet failures in getAllRiseSet, then remaining planets are still returned', async () => {
    const calc = new RiseSetCalculator({
      eph: {},
      dateToJulianDay: vi.fn(() => 2451545),
    } as any);
    const spy = vi.spyOn(calc, 'calculateRiseSet');
    spy.mockImplementation((jd, planetId) => {
      if (planetId === 3) {
        throw new Error('planet failed');
      }
      return { planet: String(planetId) } as any;
    });

    const results = await calc.getAllRiseSet(new Date('2024-03-26T00:00:00Z'), 40, -74);
    expect(results.length).toBe(9);
  });

  it('Given invalid ranges or invalid date inputs, then validation errors are raised', async () => {
    const calc = new RiseSetCalculator({
      eph: { rise_trans: vi.fn() },
      dateToJulianDay: vi.fn(() => 2451545),
      julianDayToDate: vi.fn(),
    } as any);

    expect(() => calc.calculateRiseSet(2451545, 0, 99, -74)).toThrow(/Invalid latitude/);
    await expect(calc.getAllRiseSet(new Date('invalid'), 40, -74)).rejects.toThrow(/Invalid date/);
  });

  it('Given getSunRiseSet, then current instant is used as the anchor and Sun is requested', async () => {
    const ephem = {
      eph: {},
      dateToJulianDay: vi.fn(() => 2451545),
    };
    const calc = new RiseSetCalculator(ephem as any);
    const spy = vi.spyOn(calc, 'calculateRiseSet').mockReturnValue({ planet: 'Sun' } as any);
    const result = await calc.getSunRiseSet(40, -74);
    expect(ephem.dateToJulianDay).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(2451545, 0, 40, -74, 0);
    expect(result.planet).toBe('Sun');
  });

  it('Given uninitialized ephemeris, then all public methods throw not-initialized errors', async () => {
    const calc = new RiseSetCalculator({ eph: null } as any);
    expect(() => calc.calculateRiseSet(2451545, 0, 40, -74)).toThrow(/not initialized/i);
    await expect(calc.getAllRiseSet(new Date(), 40, -74)).rejects.toThrow(/not initialized/i);
    await expect(calc.getSunRiseSet(40, -74)).rejects.toThrow(/not initialized/i);
  });

  it('Given invalid longitude or altitude, then calculateRiseSet rejects the input', () => {
    const calc = new RiseSetCalculator({
      eph: { rise_trans: vi.fn(() => ({ flag: -2 })) },
      julianDayToDate: vi.fn(),
    } as any);
    expect(() => calc.calculateRiseSet(2451545, 0, 40, Number.NaN)).toThrow(/Invalid longitude/);
    expect(() => calc.calculateRiseSet(2451545, 0, 40, -74, Number.NaN)).toThrow(/Invalid altitude/);
  });

  it('Given a successful flag without finite event data, then event fields remain undefined', () => {
    const ephem = {
      eph: {
        rise_trans: vi.fn(() => ({ flag: 1, data: Number.NaN })),
      },
      julianDayToDate: vi.fn(),
    };
    const calc = new RiseSetCalculator(ephem as any);
    const result = calc.calculateRiseSet(2451545, 0, 40, -74);
    expect(result.rise).toBeUndefined();
    expect(result.set).toBeUndefined();
  });
});
