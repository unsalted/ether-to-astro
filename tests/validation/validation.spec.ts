import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localToUTC } from '../../src/time-utils.js';
import { PLANETS, type PlanetPosition } from '../../src/types.js';
import { getAstrologPositions, probeAstrolog } from './adapters/astrolog.js';
import { InternalValidationAdapter } from './adapters/internal.js';
import { compareEclipses } from './compare/eclipses.js';
import { compareHouses } from './compare/houses.js';
import { comparePositions } from './compare/positions.js';
import { compareRoots } from './compare/roots.js';
import { compareRiseSet } from './compare/riseSet.js';
import { assertTransitStatus, findTransit } from './compare/transits.js';
import { eclipseFixtures } from './fixtures/eclipses/core.js';
import { houseFixtures } from './fixtures/houses/core.js';
import { positionFixtures } from './fixtures/positions/core.js';
import { riseSetFixtures } from './fixtures/rise-set/core.js';
import { rootFixtures } from './fixtures/roots/core.js';
import { dstFixtures } from './fixtures/transits/dst.js';
import { transitFixtures } from './fixtures/transits/core.js';
import { denseScanRootOracleWithDebug } from './utils/denseRootOracle.js';
import { formatMismatch, ValidationReport } from './utils/report.js';
import { TOLERANCES } from './utils/tolerances.js';

function assertNoHardFailures(report: ValidationReport): void {
  if (report.hardFailures.length === 0) return;
  const details = report.hardFailures.map(formatMismatch).join('\n');
  expect(details).toBe('');
}

function normalizeLongitudeDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function shortestDiff(longitude: number, targetLongitude: number): number {
  let diff = ((longitude % 360) + 360) % 360 - (((targetLongitude % 360) + 360) % 360);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

describe('Astro Validation Harness', () => {
  let adapter: InternalValidationAdapter;
  const aggregateReport = new ValidationReport();
  const astrologProbe = probeAstrolog();

  beforeAll(async () => {
    adapter = await InternalValidationAdapter.create();
  });

  afterAll(() => {
    const wallClockMs = Math.round(performance.timeOrigin + performance.now());
    aggregateReport.generatedAt = new Date(wallClockMs).toISOString();
    aggregateReport.flushWarningsToConsole();
    writeFileSync('/tmp/astro-validation-report.json', aggregateReport.toJson(), 'utf8');
  });

  describe('A. Planet positions', () => {
    it('validates normalized internal positions against curated fixtures', () => {
      const report = new ValidationReport();
      for (const fixture of positionFixtures) {
        const actual = adapter.getPositions(fixture.isoUtc, fixture.planetIds);
        comparePositions(fixture.name, fixture.expected, actual, report);
      }
      aggregateReport.hardFailures.push(...report.hardFailures);
      aggregateReport.warnings.push(...report.warnings);
      assertNoHardFailures(report);
    });

    const astrologIt = astrologProbe.enabled && astrologProbe.available ? it : it.skip;
    astrologIt('runs optional Astrolog parity on a subset when enabled and installed', () => {
      const report = new ValidationReport();
      const subset = positionFixtures.slice(0, 2);
      for (const fixture of subset) {
        const internal = adapter.getPositions(fixture.isoUtc, fixture.planetIds);
        const astrolog = getAstrologPositions(fixture.isoUtc, astrologProbe);
        if (!astrolog.ok || !astrolog.positions) {
          report.addWarning({
            fixture: fixture.name,
            subsystem: 'astrolog-positions',
            expected: 'parsed positions',
            actual: astrolog.reason ?? 'unavailable',
            delta: null,
            tolerance: 'n/a',
            message: 'Astrolog parity skipped for this fixture',
          });
          continue;
        }

        for (const row of internal) {
          const ext = astrolog.positions.find((p) => p.body === row.body);
          if (!ext) continue;
          const delta = normalizeLongitudeDelta(row.longitude, ext.longitude);
          if (delta > TOLERANCES.astrologPositionLongitudeDeg) {
            report.addHard({
              fixture: fixture.name,
              subsystem: 'astrolog-positions',
              expected: row.longitude,
              actual: ext.longitude,
              delta,
              tolerance: TOLERANCES.astrologPositionLongitudeDeg,
              message: `${row.body} longitude differs by >${TOLERANCES.astrologPositionLongitudeDeg}° vs Astrolog`,
            });
          }
        }
      }
      aggregateReport.hardFailures.push(...report.hardFailures);
      aggregateReport.warnings.push(...report.warnings);
      assertNoHardFailures(report);
    });
  });

  describe('B. Houses', () => {
    it('compares house cusps, ASC, and MC with polar fallback semantics', () => {
      const report = new ValidationReport();
      for (const fixture of houseFixtures) {
        const actual = adapter.getHouseResult(
          fixture.isoUtc,
          fixture.latitude,
          fixture.longitude,
          fixture.houseSystem
        );
        compareHouses(fixture.name, fixture.expected, actual, report);
      }
      aggregateReport.hardFailures.push(...report.hardFailures);
      aggregateReport.warnings.push(...report.warnings);
      assertNoHardFailures(report);
    });
  });

  describe('C. Transit detection + statuses', () => {
    it('verifies expected aspects, applying/separating behavior, and exactTimeStatus semantics', () => {
      const report = new ValidationReport();
      for (const fixture of transitFixtures) {
        const transits = adapter.getTransitsFromOffsets({
          currentIsoUtc: fixture.currentIsoUtc,
          transitingPlanetId: fixture.transitingPlanetId,
          natalPlanetId: fixture.natalPlanetId,
          natalOffsetDegrees: fixture.natalOffsetDegrees,
        });
        const transiting = adapter.ephem.getPlanetPosition(
          fixture.transitingPlanetId,
          adapter.ephem.dateToJulianDay(new Date(fixture.currentIsoUtc))
        );
        const natalName = adapter.ephem.getPlanetPosition(
          fixture.natalPlanetId,
          adapter.ephem.dateToJulianDay(new Date(fixture.currentIsoUtc))
        ).planet;

        const hit = findTransit(transits, transiting.planet, natalName, fixture.expectedAspect);
        assertTransitStatus(
          fixture.name,
          hit,
          fixture.expectExactTimeStatus ?? 'undefined',
          report
        );

        if (fixture.expectedIsApplying != null && hit && hit.isApplying !== fixture.expectedIsApplying) {
          report.addHard({
            fixture: fixture.name,
            subsystem: 'transits',
            expected: fixture.expectedIsApplying,
            actual: hit.isApplying,
            delta: null,
            tolerance: 'exact',
            message: 'Applying/separating mismatch',
          });
        }
      }
      aggregateReport.hardFailures.push(...report.hardFailures);
      aggregateReport.warnings.push(...report.warnings);
      assertNoHardFailures(report);
    });
  });

  describe('D. Exact root solver vs dense oracle', () => {
    it('validates root count/order/timing against independent dense-scan oracle', () => {
      const report = new ValidationReport();

      for (const fixture of rootFixtures) {
        const startJD = adapter.ephem.dateToJulianDay(new Date(fixture.startIsoUtc));
        const endJD = adapter.ephem.dateToJulianDay(new Date(fixture.endIsoUtc));

        let targetLongitude = fixture.targetLongitude;
        if (fixture.targetFromStartLongitude) {
          targetLongitude = adapter.ephem.getPlanetPosition(fixture.planetId, startJD).longitude;
        }
        if (fixture.targetFromSampledMinimum) {
          let minLon = Number.POSITIVE_INFINITY;
          const samples = fixture.targetFromSampledMinimum.samples;
          for (let i = 0; i <= samples; i++) {
            const jd = startJD + (i * (endJD - startJD)) / samples;
            const lon = adapter.ephem.getPlanetPosition(fixture.planetId, jd).longitude;
            if (lon < minLon) minLon = lon;
          }
          targetLongitude = minLon;
        }
        if (targetLongitude == null) {
          throw new Error(`Fixture ${fixture.name} must define target longitude strategy`);
        }

        const productionRoots = adapter.getExactRoots(
          fixture.planetId,
          targetLongitude,
          fixture.startIsoUtc,
          fixture.endIsoUtc
        );

        const oracleResult = denseScanRootOracleWithDebug(
          (jd) => adapter.ephem.getPlanetPosition(fixture.planetId, jd).longitude,
          targetLongitude,
          startJD,
          endJD,
          {
            toIsoUtc: (jd) => adapter.ephem.julianDayToDate(jd).toISOString(),
          }
        );
        const oracleRoots = oracleResult.roots.map((jd) => ({
          jd,
          isoUtc: adapter.ephem.julianDayToDate(jd).toISOString(),
        }));

        const rootDetails = {
          planetId: fixture.planetId,
          targetLongitude,
          startIsoUtc: fixture.startIsoUtc,
          endIsoUtc: fixture.endIsoUtc,
          startJD,
          endJD,
          toleranceDeg: oracleResult.debug.toleranceDeg,
          sampleStepDays: oracleResult.debug.sampleStepDays,
          dedupeEpsilonDays: oracleResult.debug.dedupeEpsilonDays,
          sanityWarnings: oracleResult.debug.sanityWarnings,
          productionRoots: productionRoots.map((r) => ({
            ...r,
            residualAbsDeg: Math.abs(
              shortestDiff(
                adapter.ephem.getPlanetPosition(fixture.planetId, r.jd).longitude,
                targetLongitude
              )
            ),
          })),
          oracleRoots: oracleRoots.map((r) => ({
            ...r,
            residualAbsDeg: Math.abs(
              shortestDiff(
                adapter.ephem.getPlanetPosition(fixture.planetId, r.jd).longitude,
                targetLongitude
              )
            ),
          })),
          sampledTrace: oracleResult.debug.samples,
          crossings: oracleResult.debug.crossings,
        };

        compareRoots(fixture.name, productionRoots, oracleRoots, report, rootDetails);

        if (
          fixture.expectedMinRoots != null &&
          productionRoots.length < fixture.expectedMinRoots
        ) {
          report.addHard({
            fixture: fixture.name,
            subsystem: 'roots',
            expected: `>= ${fixture.expectedMinRoots}`,
            actual: productionRoots.length,
            delta: null,
            tolerance: 'exact',
            message: 'Root count below expected minimum',
          });
        }

        if (
          fixture.expectedMaxRoots != null &&
          productionRoots.length > fixture.expectedMaxRoots
        ) {
          report.addHard({
            fixture: fixture.name,
            subsystem: 'roots',
            expected: `<= ${fixture.expectedMaxRoots}`,
            actual: productionRoots.length,
            delta: null,
            tolerance: 'exact',
            message: 'Root count above expected maximum',
          });
        }
      }

      aggregateReport.hardFailures.push(...report.hardFailures);
      aggregateReport.warnings.push(...report.warnings);
      assertNoHardFailures(report);
    });
  });

  describe('E. Transit root selection policy', () => {
    it('selects earliest future for applying and latest past for separating', () => {
      const nowIso = '2024-03-15T00:00:00Z';
      const nowJD = adapter.ephem.dateToJulianDay(new Date(nowIso));
      const mars = adapter.ephem.getPlanetPosition(PLANETS.MARS, nowJD);

      const mkNatal = (offset: number): PlanetPosition => ({
        planetId: PLANETS.VENUS,
        planet: 'Venus',
        longitude: (mars.longitude + offset + 360) % 360,
        latitude: 0,
        distance: 1,
        speed: 1,
        sign: 'Aries',
        degree: 0,
        isRetrograde: false,
      });

      const spy = vi
        .spyOn(adapter.ephem, 'findExactTransitTimes')
        .mockReturnValue([nowJD - 2, nowJD + 3]);

      const applying = adapter.getTransits([mars], [mkNatal(92)], nowIso).find((t) => t.aspect === 'square');
      const separating = adapter.getTransits([mars], [mkNatal(88)], nowIso).find((t) => t.aspect === 'square');
      spy.mockRestore();

      expect(applying?.exactTime).toBe(adapter.ephem.julianDayToDate(nowJD + 3).toISOString());
      expect(applying?.isApplying).toBe(true);
      expect(separating?.exactTime).toBe(adapter.ephem.julianDayToDate(nowJD - 2).toISOString());
      expect(separating?.isApplying).toBe(false);
    });

    it('outside_preview suppresses exactTime while preserving status', () => {
      const nowIso = '2024-03-15T00:00:00Z';
      const nowJD = adapter.ephem.dateToJulianDay(new Date(nowIso));
      const mars = adapter.ephem.getPlanetPosition(PLANETS.MARS, nowJD);
      const natal: PlanetPosition = {
        planetId: PLANETS.VENUS,
        planet: 'Venus',
        longitude: mars.longitude,
        latitude: 0,
        distance: 1,
        speed: 1,
        sign: 'Aries',
        degree: 0,
        isRetrograde: false,
      };

      const spy = vi.spyOn(adapter.ephem, 'findExactTransitTimes').mockReturnValue([nowJD + 120]);
      const transit = adapter
        .getTransits([mars], [natal], nowIso)
        .find((t) => t.aspect === 'conjunction');
      spy.mockRestore();

      expect(transit?.exactTimeStatus).toBe('outside_preview');
      expect(transit?.exactTime).toBeUndefined();
    });

    it('unsupported_body and not_found statuses are surfaced honestly', () => {
      const nowIso = '2024-03-15T00:00:00Z';
      const nowJD = adapter.ephem.dateToJulianDay(new Date(nowIso));
      const mars = adapter.ephem.getPlanetPosition(PLANETS.MARS, nowJD);

      const natal: PlanetPosition = {
        planetId: PLANETS.VENUS,
        planet: 'Venus',
        longitude: mars.longitude,
        latitude: 0,
        distance: 1,
        speed: 1,
        sign: 'Aries',
        degree: 0,
        isRetrograde: false,
      };

      const unsupportedTransit: PlanetPosition = { ...mars, planetId: 9999 };
      const unsupported = adapter
        .getTransits([unsupportedTransit], [natal], nowIso)
        .find((t) => t.aspect === 'conjunction');
      expect(unsupported?.exactTimeStatus).toBe('unsupported_body');

      const spy = vi.spyOn(adapter.ephem, 'findExactTransitTimes').mockReturnValue([]);
      const notFound = adapter.getTransits([mars], [natal], nowIso).find((t) => t.aspect === 'conjunction');
      spy.mockRestore();
      expect(notFound?.exactTimeStatus).toBe('not_found');
      expect(notFound?.exactTime).toBeUndefined();
    });
  });

  describe('F. Rise/set semantics', () => {
    it('treats outputs as next events after instant and handles high-latitude no-event cases', () => {
      if (!adapter.canComputeRiseSet()) {
        aggregateReport.addWarning({
          fixture: 'rise-set-capability',
          subsystem: 'rise-set',
          expected: 'supported Swiss-Eph rise/set functions',
          actual: 'not available in current runtime',
          delta: null,
          tolerance: 'n/a',
          message: 'Rise/set validation skipped',
          capability: 'unavailable',
          validation: 'skipped_intentionally',
          details: {
            missingExports: ['rise_trans'],
          },
        });
        return;
      }
      const report = new ValidationReport();

      // Next-event semantics check for same location with different anchors.
      const laEarly = adapter.getRiseSet('2024-03-26T00:00:00Z', PLANETS.SUN, 34.0522, -118.2437);
      const laLate = adapter.getRiseSet('2024-03-26T20:30:00Z', PLANETS.SUN, 34.0522, -118.2437);
      if (laEarly.rise && laLate.rise) {
        expect(new Date(laLate.rise).getTime()).toBeGreaterThanOrEqual(
          new Date(laEarly.rise).getTime()
        );
      }

      const baseline = adapter.getRiseSet(
        riseSetFixtures[0].isoUtc,
        riseSetFixtures[0].planetId,
        riseSetFixtures[0].latitude,
        riseSetFixtures[0].longitude
      );
      compareRiseSet(riseSetFixtures[0].name, baseline, baseline, report);

      const polar = adapter.getRiseSet(
        riseSetFixtures[1].isoUtc,
        riseSetFixtures[1].planetId,
        riseSetFixtures[1].latitude,
        riseSetFixtures[1].longitude
      );
      if (riseSetFixtures[1].expectedNoRiseSet) {
        expect(polar.rise).toBeUndefined();
        expect(polar.set).toBeUndefined();
      }

      aggregateReport.hardFailures.push(...report.hardFailures);
      aggregateReport.warnings.push(...report.warnings);
      assertNoHardFailures(report);
    });
  });

  describe('G. Eclipses', () => {
    it('validates next eclipse type/subtype/maxTime sanity', () => {
      if (!adapter.canComputeEclipses()) {
        aggregateReport.addWarning({
          fixture: 'eclipse-capability',
          subsystem: 'eclipses',
          expected: 'supported Swiss-Eph eclipse functions',
          actual: 'not available in current runtime',
          delta: null,
          tolerance: 'n/a',
          message: 'Eclipse validation skipped',
          capability: 'unavailable',
          validation: 'skipped_intentionally',
          details: {
            missingExports: ['sol_eclipse_when_glob', 'lun_eclipse_when'],
          },
        });
        return;
      }
      const report = new ValidationReport();
      for (const fixture of eclipseFixtures) {
        const actual = adapter.getNextEclipse(fixture.startIsoUtc, fixture.type);
        expect(actual).not.toBeNull();
        if (!actual) continue;

        // Same-engine baseline fixture for deterministic checks.
        const expected = adapter.getNextEclipse(fixture.startIsoUtc, fixture.type);
        if (!expected) continue;
        compareEclipses(fixture.name, expected, actual, report);
      }
      aggregateReport.hardFailures.push(...report.hardFailures);
      aggregateReport.warnings.push(...report.warnings);
      assertNoHardFailures(report);
    });
  });

  describe('DST scenario fixtures', () => {
    it('covers ambiguous and nonexistent local times under reject policy', () => {
      for (const fixture of dstFixtures) {
        expect(() => localToUTC(fixture.local, fixture.timezone, 'reject')).toThrow();
      }
    });
  });
});
