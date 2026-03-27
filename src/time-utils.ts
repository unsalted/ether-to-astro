/**
 * Time conversion utilities for astrology calculations
 * 
 * Provides centralized time handling to ensure consistent conversion
 * between local time and UTC across the entire codebase.
 */

export interface LocalDateTime {
  year: number;
  month: number;  // 1-12 (not 0-indexed)
  day: number;
  hour: number;   // 0-23
  minute: number;
  second?: number;
}

/**
 * Convert local time to UTC using timezone information
 * 
 * @param local - Local date/time components
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns UTC Date object
 */
export function localToUTC(local: LocalDateTime, timezone: string): Date {
  // Build a date string in ISO format
  const year = local.year;
  const month = String(local.month).padStart(2, '0');
  const day = String(local.day).padStart(2, '0');
  const hour = String(local.hour).padStart(2, '0');
  const minute = String(local.minute).padStart(2, '0');
  const second = String(local.second || 0).padStart(2, '0');
  
  const dateString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  
  // Parse as UTC first to get a baseline
  const utcDate = new Date(`${dateString}Z`);
  
  // Format this UTC date as it would appear in the target timezone
  const tzString = utcDate.toLocaleString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Parse the timezone string back to a Date (in local system time)
  const tzDate = new Date(tzString);
  
  // Calculate the offset: difference between UTC interpretation and TZ interpretation
  const offset = utcDate.getTime() - tzDate.getTime();
  
  // Apply the offset to get the correct UTC time
  // If we want "1:06 PM EDT" to become "5:06 PM UTC", we need to add the offset
  return new Date(utcDate.getTime() + offset);
}

/**
 * Convert UTC time to local time in specified timezone
 * 
 * @param utc - UTC Date object
 * @param timezone - IANA timezone string
 * @returns Local date/time components
 */
export function utcToLocal(utc: Date, timezone: string): LocalDateTime {
  // Use Intl.DateTimeFormat to get local time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(utc);
  const getValue = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };
  
  return {
    year: getValue('year'),
    month: getValue('month'),
    day: getValue('day'),
    hour: getValue('hour'),
    minute: getValue('minute'),
    second: getValue('second'),
  };
}

/**
 * Validate if a timezone string is valid
 * 
 * @param timezone - Timezone string to validate
 * @returns true if valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || timezone.length === 0) {
    return false;
  }
  
  // Reject timezone abbreviations (EST, GMT, PST, etc.)
  // Valid IANA timezones have format: Continent/City or UTC
  if (timezone !== 'UTC' && !timezone.includes('/')) {
    return false;
  }
  
  try {
    // Try to create a DateTimeFormat with this timezone
    // If it throws, the timezone is invalid
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
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
 * @returns Offset in minutes (negative for west of UTC, positive for east)
 */
export function getTimezoneOffset(date: Date, timezone: string): number {
  // Get UTC time
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const utcTime = utcDate.getTime();
  
  // Get local time in the specified timezone
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const tzTime = tzDate.getTime();
  
  // Offset is the difference in minutes
  // Positive offset means timezone is ahead of UTC (east)
  // Negative offset means timezone is behind UTC (west)
  return (tzTime - utcTime) / (1000 * 60);
}
