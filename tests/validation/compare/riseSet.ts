import { TOLERANCES, minutesBetweenIso } from '../utils/tolerances.js';
import type { NormalizedRiseSet } from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';

export function compareRiseSet(
  fixtureName: string,
  expected: NormalizedRiseSet,
  actual: NormalizedRiseSet,
  report: ValidationReport
): void {
  const fields: Array<keyof Omit<NormalizedRiseSet, 'body'>> = [
    'rise',
    'set',
    'upperMeridianTransit',
    'lowerMeridianTransit',
  ];

  for (const field of fields) {
    const e = expected[field];
    const a = actual[field];
    if (e == null && a == null) continue;
    if ((e == null) !== (a == null)) {
      report.addHard({
        fixture: fixtureName,
        subsystem: 'rise-set',
        expected: e,
        actual: a,
        delta: null,
        tolerance: 'exact',
        message: `${field} presence mismatch`,
      });
      continue;
    }

    const delta = minutesBetweenIso(e as string, a as string);
    if (delta > TOLERANCES.riseSetMinutes) {
      report.addHard({
        fixture: fixtureName,
        subsystem: 'rise-set',
        expected: e,
        actual: a,
        delta,
        tolerance: TOLERANCES.riseSetMinutes,
        message: `${field} timing exceeds tolerance`,
      });
    }
  }
}
