import type { NormalizedHouseResult } from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';
import { TOLERANCES } from '../utils/tolerances.js';

export function compareHouses(
  fixtureName: string,
  expected: NormalizedHouseResult,
  actual: NormalizedHouseResult,
  report: ValidationReport
): void {
  if (expected.system !== actual.system) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'houses',
      expected: expected.system,
      actual: actual.system,
      delta: null,
      tolerance: 'exact',
      message: 'House system mismatch (including fallback system)',
    });
  }

  const ascDelta = Math.abs(expected.ascendant - actual.ascendant);
  if (ascDelta > TOLERANCES.houseDeg) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'houses',
      expected: expected.ascendant,
      actual: actual.ascendant,
      delta: ascDelta,
      tolerance: TOLERANCES.houseDeg,
      message: 'Ascendant delta exceeds tolerance',
    });
  }

  const mcDelta = Math.abs(expected.mc - actual.mc);
  if (mcDelta > TOLERANCES.houseDeg) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'houses',
      expected: expected.mc,
      actual: actual.mc,
      delta: mcDelta,
      tolerance: TOLERANCES.houseDeg,
      message: 'MC delta exceeds tolerance',
    });
  }

  if (expected.cusps.length !== actual.cusps.length) {
    report.addHard({
      fixture: fixtureName,
      subsystem: 'houses',
      expected: expected.cusps.length,
      actual: actual.cusps.length,
      delta: actual.cusps.length - expected.cusps.length,
      tolerance: 0,
      message: 'Cusp count mismatch',
    });
    return;
  }

  for (let i = 0; i < expected.cusps.length; i++) {
    const delta = Math.abs(expected.cusps[i] - actual.cusps[i]);
    if (delta > TOLERANCES.houseDeg) {
      report.addHard({
        fixture: fixtureName,
        subsystem: 'houses',
        expected: expected.cusps[i],
        actual: actual.cusps[i],
        delta,
        tolerance: TOLERANCES.houseDeg,
        message: `House cusp ${i + 1} delta exceeds tolerance`,
      });
    }
  }
}
