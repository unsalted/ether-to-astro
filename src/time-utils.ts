/**
 * Time conversion utilities for astrology calculations
 * 
 * Provides centralized time handling to ensure consistent conversion
 * between local time and UTC across the entire codebase.
 * 
 * DST Policy:
 * - Nonexistent times (spring-forward gap): Use 'compatible' by default,
 *   which shifts forward. Use 'reject' for birth times to surface ambiguity.
 * - Ambiguous times (fall-back overlap): Use 'compatible' by default,
 *   which prefers the earlier occurrence. Use 'reject' for birth times.
 * - Offset sign convention: Positive = east of UTC, Negative = west of UTC
 *   (e.g., America/Los_Angeles = -480 winter, -420 summer; Asia/Tokyo = 540)
 */

import { Temporal } from '@js-temporal/polyfill';

export interface LocalDateTime {
  year: number;
  month: number;  // 1-12 (not 0-indexed)
  day: number;
  hour: number;   // 0-23
  minute: number;
  second?: number;
}

export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

/**
 * Convert local time to UTC using timezone information
 * 
 * @param local - Local date/time components
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @param disambiguation - How to handle DST ambiguity ('compatible' default, 'reject' for birth times)
 * @returns UTC Date object
 * @throws Error if timezone is invalid or time is ambiguous/nonexistent with 'reject'
 */
export function localToUTC(
  local: LocalDateTime,
  timezone: string,
  disambiguation: Disambiguation = 'compatible'
): Date {
  // Validate timezone first
  if (!isValidTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  // Build Temporal.PlainDateTime from LocalDateTime
  const plainDateTime = Temporal.PlainDateTime.from({
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour,
    minute: local.minute,
    second: local.second ?? 0,
  });

  // Convert to ZonedDateTime in the target timezone
  const zonedDateTime = plainDateTime.toZonedDateTime(timezone, { disambiguation });

  // Return as Date
  return new Date(zonedDateTime.epochMilliseconds);
}

/**
 * Convert UTC time to local time in specified timezone
 * 
 * @param utc - UTC Date object
 * @param timezone - IANA timezone string
 * @returns Local date/time components
 */
export function utcToLocal(utc: Date, timezone: string): LocalDateTime {
  // Convert Date to Temporal.Instant
  const instant = Temporal.Instant.fromEpochMilliseconds(utc.getTime());

  // Convert to ZonedDateTime in target timezone
  const zonedDateTime = instant.toZonedDateTimeISO(timezone);

  // Return numeric components
  return {
    year: zonedDateTime.year,
    month: zonedDateTime.month,
    day: zonedDateTime.day,
    hour: zonedDateTime.hour,
    minute: zonedDateTime.minute,
    second: zonedDateTime.second,
  };
}

/**
 * Validate if a timezone string is valid
 * 
 * @param timezone - Timezone string to validate
 * @returns true if valid IANA timezone or UTC, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || timezone.length === 0) {
    return false;
  }

  try {
    // Validate by attempting to create a ZonedDateTime
    // This accepts any valid IANA timezone identifier
    const testDate = Temporal.PlainDateTime.from({ year: 2000, month: 1, day: 1, hour: 0, minute: 0 });
    testDate.toZonedDateTime(timezone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get timezone offset in minutes for a specific date
 * Handles DST transitions correctly
 * 
 * @param date - Date to get offset for
 * @param timezone - IANA timezone string
 * @returns Offset in minutes (positive = east of UTC, negative = west of UTC)
 *          Examples: America/Los_Angeles winter = -480, summer = -420; Asia/Tokyo = 540
 */
export function getTimezoneOffset(date: Date, timezone: string): number {
  // Convert Date to Temporal.Instant
  const instant = Temporal.Instant.fromEpochMilliseconds(date.getTime());

  // Convert to ZonedDateTime in target timezone
  const zonedDateTime = instant.toZonedDateTimeISO(timezone);

  // Get offset from the ZonedDateTime itself
  // offsetNanoseconds is positive for east, negative for west
  const offsetMinutes = zonedDateTime.offsetNanoseconds / (1000 * 1000 * 1000 * 60);

  return offsetMinutes;
}

/**
 * Add calendar days to a local date in a specific timezone
 * Properly handles month/year rollovers and DST transitions
 * 
 * @param local - Starting local date/time
 * @param timezone - IANA timezone string
 * @param days - Number of days to add (can be negative)
 * @returns UTC Date representing the new local date/time
 */
export function addLocalDays(local: LocalDateTime, timezone: string, days: number): Date {
  // Convert to Temporal for proper calendar math
  const plainDateTime = Temporal.PlainDateTime.from({
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour,
    minute: local.minute,
    second: local.second ?? 0,
  });

  // Add days using Temporal's calendar-aware addition
  const newPlainDateTime = plainDateTime.add({ days });

  // Convert back to UTC via the timezone
  const zonedDateTime = newPlainDateTime.toZonedDateTime(timezone);
  return new Date(zonedDateTime.epochMilliseconds);
}
