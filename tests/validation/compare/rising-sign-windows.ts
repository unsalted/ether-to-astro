import {
  addLocalDays,
  formatLocalTimestampWithOffset,
  localToUTC,
} from '../../../src/time-utils.js';
import type { InternalValidationAdapter } from '../adapters/internal.js';
import type {
  NormalizedRisingSignWindowResult,
  RisingSignModeComparisonFixture,
  RisingSignWindowsFixture,
} from '../utils/fixtureTypes.js';
import type { ValidationReport } from '../utils/report.js';

function getOffsetSuffix(timestamp: string): string {
  return timestamp.slice(-6);
}

export function compareRisingSignWindows(
  fixture: RisingSignWindowsFixture,
  actual: NormalizedRisingSignWindowResult,
  repeated: NormalizedRisingSignWindowResult,
  report: ValidationReport
): void {
  const dayStartUtc = localToUTC(
    {
      year: Number(fixture.input.date.slice(0, 4)),
      month: Number(fixture.input.date.slice(5, 7)),
      day: Number(fixture.input.date.slice(8, 10)),
      hour: 0,
      minute: 0,
      second: 0,
    },
    fixture.input.timezone
  );
  const dayEndUtc = addLocalDays(
    {
      year: Number(fixture.input.date.slice(0, 4)),
      month: Number(fixture.input.date.slice(5, 7)),
      day: Number(fixture.input.date.slice(8, 10)),
      hour: 0,
      minute: 0,
      second: 0,
    },
    fixture.input.timezone,
    1
  );
  const expectedStart = formatLocalTimestampWithOffset(dayStartUtc, fixture.input.timezone);
  const expectedEnd = formatLocalTimestampWithOffset(dayEndUtc, fixture.input.timezone);

  if (JSON.stringify(actual) !== JSON.stringify(repeated)) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'rising-sign-windows',
      expected: actual,
      actual: repeated,
      delta: null,
      tolerance: 'exact repeatability',
      message: 'Rising-sign windows are not deterministic across repeated calls',
    });
  }

  if (actual.windows.length < (fixture.minWindows ?? 1)) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'rising-sign-windows',
      expected: `>= ${fixture.minWindows ?? 1}`,
      actual: actual.windows.length,
      delta: null,
      tolerance: 'exact',
      message: 'Window count below expected minimum',
      details: actual,
    });
  }

  if (actual.windows[0]?.start !== expectedStart) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'rising-sign-windows',
      expected: expectedStart,
      actual: actual.windows[0]?.start,
      delta: null,
      tolerance: 'exact',
      message: 'First window does not start at local midnight',
      details: actual,
    });
  }

  if (actual.windows.at(-1)?.end !== expectedEnd) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'rising-sign-windows',
      expected: expectedEnd,
      actual: actual.windows.at(-1)?.end,
      delta: null,
      tolerance: 'exact',
      message: 'Last window does not end at the next local midnight',
      details: actual,
    });
  }

  const offsets = new Set<string>();

  for (const [index, window] of actual.windows.entries()) {
    offsets.add(getOffsetSuffix(window.start));
    offsets.add(getOffsetSuffix(window.end));

    if (!Number.isFinite(window.durationMs)) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'rising-sign-windows',
        expected: 'finite number',
        actual: window.durationMs,
        delta: null,
        tolerance: 'exact',
        message: `Window ${index + 1} is missing a valid durationMs`,
        details: window,
      });
      continue;
    }

    if (window.durationMs <= 0) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'rising-sign-windows',
        expected: '> 0',
        actual: window.durationMs,
        delta: null,
        tolerance: 'exact',
        message: `Window ${index + 1} has non-positive durationMs`,
        details: window,
      });
    }

    const startMs = new Date(window.start).getTime();
    const endMs = new Date(window.end).getTime();
    if (endMs <= startMs) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'rising-sign-windows',
        expected: 'end > start',
        actual: { start: window.start, end: window.end },
        delta: endMs - startMs,
        tolerance: '> 0',
        message: `Window ${index + 1} does not move forward in time`,
        details: window,
      });
    }

    if (index > 0 && actual.windows[index - 1].end !== window.start) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'rising-sign-windows',
        expected: actual.windows[index - 1].end,
        actual: window.start,
        delta: null,
        tolerance: 'exact adjacency',
        message: `Window ${index} and ${index + 1} are not contiguous`,
        details: {
          previous: actual.windows[index - 1],
          current: window,
        },
      });
    }
  }

  const firstStartMs = new Date(actual.windows[0]?.start ?? expectedStart).getTime();
  const lastEndMs = new Date(actual.windows.at(-1)?.end ?? expectedEnd).getTime();
  const totalCoverageMinutes = Math.round((lastEndMs - firstStartMs) / 60000);

  if (totalCoverageMinutes !== fixture.expectedTotalDurationMinutes) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'rising-sign-windows',
      expected: fixture.expectedTotalDurationMinutes,
      actual: totalCoverageMinutes,
      delta: totalCoverageMinutes - fixture.expectedTotalDurationMinutes,
      tolerance: 'exact total minutes',
      message: 'Window boundary timestamps do not cover the intended local day',
      details: actual,
    });
  }

  if (fixture.expectOffsetChange && offsets.size < 2) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'rising-sign-windows',
      expected: 'multiple UTC offsets across the local day',
      actual: Array.from(offsets),
      delta: null,
      tolerance: '>= 2 offsets',
      message: 'DST-transition day did not serialize an offset change',
      details: actual,
    });
  }
}

export function compareRisingSignModePrecision(
  fixture: RisingSignModeComparisonFixture,
  approximate: NormalizedRisingSignWindowResult,
  exact: NormalizedRisingSignWindowResult,
  adapter: InternalValidationAdapter,
  report: ValidationReport
): void {
  const approximateSigns = approximate.windows.map((window) => window.sign);
  const exactSigns = exact.windows.map((window) => window.sign);

  if (approximate.windows.length !== exact.windows.length) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'rising-sign-windows',
      expected: approximate.windows.length,
      actual: exact.windows.length,
      delta: exact.windows.length - approximate.windows.length,
      tolerance: 'exact',
      message: 'Exact mode changed the number of sign windows',
      details: { approximate, exact },
    });
    return;
  }

  if (JSON.stringify(approximateSigns) !== JSON.stringify(exactSigns)) {
    report.addHard({
      fixture: fixture.name,
      subsystem: 'rising-sign-windows',
      expected: approximateSigns,
      actual: exactSigns,
      delta: null,
      tolerance: 'exact',
      message: 'Exact mode changed the sign sequence for the same day',
      details: { approximate, exact },
    });
    return;
  }

  for (let index = 0; index < approximate.windows.length - 1; index++) {
    const approximateBoundaryMs = new Date(approximate.windows[index].end).getTime();
    const exactBoundaryMs = new Date(exact.windows[index].end).getTime();
    const leftSign = approximate.windows[index].sign;
    const rightSign = approximate.windows[index + 1].sign;
    const searchStartMs = Math.min(approximateBoundaryMs, exactBoundaryMs) - 60 * 60 * 1000;
    const searchEndMs = Math.max(approximateBoundaryMs, exactBoundaryMs) + 60 * 60 * 1000;

    let actualTransitionMs: number | null = null;
    for (let probeMs = searchStartMs; probeMs <= searchEndMs; probeMs += 60 * 1000) {
      const currentSign = adapter.getAscendantSignAt(
        new Date(probeMs).toISOString(),
        fixture.baseInput.latitude,
        fixture.baseInput.longitude
      );
      if (currentSign !== leftSign) {
        actualTransitionMs = probeMs;
        break;
      }
    }

    if (actualTransitionMs === null) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'rising-sign-windows',
        expected: rightSign,
        actual: 'no transition found in search window',
        delta: null,
        tolerance: 'transition must exist',
        message: 'Unable to locate a real sign transition near the reported boundary',
        details: {
          leftSign,
          rightSign,
          approximateBoundary: approximate.windows[index].end,
          exactBoundary: exact.windows[index].end,
        },
      });
      continue;
    }

    const approxErrorMs = Math.abs(approximateBoundaryMs - actualTransitionMs);
    const exactErrorMs = Math.abs(exactBoundaryMs - actualTransitionMs);
    if (exactErrorMs > approxErrorMs) {
      report.addHard({
        fixture: fixture.name,
        subsystem: 'rising-sign-windows',
        expected: `exact <= approximate (${approxErrorMs}ms)`,
        actual: `${exactErrorMs}ms`,
        delta: exactErrorMs - approxErrorMs,
        tolerance: 'exact must be at least as precise',
        message: 'Exact mode boundary was less precise than approximate mode',
        details: {
          actualTransitionIsoUtc: new Date(actualTransitionMs).toISOString(),
          approximateBoundary: approximate.windows[index].end,
          exactBoundary: exact.windows[index].end,
        },
      });
    }
  }
}
