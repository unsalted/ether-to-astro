export const FIXED_DATE_UTC = new Date('2024-03-26T12:00:00Z');

export const BOWEN_BIRTH_UTC = new Date(Date.UTC(1990, 10, 6, 1, 30));
export const USER_BIRTH_UTC = new Date(Date.UTC(1977, 9, 17, 17, 6));

export function dateUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}
