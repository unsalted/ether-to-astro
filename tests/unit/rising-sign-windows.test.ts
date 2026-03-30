import { describe, expect, it } from 'vitest';
import { compareRisingSignModePrecision } from '../validation/compare/rising-sign-windows.js';
import type { InternalValidationAdapter } from '../validation/adapters/internal.js';
import type {
  NormalizedRisingSignWindowResult,
  RisingSignModeComparisonFixture,
} from '../validation/utils/fixtureTypes.js';
import { ValidationReport } from '../validation/utils/report.js';

describe('When comparing rising-sign window mode precision', () => {
  it('keeps checking exact precision when approximate skips intermediate exact signs', () => {
    const fixture: RisingSignModeComparisonFixture = {
      name: 'coarse approximate subsequence still checks exact boundary precision',
      baseInput: {
        date: '2026-03-28',
        latitude: -65,
        longitude: -180,
        timezone: 'America/New_York',
      },
    };
    const approximate: NormalizedRisingSignWindowResult = {
      date: fixture.baseInput.date,
      timezone: fixture.baseInput.timezone,
      mode: 'approximate',
      windows: [
        {
          sign: 'Cancer',
          start: '2026-03-28T00:00:00.000Z',
          end: '2026-03-28T02:00:00.000Z',
          durationMs: 2 * 60 * 60 * 1000,
        },
        {
          sign: 'Libra',
          start: '2026-03-28T02:00:00.000Z',
          end: '2026-03-28T06:00:00.000Z',
          durationMs: 4 * 60 * 60 * 1000,
        },
      ],
    };
    const exact: NormalizedRisingSignWindowResult = {
      date: fixture.baseInput.date,
      timezone: fixture.baseInput.timezone,
      mode: 'exact',
      windows: [
        {
          sign: 'Cancer',
          start: '2026-03-28T00:00:00.000Z',
          end: '2026-03-28T01:30:00.000Z',
          durationMs: 90 * 60 * 1000,
        },
        {
          sign: 'Leo',
          start: '2026-03-28T01:30:00.000Z',
          end: '2026-03-28T01:40:00.000Z',
          durationMs: 10 * 60 * 1000,
        },
        {
          sign: 'Virgo',
          start: '2026-03-28T01:40:00.000Z',
          end: '2026-03-28T01:50:00.000Z',
          durationMs: 10 * 60 * 1000,
        },
        {
          sign: 'Libra',
          start: '2026-03-28T01:50:00.000Z',
          end: '2026-03-28T06:00:00.000Z',
          durationMs: 250 * 60 * 1000,
        },
      ],
    };
    const adapter = {
      getAscendantSignAt(isoUtc: string): string {
        return isoUtc < '2026-03-28T01:55:00.000Z' ? 'Cancer' : 'Leo';
      },
    } as InternalValidationAdapter;
    const report = new ValidationReport();

    compareRisingSignModePrecision(fixture, approximate, exact, adapter, report);

    expect(report.hardFailures).toHaveLength(2);
    expect(report.hardFailures[0]?.message).toBe(
      'Exact mode inserted intermediate sign windows where approximate mode reported a single boundary'
    );
    expect(report.hardFailures[1]?.message).toBe(
      'Exact mode boundary was less precise than approximate mode'
    );
    expect(report.hardFailures[1]?.details).toMatchObject({
      actualTransitionIsoUtc: '2026-03-28T01:55:00.000Z',
      approximateBoundary: '2026-03-28T02:00:00.000Z',
      exactBoundary: '2026-03-28T01:30:00.000Z',
    });
  });
});
