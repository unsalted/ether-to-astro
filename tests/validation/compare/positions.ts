import type { NormalizedBody } from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';
import { TOLERANCES } from '../utils/tolerances.js';

function sortBodies(rows: NormalizedBody[]): NormalizedBody[] {
  return [...rows].sort((a, b) => String(a.body).localeCompare(String(b.body)));
}

export function comparePositions(
  fixtureName: string,
  expected: NormalizedBody[],
  actual: NormalizedBody[],
  report: ValidationReport,
  subsystem = 'positions'
): void {
  const expectedSorted = sortBodies(expected);
  const actualSorted = sortBodies(actual);

  if (expectedSorted.length !== actualSorted.length) {
    report.addHard({
      fixture: fixtureName,
      subsystem,
      expected: expectedSorted.length,
      actual: actualSorted.length,
      delta: actualSorted.length - expectedSorted.length,
      tolerance: 0,
      message: 'Body count mismatch',
    });
    return;
  }

  for (let i = 0; i < expectedSorted.length; i++) {
    const e = expectedSorted[i];
    const a = actualSorted[i];

    if (e.body !== a.body) {
      report.addHard({
        fixture: fixtureName,
        subsystem,
        expected: e.body,
        actual: a.body,
        delta: null,
        tolerance: 'exact',
        message: 'Body mismatch at sorted index',
      });
      continue;
    }

    const lonDelta = Math.abs(e.longitude - a.longitude);
    if (lonDelta > TOLERANCES.positionLongitudeDeg) {
      report.addHard({
        fixture: fixtureName,
        subsystem,
        expected: e.longitude,
        actual: a.longitude,
        delta: lonDelta,
        tolerance: TOLERANCES.positionLongitudeDeg,
        message: `${e.body} longitude delta exceeds tolerance`,
      });
    }

    if (e.latitude != null && a.latitude != null) {
      const latDelta = Math.abs(e.latitude - a.latitude);
      if (latDelta > TOLERANCES.positionLatitudeDeg) {
        report.addHard({
          fixture: fixtureName,
          subsystem,
          expected: e.latitude,
          actual: a.latitude,
          delta: latDelta,
          tolerance: TOLERANCES.positionLatitudeDeg,
          message: `${e.body} latitude delta exceeds tolerance`,
        });
      }
    }

    if (e.speed != null && a.speed != null) {
      const speedDelta = Math.abs(e.speed - a.speed);
      if (speedDelta > TOLERANCES.positionSpeedDegPerDay) {
        report.addHard({
          fixture: fixtureName,
          subsystem,
          expected: e.speed,
          actual: a.speed,
          delta: speedDelta,
          tolerance: TOLERANCES.positionSpeedDegPerDay,
          message: `${e.body} speed delta exceeds tolerance`,
        });
      }
    }

    if (e.retrograde != null && a.retrograde != null && e.retrograde !== a.retrograde) {
      report.addHard({
        fixture: fixtureName,
        subsystem,
        expected: e.retrograde,
        actual: a.retrograde,
        delta: null,
        tolerance: 'exact',
        message: `${e.body} retrograde flag mismatch`,
      });
    }
  }
}
