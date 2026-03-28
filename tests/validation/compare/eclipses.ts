import type { NormalizedEclipse } from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';
import { minutesBetweenIso, TOLERANCES } from '../utils/tolerances.js';

export function compareEclipses(
  fixtureName: string,
  expected: NormalizedEclipse,
  actual: NormalizedEclipse,
  report: ValidationReport
): void {
  if (expected.type !== actual.type) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'eclipses',
      expected: expected.type,
      actual: actual.type,
      delta: null,
      tolerance: 'exact',
      message: 'Eclipse type mismatch',
    });
  }

  if (expected.eclipseType !== actual.eclipseType) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'eclipses',
      expected: expected.eclipseType,
      actual: actual.eclipseType,
      delta: null,
      tolerance: 'exact',
      message: 'Eclipse subtype mismatch',
    });
  }

  const delta = minutesBetweenIso(expected.maxTime, actual.maxTime);
  if (delta > TOLERANCES.eclipseMinutes) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'eclipses',
      expected: expected.maxTime,
      actual: actual.maxTime,
      delta,
      tolerance: TOLERANCES.eclipseMinutes,
      message: 'Eclipse maxTime delta exceeds tolerance',
    });
  }
}
