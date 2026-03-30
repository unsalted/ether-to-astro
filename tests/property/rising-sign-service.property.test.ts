import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addLocalDays,
  formatLocalTimestampWithOffset,
  localToUTC,
} from '../../src/time-utils.js';
import type { GetRisingSignWindowsInput } from '../../src/astro-service/service-types.js';
import type { InternalValidationAdapter } from '../validation/adapters/internal.js';
import type { NormalizedRisingSignWindowResult } from '../validation/utils/fixtureTypes.js';
import {
  dateOnlyArb,
  longitudeArb,
  nonPolarLatitudeArb,
  timezoneArb,
} from './helpers/arbitraries.js';
import { propertyConfig } from './helpers/config.js';
import { getInternalValidationAdapter } from './helpers/runtime.js';

const DST_FIXTURES: Array<Omit<GetRisingSignWindowsInput, 'mode'>> = [
  {
    date: '2024-03-10',
    latitude: 34.0522,
    longitude: -118.2437,
    timezone: 'America/Los_Angeles',
  },
  {
    date: '2024-11-03',
    latitude: 34.0522,
    longitude: -118.2437,
    timezone: 'America/Los_Angeles',
  },
  {
    date: '2024-03-31',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
  },
] as const;

function assertFullDayCoverage(
  result: NormalizedRisingSignWindowResult,
  input: Pick<GetRisingSignWindowsInput, 'date' | 'timezone'>
): void {
  expect(result.windows.length).toBeGreaterThan(0);

  const [firstWindow] = result.windows;
  const lastWindow = result.windows[result.windows.length - 1];
  const expectedStart = formatLocalTimestampWithOffset(
    localToUTC(
      {
        year: Number.parseInt(input.date.slice(0, 4), 10),
        month: Number.parseInt(input.date.slice(5, 7), 10),
        day: Number.parseInt(input.date.slice(8, 10), 10),
        hour: 0,
        minute: 0,
        second: 0,
      },
      input.timezone
    ),
    input.timezone
  );
  const expectedEnd = formatLocalTimestampWithOffset(
    addLocalDays(
      {
        year: Number.parseInt(input.date.slice(0, 4), 10),
        month: Number.parseInt(input.date.slice(5, 7), 10),
        day: Number.parseInt(input.date.slice(8, 10), 10),
        hour: 0,
        minute: 0,
        second: 0,
      },
      input.timezone,
      1
    ),
    input.timezone
  );

  expect(firstWindow.start).toBe(expectedStart);
  expect(lastWindow.end).toBe(expectedEnd);

  for (const [index, window] of result.windows.entries()) {
    const startMs = new Date(window.start).getTime();
    const endMs = new Date(window.end).getTime();

    expect(window.start).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(window.end).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(endMs).toBeGreaterThan(startMs);
    expect(window.durationMs).toBe(endMs - startMs);

    if (index > 0) {
      expect(window.start).toBe(result.windows[index - 1].end);
    }
  }
}

function estimateBoundaryErrorMs(
  adapter: InternalValidationAdapter,
  boundaryUtc: Date,
  latitude: number,
  longitude: number,
  fromSign: string,
  toSign: string
): number {
  const searchRadiusMs = 2 * 60 * 60 * 1000;
  const stepMs = 60 * 1000;
  let previousTime = new Date(boundaryUtc.getTime() - searchRadiusMs);
  let previousSign = adapter.getAscendantSignAt(previousTime.toISOString(), latitude, longitude);

  for (
    let currentMs = previousTime.getTime() + stepMs;
    currentMs <= boundaryUtc.getTime() + searchRadiusMs;
    currentMs += stepMs
  ) {
    const currentTime = new Date(currentMs);
    const currentSign = adapter.getAscendantSignAt(currentTime.toISOString(), latitude, longitude);

    if (previousSign === fromSign && currentSign === toSign) {
      return Math.abs(boundaryUtc.getTime() - currentMs);
    }

    previousTime = currentTime;
    previousSign = currentSign;
  }

  throw new Error(`Unable to bracket rising-sign transition near ${boundaryUtc.toISOString()}.`);
}

function collapseConsecutiveWindows(result: NormalizedRisingSignWindowResult) {
  const collapsed: NormalizedRisingSignWindowResult['windows'] = [];

  for (const window of result.windows) {
    const previous = collapsed[collapsed.length - 1];
    if (!previous || previous.sign !== window.sign) {
      collapsed.push({ ...window });
      continue;
    }

    previous.end = window.end;
    previous.durationMs += window.durationMs;
  }

  return collapsed;
}

function findSubsequenceIndices(sequence: string[], candidateSubsequence: string[]): number[] | null {
  const indices: number[] = [];
  let cursor = 0;

  for (const sign of candidateSubsequence) {
    while (cursor < sequence.length && sequence[cursor] !== sign) {
      cursor += 1;
    }

    if (cursor >= sequence.length) {
      return null;
    }

    indices.push(cursor);
    cursor += 1;
  }

  return indices;
}

describe('Property: rising-sign service', () => {
  let adapter: InternalValidationAdapter;

  beforeAll(async () => {
    adapter = await getInternalValidationAdapter();
  });

  it('covers a full local day with contiguous exact-mode windows', async () => {
    const exactInputArb = fc.record({
      date: dateOnlyArb,
      latitude: nonPolarLatitudeArb,
      longitude: longitudeArb,
      timezone: timezoneArb,
    });

    await fc.assert(
      fc.property(exactInputArb, (baseInput) => {
        const input: GetRisingSignWindowsInput = { ...baseInput, mode: 'exact' };
        const first = adapter.getRisingSignWindows(input);
        const second = adapter.getRisingSignWindows(input);

        expect(second).toEqual(first);
        assertFullDayCoverage(first, input);
      }),
      propertyConfig({ heavy: true })
    );
  });

  it('keeps exact-mode boundaries at least as precise as approximate mode', async () => {
    const comparisonInputArb = fc.record({
      date: dateOnlyArb,
      latitude: nonPolarLatitudeArb,
      longitude: longitudeArb,
      timezone: timezoneArb,
    });

    await fc.assert(
      fc.property(comparisonInputArb, (baseInput) => {
        const approximate = adapter.getRisingSignWindows({ ...baseInput, mode: 'approximate' });
        const exact = adapter.getRisingSignWindows({ ...baseInput, mode: 'exact' });
        const collapsedApproximate = collapseConsecutiveWindows(approximate);
        const collapsedExact = collapseConsecutiveWindows(exact);
        const exactSigns = collapsedExact.map((window) => window.sign);
        const approximateSigns = collapsedApproximate.map((window) => window.sign);
        const matchingIndices = findSubsequenceIndices(exactSigns, approximateSigns);

        expect(matchingIndices).not.toBeNull();

        for (let index = 0; index < collapsedApproximate.length - 1; index += 1) {
          const exactFromIndex = matchingIndices![index];
          const exactToIndex = matchingIndices![index + 1];
          if (exactToIndex !== exactFromIndex + 1) {
            continue;
          }

          const fromSign = collapsedApproximate[index].sign;
          const toSign = collapsedApproximate[index + 1].sign;
          const exactBoundary = new Date(collapsedExact[exactFromIndex].end);
          const approximateBoundary = new Date(collapsedApproximate[index].end);

          const exactError = estimateBoundaryErrorMs(
            adapter,
            exactBoundary,
            baseInput.latitude,
            baseInput.longitude,
            fromSign,
            toSign
          );
          const approximateError = estimateBoundaryErrorMs(
            adapter,
            approximateBoundary,
            baseInput.latitude,
            baseInput.longitude,
            fromSign,
            toSign
          );

          expect(exactError).toBeLessThanOrEqual(approximateError + 60_000);
        }
      }),
      propertyConfig({ heavy: true })
    );
  });

  it('keeps DST-transition days contiguous and fully covered', async () => {
    await fc.assert(
      fc.property(fc.constantFrom(...DST_FIXTURES), (baseInput) => {
        const result = adapter.getRisingSignWindows({ ...baseInput, mode: 'exact' });
        assertFullDayCoverage(result, baseInput);

        const offsets = new Set(
          result.windows.flatMap((window) => [window.start.slice(-6), window.end.slice(-6)])
        );
        expect(offsets.size).toBeGreaterThanOrEqual(2);
      }),
      propertyConfig({ heavy: true })
    );
  });
});
