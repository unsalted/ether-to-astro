import { TOLERANCES, minutesBetweenIso } from '../utils/tolerances.js';
import type { NormalizedRoot } from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';

export function compareRoots(
  fixtureName: string,
  productionRoots: NormalizedRoot[],
  oracleRoots: NormalizedRoot[],
  report: ValidationReport
): void {
  if (productionRoots.length !== oracleRoots.length) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'roots',
      expected: oracleRoots.length,
      actual: productionRoots.length,
      delta: productionRoots.length - oracleRoots.length,
      tolerance: 0,
      message: 'Root count mismatch (production vs dense-scan oracle)',
    });
  }

  const n = Math.min(productionRoots.length, oracleRoots.length);
  for (let i = 0; i < n; i++) {
    const prod = productionRoots[i];
    const oracle = oracleRoots[i];
    const deltaMinutes = minutesBetweenIso(prod.isoUtc, oracle.isoUtc);

    if (deltaMinutes > TOLERANCES.rootHardMinutes) {
      report.addHard({
        fixture: fixtureName,
        subsystem: 'roots',
        expected: oracle.isoUtc,
        actual: prod.isoUtc,
        delta: deltaMinutes,
        tolerance: TOLERANCES.rootHardMinutes,
        message: `Root ${i} timing exceeds hard threshold`,
      });
      continue;
    }

    if (deltaMinutes > TOLERANCES.rootPreferredMinutes) {
      report.addWarning({
        fixture: fixtureName,
        subsystem: 'roots',
        expected: oracle.isoUtc,
        actual: prod.isoUtc,
        delta: deltaMinutes,
        tolerance: TOLERANCES.rootPreferredMinutes,
        message: `Root ${i} timing exceeds preferred threshold`,
      });
    }
  }

  for (let i = 1; i < productionRoots.length; i++) {
    if (productionRoots[i].jd < productionRoots[i - 1].jd) {
      report.addHard({
        fixture: fixtureName,
        subsystem: 'roots',
        expected: 'sorted ascending',
        actual: productionRoots.map((r) => r.jd),
        delta: null,
        tolerance: 'exact',
        message: 'Production roots are not sorted earliest-first',
      });
      break;
    }
  }
}
