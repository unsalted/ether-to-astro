import fc from 'fast-check';
import { utcToLocal } from '../../../src/time-utils.js';
import type { ElectionalHouseSystem, HouseSystem } from '../../../src/types.js';

export const REPRESENTATIVE_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Chatham',
] as const;

export const NON_HOUR_OFFSET_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Pacific/Chatham',
] as const;

export const SUPPORTED_HOUSE_SYSTEMS = [
  'P',
  'K',
  'W',
  'E',
  'O',
  'R',
  'C',
  'A',
  'V',
  'X',
  'H',
  'T',
  'B',
] as const satisfies readonly HouseSystem[];

export const ELECTIONAL_HOUSE_SYSTEMS = [
  'P',
  'K',
  'W',
  'R',
] as const satisfies readonly ElectionalHouseSystem[];

const MIN_UTC_DATE = new Date('2000-01-01T00:00:00Z');
const MAX_UTC_DATE = new Date('2035-12-31T23:59:59Z');

export const timezoneArb = fc.constantFrom(...REPRESENTATIVE_TIMEZONES);
export const nonHourTimezoneArb = fc.constantFrom(...NON_HOUR_OFFSET_TIMEZONES);
export const utcDateArb = fc
  .date({ min: MIN_UTC_DATE, max: MAX_UTC_DATE })
  .filter((date) => Number.isFinite(date.getTime()));
export const dateOnlyArb = utcDateArb.map(formatDateOnly);
export const minuteArb = fc.integer({ min: 0, max: 59 });
export const secondArb = fc.integer({ min: 0, max: 59 });
export const nonPolarLatitudeArb = fc.double({
  min: -65,
  max: 65,
  noNaN: true,
  noDefaultInfinity: true,
});
export const polarLatitudeArb = fc.oneof(
  fc.double({ min: 66.1, max: 80, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -80, max: -66.1, noNaN: true, noDefaultInfinity: true })
);
export const longitudeArb = fc.double({
  min: -180,
  max: 180,
  noNaN: true,
  noDefaultInfinity: true,
});
export const houseSystemArb = fc.constantFrom(...SUPPORTED_HOUSE_SYSTEMS);
export const electionalHouseSystemArb = fc.constantFrom(...ELECTIONAL_HOUSE_SYSTEMS);

export const validLocalDateTimeArb = timezoneArb.chain((timezone) =>
  fc
    .record({
      date: utcDateArb,
      minute: minuteArb,
      second: secondArb,
    })
    .map(({ date, minute, second }) => {
      const localDate = utcToLocal(date, timezone);
      return {
        timezone,
        local: {
          year: localDate.year,
          month: localDate.month,
          day: localDate.day,
          hour: 12,
          minute,
          second,
        },
      };
    })
);

export const nonHourLocalDateTimeArb = nonHourTimezoneArb.chain((timezone) =>
  fc
    .record({
      date: utcDateArb,
      minute: minuteArb,
      second: secondArb,
    })
    .map(({ date, minute, second }) => {
      const localDate = utcToLocal(date, timezone);
      return {
        timezone,
        local: {
          year: localDate.year,
          month: localDate.month,
          day: localDate.day,
          hour: 12,
          minute,
          second,
        },
      };
    })
);

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
