import { describe, expect, it } from 'vitest';
import { HouseCalculator } from '../../src/houses.js';

describe('When house calculation encounters failure paths', () => {
  it('Given an uninitialized ephemeris instance, then calculateHouses throws', () => {
    const calc = new HouseCalculator({ eph: null } as any);
    expect(() => calc.calculateHouses(2451545, 40, -74, 'P')).toThrow(/not initialized/i);
  });

  it('Given non-polar calculation failure, then calculateHouses throws without fallback', () => {
    const calc = new HouseCalculator({
      eph: {
        houses_ex2: () => ({ flag: -1 }),
      },
    } as any);
    expect(() => calc.calculateHouses(2451545, 40, -74, 'P')).toThrow(/House calculation failed/);
  });

  it('Given polar fallback failure, then calculateHouses throws explicit fallback failure', () => {
    const calc = new HouseCalculator({
      eph: {
        houses_ex2: () => ({ flag: -1 }),
      },
    } as any);
    expect(() => calc.calculateHouses(2451545, 80, -74, 'P')).toThrow(/Whole Sign fallback/);
  });
});
