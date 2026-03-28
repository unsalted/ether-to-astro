import type { NormalizedRoot } from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';
import { minutesBetweenIso, TOLERANCES } from '../utils/tolerances.js';

function dedupeRootsByMinutes(roots: NormalizedRoot[], minutes: number): NormalizedRoot[] {
  const sorted = [...roots].sort((a, b) => a.jd - b.jd);
  const deduped: NormalizedRoot[] = [];
  for (const r of sorted) {
    const last = deduped[deduped.length - 1];
    if (!last || minutesBetweenIso(last.isoUtc, r.isoUtc) > minutes) {
      deduped.push(r);
    }
  }
  return deduped;
}

export function compareRoots(
  fixtureName: string,
  productionRoots: NormalizedRoot[],
  oracleRoots: NormalizedRoot[],
  report: ValidationReport,
  details?: unknown
): void {
  const dedupeMinutes = TOLERANCES.dedupeMinutes;
  const normalizedProduction = dedupeRootsByMinutes(productionRoots, dedupeMinutes);
  const normalizedOracle = dedupeRootsByMinutes(oracleRoots, dedupeMinutes);

  if (normalizedProduction.length !== normalizedOracle.length) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'roots',
      expected: normalizedOracle.length,
      actual: normalizedProduction.length,
      delta: normalizedProduction.length - normalizedOracle.length,
      tolerance: 0,
      message: 'Root count mismatch (production vs dense-scan oracle, deduped)',
      details,
    });
  }

  const n = Math.min(normalizedProduction.length, normalizedOracle.length);
  for (let i = 0; i < n; i++) {
    const prod = normalizedProduction[i];
    const oracle = normalizedOracle[i];
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
        details,
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
        details,
      });
    }
  }

  for (let i = 1; i < normalizedProduction.length; i++) {
    if (normalizedProduction[i].jd < normalizedProduction[i - 1].jd) {
      report.addHard({
        fixture: fixtureName,
        subsystem: 'roots',
        expected: 'sorted ascending',
        actual: normalizedProduction.map((r) => r.jd),
        delta: null,
        tolerance: 'exact',
        message: 'Production roots are not sorted earliest-first',
        details,
      });
      break;
    }
  }
}
