import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  formatLocalTimestampWithOffset,
  getTimezoneOffset,
  localToUTC,
  utcToLocal,
} from '../../src/time-utils.js';
import { propertyConfig } from './helpers/config.js';
import {
  NON_HOUR_OFFSET_TIMEZONES,
  timezoneArb,
  utcDateArb,
  validLocalDateTimeArb,
  nonHourLocalDateTimeArb,
} from './helpers/arbitraries.js';

const DST_REJECT_FIXTURES = [
  {
    timezone: 'America/Los_Angeles',
    local: { year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 },
  },
  {
    timezone: 'America/New_York',
    local: { year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 },
  },
  {
    timezone: 'America/Los_Angeles',
    local: { year: 2024, month: 11, day: 3, hour: 1, minute: 30, second: 0 },
  },
  {
    timezone: 'America/New_York',
    local: { year: 2024, month: 11, day: 3, hour: 1, minute: 30, second: 0 },
  },
] as const;

function formatExpectedOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
  const minutes = String(absoluteOffset % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

describe('Property: time utils', () => {
  it('round-trips valid local datetimes through UTC for representative zones', async () => {
    await fc.assert(
      fc.property(validLocalDateTimeArb, ({ timezone, local }) => {
        const utc = localToUTC(local, timezone, 'reject');
        expect(utcToLocal(utc, timezone)).toEqual(local);
      }),
      propertyConfig()
    );
  });

  it('keeps formatted offsets aligned with getTimezoneOffset()', async () => {
    await fc.assert(
      fc.property(utcDateArb, timezoneArb, (instant, timezone) => {
        const offsetMinutes = getTimezoneOffset(instant, timezone);
        expect(Number.isInteger(offsetMinutes)).toBe(true);

        const formatted = formatLocalTimestampWithOffset(instant, timezone);
        expect(formatted.slice(-6)).toBe(formatExpectedOffset(offsetMinutes));
      }),
      propertyConfig()
    );
  });

  it('preserves non-hour offset zones through round-trip conversion', async () => {
    await fc.assert(
      fc.property(nonHourLocalDateTimeArb, ({ timezone, local }) => {
        expect(NON_HOUR_OFFSET_TIMEZONES).toContain(timezone);

        const utc = localToUTC(local, timezone, 'reject');
        expect(utcToLocal(utc, timezone)).toEqual(local);
        expect(getTimezoneOffset(utc, timezone) % 60).not.toBe(0);
      }),
      propertyConfig()
    );
  });

  it('rejects curated ambiguous and nonexistent DST-edge local times', async () => {
    await fc.assert(
      fc.property(fc.constantFrom(...DST_REJECT_FIXTURES), ({ timezone, local }) => {
        expect(() => localToUTC(local, timezone, 'reject')).toThrow(RangeError);
      }),
      propertyConfig()
    );
  });
});

