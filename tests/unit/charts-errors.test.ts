import { describe, expect, it } from 'vitest';
import { ChartRenderer } from '../../src/charts.js';

describe('When chart rendering inputs are invalid', () => {
  it('Given a natal chart missing Julian Day, then renderer throws a clear error', async () => {
    const renderer = new ChartRenderer(
      { getAllPlanets: () => [] } as any,
      { calculateHouses: () => ({ cusps: Array(13).fill(0) }) } as any
    );
    await expect(
      renderer.generateNatalChart({
        name: 'Missing JD',
        birthDate: { year: 2000, month: 1, day: 1, hour: 0, minute: 0 },
        location: { latitude: 0, longitude: 0, timezone: 'UTC' },
      } as any)
    ).rejects.toThrow(/missing Julian Day/i);
  });

  it('Given a missing chart container in DOM, then SVG extraction throws', () => {
    const renderer = new ChartRenderer({} as any, {} as any);
    (renderer as any).dom = {
      window: {
        document: {
          getElementById: () => null,
        },
      },
    };
    expect(() => (renderer as any).extractSVG()).toThrow(/container not found/i);
  });

  it('Given rendered output without an SVG element, then SVG extraction throws', () => {
    const renderer = new ChartRenderer({} as any, {} as any);
    (renderer as any).dom = {
      window: {
        document: {
          getElementById: () => ({ querySelector: () => null }),
        },
      },
    };
    expect(() => (renderer as any).extractSVG()).toThrow(/no SVG element/i);
  });
});
