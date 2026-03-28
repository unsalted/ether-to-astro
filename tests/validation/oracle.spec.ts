import { beforeAll, describe, expect, it } from 'vitest';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { PLANETS } from '../../src/types.js';
import { denseScanRootOracleWithDebug } from './utils/denseRootOracle.js';

function shortestDiff(longitude: number, targetLongitude: number): number {
  let diff = (((longitude % 360) + 360) % 360) - (((targetLongitude % 360) + 360) % 360);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

describe('Dense Root Oracle', () => {
  let ephem: EphemerisCalculator;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
  });

  it('finds multiple Moon crossings in a multi-week interval', () => {
    const start = ephem.dateToJulianDay(new Date('2024-01-01T00:00:00Z'));
    const end = ephem.dateToJulianDay(new Date('2024-03-01T00:00:00Z'));
    const target = 0;
    const result = denseScanRootOracleWithDebug(
      (jd) => ephem.getPlanetPosition(PLANETS.MOON, jd).longitude,
      target,
      start,
      end
    );

    expect(result.roots.length).toBeGreaterThanOrEqual(2);
    for (const jd of result.roots) {
      const lon = ephem.getPlanetPosition(PLANETS.MOON, jd).longitude;
      expect(Math.abs(shortestDiff(lon, target))).toBeLessThan(0.05);
    }
  });

  it('is symmetric around wrap targets (0° vs 359.9°)', () => {
    const start = ephem.dateToJulianDay(new Date('2024-03-19T00:00:00Z'));
    const end = ephem.dateToJulianDay(new Date('2024-03-22T00:00:00Z'));

    const at0 = denseScanRootOracleWithDebug(
      (jd) => ephem.getPlanetPosition(PLANETS.SUN, jd).longitude,
      0,
      start,
      end
    ).roots;
    const at3599 = denseScanRootOracleWithDebug(
      (jd) => ephem.getPlanetPosition(PLANETS.SUN, jd).longitude,
      359.9,
      start,
      end
    ).roots;

    expect(at0.length).toBeGreaterThan(0);
    expect(at3599.length).toBeGreaterThan(0);
    expect(Math.abs(at0[0] - at3599[0])).toBeLessThan(1);
  });

  it('captures tangential near-station root behavior', () => {
    const start = ephem.dateToJulianDay(new Date('2023-12-11T00:00:00Z'));
    const end = ephem.dateToJulianDay(new Date('2023-12-15T00:00:00Z'));

    let minLon = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 96; i++) {
      const jd = start + (i * (end - start)) / 96;
      const lon = ephem.getPlanetPosition(PLANETS.MERCURY, jd).longitude;
      if (lon < minLon) minLon = lon;
    }

    const result = denseScanRootOracleWithDebug(
      (jd) => ephem.getPlanetPosition(PLANETS.MERCURY, jd).longitude,
      minLon,
      start,
      end
    );

    expect(result.roots.length).toBeGreaterThan(0);
    const jd = result.roots[0];
    const lon = ephem.getPlanetPosition(PLANETS.MERCURY, jd).longitude;
    expect(Math.abs(shortestDiff(lon, minLon))).toBeLessThan(0.05);
  });

  it('keeps endpoint-near-root cases', () => {
    const start = ephem.dateToJulianDay(new Date('2024-03-20T00:00:00Z'));
    const end = ephem.dateToJulianDay(new Date('2024-03-30T00:00:00Z'));
    const target = ephem.getPlanetPosition(PLANETS.SUN, start).longitude;
    const result = denseScanRootOracleWithDebug(
      (jd) => ephem.getPlanetPosition(PLANETS.SUN, jd).longitude,
      target,
      start,
      end
    );

    expect(result.roots.length).toBeGreaterThan(0);
    expect(Math.abs(result.roots[0] - start)).toBeLessThan(1 / 24); // within ~1 hour
  });

  it('oracle roots are self-consistent (crossing or tangential minimum)', () => {
    const start = ephem.dateToJulianDay(new Date('2024-01-01T00:00:00Z'));
    const end = ephem.dateToJulianDay(new Date('2024-01-20T00:00:00Z'));
    const target = 0;
    const result = denseScanRootOracleWithDebug(
      (jd) => ephem.getPlanetPosition(PLANETS.MOON, jd).longitude,
      target,
      start,
      end
    );

    const epsilon = 5 / 1440; // 5 minutes
    for (const root of result.roots) {
      const before = ephem.getPlanetPosition(PLANETS.MOON, root - epsilon).longitude;
      const at = ephem.getPlanetPosition(PLANETS.MOON, root).longitude;
      const after = ephem.getPlanetPosition(PLANETS.MOON, root + epsilon).longitude;
      const dBefore = shortestDiff(before, target);
      const dAt = shortestDiff(at, target);
      const dAfter = shortestDiff(after, target);
      const crossing = dBefore === 0 || dAfter === 0 || Math.sign(dBefore) !== Math.sign(dAfter);
      const tangentialMin =
        Math.abs(dAt) <= Math.abs(dBefore) &&
        Math.abs(dAt) <= Math.abs(dAfter) &&
        Math.abs(dAt) < 0.1;

      expect(crossing || tangentialMin).toBe(true);
      expect(Math.abs(dAt)).toBeLessThan(0.1);
    }
  });
});
