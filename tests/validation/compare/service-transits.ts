import type {
  NormalizedServiceTransit,
  NormalizedServiceTransitResult,
  ServiceTransitFixture,
} from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';

function findServiceTransit(
  transits: NormalizedServiceTransit[],
  expected: ServiceTransitFixture['expected']['expectTransit']
): NormalizedServiceTransit | undefined {
  return transits.find(
    (transit) =>
      transit.transitingPlanet === expected.transitingPlanet &&
      transit.natalPlanet === expected.natalPlanet &&
      transit.aspect === expected.aspect
  );
}

export function compareServiceTransitFixture(
  fixture: ServiceTransitFixture,
  actual: NormalizedServiceTransitResult,
  report: ValidationReport
): void {
  if (actual.mode !== fixture.expected.mode) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'service-transits',
      expected: fixture.expected.mode,
      actual: actual.mode,
      delta: null,
      tolerance: 'exact',
      message: 'Transit response mode mismatch',
      details: actual,
    });
  }

  if (actual.timezone !== fixture.expected.timezone) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'service-transits',
      expected: fixture.expected.timezone,
      actual: actual.timezone,
      delta: null,
      tolerance: 'exact',
      message: 'Reporting timezone label mismatch',
      details: actual,
    });
  }

  if (actual.calculationTimezone !== fixture.expected.calculationTimezone) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'service-transits',
      expected: fixture.expected.calculationTimezone,
      actual: actual.calculationTimezone,
      delta: null,
      tolerance: 'exact',
      message: 'Calculation timezone mismatch',
      details: actual,
    });
  }

  if (actual.reportingTimezone !== fixture.expected.reportingTimezone) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'service-transits',
      expected: fixture.expected.reportingTimezone,
      actual: actual.reportingTimezone,
      delta: null,
      tolerance: 'exact',
      message: 'Explicit reporting_timezone field mismatch',
      details: actual,
    });
  }

  if (fixture.expected.windowStart && actual.windowStart !== fixture.expected.windowStart) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'service-transits',
      expected: fixture.expected.windowStart,
      actual: actual.windowStart,
      delta: null,
      tolerance: 'exact',
      message: 'window_start mismatch',
      details: actual,
    });
  }

  if (fixture.expected.windowEnd && actual.windowEnd !== fixture.expected.windowEnd) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'service-transits',
      expected: fixture.expected.windowEnd,
      actual: actual.windowEnd,
      delta: null,
      tolerance: 'exact',
      message: 'window_end mismatch',
      details: actual,
    });
  }

  if (fixture.expected.forecastDays !== undefined) {
    if (!actual.forecast) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'service-transits',
        expected: fixture.expected.forecastDays,
        actual: 'missing forecast payload',
        delta: null,
        tolerance: 'exact',
        message: 'Forecast response omitted forecast day groups',
        details: actual,
      });
      return;
    }

    if (actual.forecast.length !== fixture.expected.forecastDays) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'service-transits',
        expected: fixture.expected.forecastDays,
        actual: actual.forecast.length,
        delta: actual.forecast.length - fixture.expected.forecastDays,
        tolerance: 'exact',
        message: 'Forecast day-group count mismatch',
        details: actual,
      });
    }

    for (const [index, day] of actual.forecast.entries()) {
      if (!Array.isArray(day.transits)) {
        report.addHard({
          fixture: fixture.name,
          subsystem: 'service-transits',
          expected: 'array',
          actual: typeof day.transits,
          delta: null,
          tolerance: 'exact',
          message: `Forecast day ${index + 1} is missing a transits array`,
          details: day,
        });
      }
    }
  }

  const searchableTransits = actual.forecast
    ? actual.forecast.flatMap((day) => day.transits)
    : (actual.transits ?? []);
  const hit = findServiceTransit(searchableTransits, fixture.expected.expectTransit);
  if (!hit) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'service-transits',
      expected: fixture.expected.expectTransit,
      actual: searchableTransits,
      delta: null,
      tolerance: 'matching transit must exist',
      message: 'Expected serialized service transit was not found',
      details: actual,
    });
    return;
  }

  const enrichedFields = [
    hit.transitSign,
    hit.transitDegree,
    hit.transitHouse,
    hit.natalSign,
    hit.natalDegree,
    hit.natalHouse,
  ];
  if (enrichedFields.some((field) => field === undefined)) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'service-transits',
      expected: 'all enriched placement fields defined',
      actual: hit,
      delta: null,
      tolerance: 'exact',
      message: 'Serialized service transit is missing enriched placement fields',
      details: actual,
    });
  }

  for (const [key, expectedValue] of Object.entries(fixture.expected.expectTransit)) {
    if (expectedValue === undefined) {
      continue;
    }

    const actualValue = hit[key as keyof NormalizedServiceTransit];
    if (actualValue !== expectedValue) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'service-transits',
        expected: expectedValue,
        actual: actualValue,
        delta: null,
        tolerance: 'exact',
        message: `Serialized transit field ${key} mismatch`,
        details: hit,
      });
    }
  }
}
