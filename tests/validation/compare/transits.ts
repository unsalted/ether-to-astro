import type { NormalizedTransit } from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';

export function findTransit(
  transits: NormalizedTransit[],
  transitingPlanet: string,
  natalPlanet: string,
  aspect: string
): NormalizedTransit | undefined {
  return transits.find(
    (t) =>
      t.transitingPlanet === transitingPlanet &&
      t.natalPlanet === natalPlanet &&
      t.aspect === aspect
  );
}

export function assertTransitStatus(
  fixtureName: string,
  transit: NormalizedTransit | undefined,
  expectedStatus:
    | 'within_preview'
    | 'outside_preview'
    | 'not_found'
    | 'unsupported_body'
    | 'undefined',
  report: ValidationReport
): void {
  if (!transit) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'transits',
      expected: 'transit exists',
      actual: 'not found',
      delta: null,
      tolerance: 'exact',
      message: 'Expected transit was not found',
    });
    return;
  }

  const actual = transit.exactTimeStatus;
  if (expectedStatus === 'undefined') {
    if (actual !== undefined) {
      report.addHard({
        fixture: fixtureName,
        subsystem: 'transits',
        expected: undefined,
        actual,
        delta: null,
        tolerance: 'exact',
        message: 'Expected exactTimeStatus to be undefined',
      });
    }
    return;
  }

  if (actual !== expectedStatus) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'transits',
      expected: expectedStatus,
      actual,
      delta: null,
      tolerance: 'exact',
      message: 'Exact-time status mismatch',
    });
  }
}
