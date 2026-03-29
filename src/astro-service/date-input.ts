import { Temporal } from '@js-temporal/polyfill';

/**
 * Parse a date-only input into local noon components.
 *
 * @remarks
 * The service treats date-only transit requests as local-noon lookups so the
 * requested calendar day remains stable across timezone conversions.
 */
export function parseDateOnlyInput(dateStr: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, got "${dateStr}"`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month} (must be 1-12)`);
  }
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day: ${day} (must be 1-31)`);
  }

  try {
    Temporal.PlainDate.from({ year, month, day });
  } catch {
    throw new Error(`Invalid calendar date: ${dateStr}`);
  }

  return { year, month, day, hour: 12, minute: 0 };
}
