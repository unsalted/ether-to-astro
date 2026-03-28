import { describe, expect, it, vi } from 'vitest';
import { EclipseCalculator } from '../../src/eclipses.js';

describe('When calculating eclipse events', () => {
  it('Given a valid solar response, then next solar eclipse is returned with mapped type', () => {
    const ephem = {
      eph: {
        sol_eclipse_when_glob: vi.fn(() => ({ flag: 4, error: '', data: [2451550] })),
        lun_eclipse_when: vi.fn(() => ({ flag: 0, error: '', data: [2451560] })),
      },
      julianDayToDate: vi.fn(() => new Date('2024-04-08T18:00:00Z')),
    };

    const calc = new EclipseCalculator(ephem as any);
    const solar = calc.findNextSolarEclipse(2451545);
    expect(solar).not.toBeNull();
    expect(solar?.type).toBe('solar');
    expect(solar?.maxTime).toBeInstanceOf(Date);
  });

  it('Given invalid response shapes or error flags, then null is returned', () => {
    const badShape = new EclipseCalculator({
      eph: { sol_eclipse_when_glob: vi.fn(() => ({ nope: true })) },
      julianDayToDate: vi.fn(),
    } as any);
    expect(badShape.findNextSolarEclipse(2451545)).toBeNull();

    const withError = new EclipseCalculator({
      eph: { lun_eclipse_when: vi.fn(() => ({ flag: 0, error: 'x', data: [2451550] })) },
      julianDayToDate: vi.fn(),
    } as any);
    expect(withError.findNextLunarEclipse(2451545)).toBeNull();
  });

  it('Given solar/lunar bitmasks, then eclipse types map to human-readable variants', () => {
    const calc = new EclipseCalculator({
      eph: {
        sol_eclipse_when_glob: vi.fn(() => ({ flag: 8, error: '', data: [2451550] })),
        lun_eclipse_when: vi.fn(() => ({ flag: 64, error: '', data: [2451550] })),
      },
      julianDayToDate: vi.fn(() => new Date('2024-01-01T00:00:00Z')),
    } as any);

    expect(calc.findNextSolarEclipse(2451545)?.eclipseType).toBe('Annular');
    expect(calc.findNextLunarEclipse(2451545)?.eclipseType).toBe('Penumbral');
  });

  it('Given no known type flags, then eclipse type defaults to Unknown', () => {
    const calc = new EclipseCalculator({
      eph: {
        sol_eclipse_when_glob: vi.fn(() => ({ flag: 0, error: '', data: [2451550] })),
        lun_eclipse_when: vi.fn(() => ({ flag: 0, error: '', data: [2451550] })),
      },
      julianDayToDate: vi.fn(() => new Date('2024-01-01T00:00:00Z')),
    } as any);
    expect(calc.findNextSolarEclipse(2451545)?.eclipseType).toBe('Unknown');
    expect(calc.findNextLunarEclipse(2451545)?.eclipseType).toBe('Unknown');
  });

  it('Given solar and lunar eclipses, then getNextEclipses sorts them by date and returns null when both missing', async () => {
    const calc = new EclipseCalculator({ eph: {} } as any);
    vi.spyOn(calc, 'findNextSolarEclipse').mockReturnValue({
      type: 'solar',
      date: new Date('2024-10-01T00:00:00Z'),
      eclipseType: 'Partial',
      maxTime: new Date('2024-10-01T00:00:00Z'),
    });
    vi.spyOn(calc, 'findNextLunarEclipse').mockReturnValue({
      type: 'lunar',
      date: new Date('2024-04-01T00:00:00Z'),
      eclipseType: 'Total',
      maxTime: new Date('2024-04-01T00:00:00Z'),
    });

    const sorted = await calc.getNextEclipses(2451545);
    expect(sorted?.[0].type).toBe('lunar');

    (calc.findNextSolarEclipse as any).mockReturnValue(null);
    (calc.findNextLunarEclipse as any).mockReturnValue(null);
    expect(await calc.getNextEclipses(2451545)).toBeNull();
  });

  it('Given uninitialized ephemeris, then public methods throw not-initialized errors', async () => {
    const calc = new EclipseCalculator({ eph: null } as any);
    expect(() => calc.findNextSolarEclipse(2451545)).toThrow(/not initialized/i);
    expect(() => calc.findNextLunarEclipse(2451545)).toThrow(/not initialized/i);
    await expect(calc.getNextEclipses(2451545)).rejects.toThrow(/not initialized/i);
  });

  it('Given internal calculator exceptions, then methods return null via error handling paths', async () => {
    const calc = new EclipseCalculator({
      eph: {
        sol_eclipse_when_glob: vi.fn(() => ({ flag: 4, error: '', data: [2451550] })),
        lun_eclipse_when: vi.fn(() => {
          throw new Error('lunar boom');
        }),
      },
      julianDayToDate: vi.fn(() => new Date('2024-01-01T00:00:00Z')),
    } as any);

    expect(calc.findNextLunarEclipse(2451545)).toBeNull();

    vi.spyOn(calc, 'findNextSolarEclipse').mockImplementation(() => {
      throw new Error('top-level boom');
    });
    expect(await calc.getNextEclipses(2451545)).toBeNull();
  });
});
