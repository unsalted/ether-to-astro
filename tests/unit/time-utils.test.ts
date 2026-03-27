import { describe, it, expect } from 'vitest';
import { localToUTC, utcToLocal, isValidTimezone, getTimezoneOffset } from '../../src/time-utils.js';
import type { LocalDateTime } from '../../src/time-utils.js';

describe('Time conversion utility', () => {
  describe('localToUTC', () => {
    it('should convert EDT to UTC correctly', () => {
      // Oct 17 1977, 1:06 PM EDT = Oct 17 1977, 5:06 PM UTC
      // EDT is UTC-4
      const local: LocalDateTime = {
        year: 1977,
        month: 10,
        day: 17,
        hour: 13,
        minute: 6,
      };

      const utc = localToUTC(local, 'America/New_York');

      expect(utc.getUTCFullYear()).toBe(1977);
      expect(utc.getUTCMonth()).toBe(9); // October = 9 (0-indexed)
      expect(utc.getUTCDate()).toBe(17);
      expect(utc.getUTCHours()).toBe(17); // 1:06 PM + 4 hours = 5:06 PM
      expect(utc.getUTCMinutes()).toBe(6);
    });

    it('should handle DST transitions correctly', () => {
      // Test date in EDT (summer) - UTC-4
      const summer: LocalDateTime = {
        year: 2024,
        month: 7,
        day: 15,
        hour: 12,
        minute: 0,
      };
      const summerUTC = localToUTC(summer, 'America/New_York');
      expect(summerUTC.getUTCHours()).toBe(16); // EDT = UTC-4

      // Test date in EST (winter) - UTC-5
      const winter: LocalDateTime = {
        year: 2024,
        month: 1,
        day: 15,
        hour: 12,
        minute: 0,
      };
      const winterUTC = localToUTC(winter, 'America/New_York');
      expect(winterUTC.getUTCHours()).toBe(17); // EST = UTC-5
    });

    it('should handle multiple timezones', () => {
      const local: LocalDateTime = {
        year: 2024,
        month: 3,
        day: 15,
        hour: 14,
        minute: 30,
      };

      const utcNY = localToUTC(local, 'America/New_York');
      const utcLA = localToUTC(local, 'America/Los_Angeles');
      const utcSydney = localToUTC(local, 'Australia/Sydney');

      // LA is 3 hours behind NY
      expect(utcLA.getTime() - utcNY.getTime()).toBe(3 * 60 * 60 * 1000);

      // Sydney is ahead of UTC
      expect(utcSydney.getUTCHours()).toBeLessThan(local.hour);
    });

    it('should handle midnight correctly', () => {
      const local: LocalDateTime = {
        year: 2024,
        month: 3,
        day: 15,
        hour: 0,
        minute: 0,
      };

      const utc = localToUTC(local, 'America/New_York');

      // Midnight EDT (March 15 is after DST starts) = 4 AM UTC
      expect(utc.getUTCHours()).toBe(4);
    });

    it('should handle date rollover when converting to UTC', () => {
      // 11 PM PDT should become next day in UTC
      const local: LocalDateTime = {
        year: 2024,
        month: 3,
        day: 15,
        hour: 23,
        minute: 0,
      };

      const utc = localToUTC(local, 'America/Los_Angeles');

      // 11 PM PDT (March 15 is after DST) = 6 AM UTC next day
      expect(utc.getUTCDate()).toBe(16);
      expect(utc.getUTCHours()).toBe(6);
    });
  });

  describe('utcToLocal', () => {
    it('should convert UTC to local time correctly', () => {
      const utc = new Date(Date.UTC(1977, 9, 17, 17, 6));

      const local = utcToLocal(utc, 'America/New_York');

      expect(local.year).toBe(1977);
      expect(local.month).toBe(10);
      expect(local.day).toBe(17);
      expect(local.hour).toBe(13); // 5:06 PM UTC - 4 hours = 1:06 PM EDT
      expect(local.minute).toBe(6);
    });

    it('should handle DST in reverse', () => {
      // Summer: UTC to EDT
      const summerUTC = new Date(Date.UTC(2024, 6, 15, 16, 0));
      const summerLocal = utcToLocal(summerUTC, 'America/New_York');
      expect(summerLocal.hour).toBe(12); // 4 PM UTC - 4 hours = 12 PM EDT

      // Winter: UTC to EST
      const winterUTC = new Date(Date.UTC(2024, 0, 15, 17, 0));
      const winterLocal = utcToLocal(winterUTC, 'America/New_York');
      expect(winterLocal.hour).toBe(12); // 5 PM UTC - 5 hours = 12 PM EST
    });
  });

  describe('isValidTimezone', () => {
    it('should validate correct timezone strings', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('America/Los_Angeles')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Australia/Sydney')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('EST')).toBe(true);
      expect(isValidTimezone('GMT')).toBe(true);
    });

    it('should reject invalid timezone strings', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(isValidTimezone('NotAZone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });
  });

  describe('getTimezoneOffset', () => {
    it('should return correct offset for EDT', () => {
      const date = new Date(Date.UTC(1977, 9, 17, 17, 6));
      const offset = getTimezoneOffset(date, 'America/New_York');

      // EDT is UTC-4, so offset should be -240 minutes
      expect(offset).toBe(-240);
    });

    it('should return correct offset for EST', () => {
      const date = new Date(Date.UTC(2024, 0, 15, 12, 0));
      const offset = getTimezoneOffset(date, 'America/New_York');

      // EST is UTC-5, so offset should be -300 minutes
      expect(offset).toBe(-300);
    });

    it('should handle positive offsets', () => {
      const date = new Date(Date.UTC(2024, 6, 15, 12, 0));
      const offset = getTimezoneOffset(date, 'Australia/Sydney');

      // AEST is UTC+10, so offset should be 600 minutes
      expect(offset).toBe(600);
    });
  });
});
