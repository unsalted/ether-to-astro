import { beforeAll, describe, expect, it } from 'vitest';
import { EphemerisCalculator } from '../../src/ephemeris.js';
import { TransitCalculator, deduplicateTransits } from '../../src/transits.js';
import { PLANETS, type PlanetPosition, type Transit } from '../../src/types.js';

describe('Solver and transit edge policies', () => {
  let ephem: EphemerisCalculator;
  let transitCalc: TransitCalculator;

  beforeAll(async () => {
    ephem = new EphemerisCalculator();
    await ephem.init();
    transitCalc = new TransitCalculator(ephem);
  });

  it('captures root at coarse-scan endpoint', () => {
    const startDate = new Date('2024-03-20T00:00:00Z');
    const startJD = ephem.dateToJulianDay(startDate);
    const endJD = startJD + 30;

    const sun = ephem.getAllPlanets(startJD, [PLANETS.SUN])[0];
    const roots = ephem.findExactTransitTimes(PLANETS.SUN, sun.longitude, startJD, endJD);

    expect(roots.length).toBeGreaterThan(0);
    expect(Math.abs(roots[0] - startJD)).toBeLessThan(1 / 1440);
  });

  it('returns multiple roots in a large interval', () => {
    const startDate = new Date('2024-01-01T00:00:00Z');
    const startJD = ephem.dateToJulianDay(startDate);
    const endJD = startJD + 800;

    const targetLongitude = 0;
    const roots = ephem.findExactTransitTimes(PLANETS.SUN, targetLongitude, startJD, endJD);

    expect(roots.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < roots.length; i++) {
      expect(roots[i]).toBeGreaterThan(roots[i - 1]);
    }
  });

  it('finds tangential root near station without sign-change bracketing', () => {
    // Mercury station region creates local minima/maxima in longitude.
    // Targeting a sampled local minimum should produce a tangential root.
    const centerDate = new Date('2023-12-13T00:00:00Z');
    const centerJD = ephem.dateToJulianDay(centerDate);
    const startJD = centerJD - 2;
    const endJD = centerJD + 2;

    // Find a local minimum longitude sample in this station window.
    let minSampleJD = startJD;
    let minSampleLon = Infinity;
    for (let i = 0; i <= 96; i++) {
      const jd = startJD + (i * (endJD - startJD)) / 96;
      const lon = ephem.getAllPlanets(jd, [PLANETS.MERCURY])[0].longitude;
      if (lon < minSampleLon) {
        minSampleLon = lon;
        minSampleJD = jd;
      }
    }

    const signedDiff = (lon: number, target: number): number => {
      let d = lon - target;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return d;
    };

    const startLon = ephem.getAllPlanets(startJD, [PLANETS.MERCURY])[0].longitude;
    const endLon = ephem.getAllPlanets(endJD, [PLANETS.MERCURY])[0].longitude;
    const startDiff = signedDiff(startLon, minSampleLon);
    const endDiff = signedDiff(endLon, minSampleLon);

    // Tangential case: endpoints are on the same side (or very near) of target.
    expect(startDiff).toBeGreaterThanOrEqual(-0.05);
    expect(endDiff).toBeGreaterThanOrEqual(-0.05);

    const roots = ephem.findExactTransitTimes(
      PLANETS.MERCURY,
      minSampleLon,
      startJD,
      endJD,
      0.01
    );

    expect(roots.length).toBeGreaterThan(0);

    const nearest = roots.reduce((best, jd) =>
      Math.abs(jd - minSampleJD) < Math.abs(best - minSampleJD) ? jd : best
    , roots[0]);

    expect(Math.abs(nearest - minSampleJD)).toBeLessThan(0.5);
    const nearestLon = ephem.getAllPlanets(nearest, [PLANETS.MERCURY])[0].longitude;
    expect(ephem.calculateAspectAngle(nearestLon, minSampleLon)).toBeLessThan(0.1);
  });

  it('uses root-based applying/separating when exact root is selected', () => {
    const now = new Date('2024-03-15T00:00:00Z');
    const currentJD = ephem.dateToJulianDay(now);
    const mars = ephem.getAllPlanets(currentJD, [PLANETS.MARS])[0];

    const applyingNatal: PlanetPosition = {
      planetId: PLANETS.VENUS,
      planet: 'Venus',
      longitude: (mars.longitude + 92) % 360,
      latitude: 0,
      distance: 1,
      speed: 1,
      sign: 'Cancer',
      degree: 2,
      isRetrograde: false,
    };

    const separatingNatal: PlanetPosition = {
      ...applyingNatal,
      longitude: (mars.longitude + 88 + 360) % 360,
    };

    const applying = transitCalc.findTransits([mars], [applyingNatal], currentJD)
      .find((t) => t.aspect === 'square');
    const separating = transitCalc.findTransits([mars], [separatingNatal], currentJD)
      .find((t) => t.aspect === 'square');

    expect(applying).toBeDefined();
    expect(separating).toBeDefined();

    if (applying?.exactTimeStatus === 'within_preview' && applying.exactTime) {
      expect(applying.isApplying).toBe(true);
      expect(applying.exactTime.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }

    if (separating?.exactTimeStatus === 'within_preview' && separating.exactTime) {
      expect(separating.isApplying).toBe(false);
      expect(separating.exactTime.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('marks unsupported bodies honestly', () => {
    const now = new Date('2024-03-15T00:00:00Z');
    const currentJD = ephem.dateToJulianDay(now);

    const unsupportedTransit: PlanetPosition = {
      planetId: 9999,
      planet: 'Sun',
      longitude: 120,
      latitude: 0,
      distance: 1,
      speed: 1,
      sign: 'Cancer',
      degree: 0,
      isRetrograde: false,
    };

    const natal: PlanetPosition = {
      planetId: PLANETS.MARS,
      planet: 'Mars',
      longitude: 120,
      latitude: 0,
      distance: 1,
      speed: 1,
      sign: 'Cancer',
      degree: 0,
      isRetrograde: false,
    };

    const transit = transitCalc.findTransits([unsupportedTransit], [natal], currentJD)
      .find((t) => t.aspect === 'conjunction');

    expect(transit).toBeDefined();
    expect(transit?.exactTimeStatus).toBe('unsupported_body');
    expect(transit?.exactTime).toBeUndefined();
  });

  it('deduplicates deterministically under total ties', () => {
    const a: Transit = {
      transitingPlanet: 'Mars',
      natalPlanet: 'Venus',
      aspect: 'square',
      orb: 0.5,
      isApplying: true,
      transitLongitude: 100,
      natalLongitude: 81,
      exactTimeStatus: 'not_found',
    };

    const b: Transit = {
      ...a,
      natalLongitude: 80,
    };

    const first = deduplicateTransits([a, b])[0];
    const second = deduplicateTransits([b, a])[0];

    expect(first.natalLongitude).toBe(second.natalLongitude);
    expect(first.natalLongitude).toBe(80);
  });
});
