import type { ElectionalFixture, NormalizedElectionalContext } from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';

function matchesRawAltitudeSign(
  value: number,
  expected: 'positive' | 'negative' | 'zero'
): boolean {
  if (expected === 'zero') {
    return Math.abs(value) < 1e-9;
  }
  return expected === 'positive' ? value > 0 : value < 0;
}

export function compareElectionalContext(
  fixture: ElectionalFixture,
  actual: NormalizedElectionalContext,
  report: ValidationReport
): void {
  const { expected } = fixture;

  if (actual.classification !== expected.classification) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'electional',
      expected: expected.classification,
      actual: actual.classification,
      delta: null,
      tolerance: 'exact',
      message: 'Sect classification mismatch',
      details: actual,
    });
  }

  if (actual.isDayChart !== expected.isDayChart) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'electional',
      expected: expected.isDayChart,
      actual: actual.isDayChart,
      delta: null,
      tolerance: 'exact',
      message: 'is_day_chart mismatch',
      details: actual,
    });
  }

  if (expected.houseSystem && actual.houseSystem !== expected.houseSystem) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'electional',
      expected: expected.houseSystem,
      actual: actual.houseSystem,
      delta: null,
      tolerance: 'exact',
      message: 'Resolved house system mismatch',
      details: actual,
    });
  }

  if (
    expected.rawSunAltitudeSign &&
    !matchesRawAltitudeSign(actual.rawSunAltitudeDegrees, expected.rawSunAltitudeSign)
  ) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'electional',
      expected: expected.rawSunAltitudeSign,
      actual: actual.rawSunAltitudeDegrees,
      delta: null,
      tolerance: 'sign only',
      message: 'Raw Sun altitude sign mismatch',
      details: actual,
    });
  }

  if (
    expected.sunAltitudeDisplaysZero !== undefined &&
    actual.sunAltitudeDisplaysZero !== expected.sunAltitudeDisplaysZero
  ) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'electional',
      expected: expected.sunAltitudeDisplaysZero,
      actual: actual.sunAltitudeDisplaysZero,
      delta: null,
      tolerance: 'exact',
      message: 'Rounded Sun altitude zero-display expectation mismatch',
      details: actual,
    });
  }

  for (const warning of expected.warningsContain ?? []) {
    if (!actual.warnings.includes(warning)) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'electional',
        expected: warning,
        actual: actual.warnings,
        delta: null,
        tolerance: 'contains',
        message: 'Expected electional warning was not emitted',
        details: actual,
      });
    }
  }

  if (
    expected.hasApplyingAspects !== undefined &&
    actual.hasApplyingAspects !== expected.hasApplyingAspects
  ) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'electional',
      expected: expected.hasApplyingAspects,
      actual: actual.hasApplyingAspects,
      delta: null,
      tolerance: 'exact',
      message: 'Top-level applying-aspect presence mismatch',
      details: actual,
    });
  }

  if (
    expected.hasMoonApplyingAspects !== undefined &&
    actual.hasMoonApplyingAspects !== expected.hasMoonApplyingAspects
  ) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'electional',
      expected: expected.hasMoonApplyingAspects,
      actual: actual.hasMoonApplyingAspects,
      delta: null,
      tolerance: 'exact',
      message: 'Moon applying-aspect presence mismatch',
      details: actual,
    });
  }

  if (expected.hasRulerBasics !== undefined && actual.hasRulerBasics !== expected.hasRulerBasics) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'electional',
      expected: expected.hasRulerBasics,
      actual: actual.hasRulerBasics,
      delta: null,
      tolerance: 'exact',
      message: 'Ruler-basics presence mismatch',
      details: actual,
    });
  }
}
