/**
 * Comprehensive tests for Temporal-based time-utils
 * 
 * Covers:
 * - Timezone validity
 * - Normal UTC <-> local round-trip
 * - DST spring-forward gap (nonexistent times)
 * - DST fall-back overlap (ambiguous times)
 * - Non-hour offsets (Asia/Kolkata, Asia/Kathmandu)
 * - Offset sign convention and correctness
 * - Midnight handling
 */

import { describe, it, expect } from 'vitest';
import {
  localToUTC,
  utcToLocal,
  isValidTimezone,
  getTimezoneOffset,
  type LocalDateTime,
} from '../../src/time-utils.js';

describe('Time utils with Temporal', () => {
  describe('Timezone validity', () => {
    it('should accept valid IANA timezone', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('should reject invalid timezone', () => {
      expect(isValidTimezone('Invalid/Garbage')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('NotAZone')).toBe(false);
      expect(isValidTimezone('123456')).toBe(false);
    });
  });

  describe('Normal conversion round-trip', () => {
    it('should round-trip UTC <-> local for normal date', () => {
      const local: LocalDateTime = {
        year: 2024,
        month: 6,
        day: 15,
        hour: 14,
        minute: 30,
        second: 0,
      };

      const utc = localToUTC(local, 'America/Los_Angeles');
      const roundTrip = utcToLocal(utc, 'America/Los_Angeles');

      expect(roundTrip.year).toBe(local.year);
      expect(roundTrip.month).toBe(local.month);
      expect(roundTrip.day).toBe(local.day);
      expect(roundTrip.hour).toBe(local.hour);
      expect(roundTrip.minute).toBe(local.minute);
    });

    it('should convert UTC to local correctly', () => {
      // 2024-06-15 21:30 UTC = 2024-06-15 14:30 PDT (UTC-7)
      const utc = new Date('2024-06-15T21:30:00Z');
      const local = utcToLocal(utc, 'America/Los_Angeles');

      expect(local.year).toBe(2024);
      expect(local.month).toBe(6);
      expect(local.day).toBe(15);
      expect(local.hour).toBe(14);
      expect(local.minute).toBe(30);
    });
  });

  describe('DST spring-forward gap (nonexistent times)', () => {
    it('should handle nonexistent time in America/New_York with compatible', () => {
      // March 10, 2024, 2:30 AM doesn't exist (clock jumps 2:00 -> 3:00)
      const nonexistent: LocalDateTime = {
        year: 2024,
        month: 3,
        day: 10,
        hour: 2,
        minute: 30,
        second: 0,
      };

      // 'compatible' should shift forward
      const utc = localToUTC(nonexistent, 'America/New_York', 'compatible');
      expect(utc).toBeDefined();

      // Verify it shifted to 3:30 AM EDT (which is 7:30 UTC)
      const local = utcToLocal(utc, 'America/New_York');
      expect(local.hour).toBe(3); // Shifted forward
      expect(local.minute).toBe(30);
    });

    it('should reject nonexistent time with reject disambiguation', () => {
      const nonexistent: LocalDateTime = {
        year: 2024,
        month: 3,
        day: 10,
        hour: 2,
        minute: 30,
        second: 0,
      };

      expect(() => {
        localToUTC(nonexistent, 'America/New_York', 'reject');
      }).toThrow();
    });
  });

  describe('DST fall-back overlap (ambiguous times)', () => {
    it('should handle ambiguous time in America/New_York with compatible', () => {
      // November 3, 2024, 1:30 AM happens twice (clock falls back 2:00 -> 1:00)
      const ambiguous: LocalDateTime = {
        year: 2024,
        month: 11,
        day: 3,
        hour: 1,
        minute: 30,
        second: 0,
      };

      // 'compatible' should pick the earlier occurrence (EDT, before fall-back)
      const utc = localToUTC(ambiguous, 'America/New_York', 'compatible');
      expect(utc).toBeDefined();

      // The earlier 1:30 AM EDT is 5:30 UTC
      // The later 1:30 AM EST is 6:30 UTC
      // 'compatible' picks earlier, so should be 5:30 UTC
      expect(utc.getUTCHours()).toBe(5);
      expect(utc.getUTCMinutes()).toBe(30);
    });

    it('should handle ambiguous time with earlier disambiguation', () => {
      const ambiguous: LocalDateTime = {
        year: 2024,
        month: 11,
        day: 3,
        hour: 1,
        minute: 30,
        second: 0,
      };

      const utc = localToUTC(ambiguous, 'America/New_York', 'earlier');
      expect(utc.getUTCHours()).toBe(5); // Earlier occurrence
    });

    it('should handle ambiguous time with later disambiguation', () => {
      const ambiguous: LocalDateTime = {
        year: 2024,
        month: 11,
        day: 3,
        hour: 1,
        minute: 30,
        second: 0,
      };

      const utc = localToUTC(ambiguous, 'America/New_York', 'later');
      expect(utc.getUTCHours()).toBe(6); // Later occurrence
    });

    it('should reject ambiguous time with reject disambiguation', () => {
      const ambiguous: LocalDateTime = {
        year: 2024,
        month: 11,
        day: 3,
        hour: 1,
        minute: 30,
        second: 0,
      };

      expect(() => {
        localToUTC(ambiguous, 'America/New_York', 'reject');
      }).toThrow();
    });
  });

  describe('Non-hour offsets', () => {
    it('should handle Asia/Kolkata (UTC+5:30)', () => {
      const local: LocalDateTime = {
        year: 2024,
        month: 6,
        day: 15,
        hour: 14,
        minute: 30,
        second: 0,
      };

      const utc = localToUTC(local, 'Asia/Kolkata');
      const roundTrip = utcToLocal(utc, 'Asia/Kolkata');

      expect(roundTrip.hour).toBe(local.hour);
      expect(roundTrip.minute).toBe(local.minute);

      // Verify offset is +330 minutes (5.5 hours)
      const offset = getTimezoneOffset(utc, 'Asia/Kolkata');
      expect(offset).toBe(330);
    });

    it('should handle Asia/Kathmandu (UTC+5:45)', () => {
      const local: LocalDateTime = {
        year: 2024,
        month: 6,
        day: 15,
        hour: 14,
        minute: 30,
        second: 0,
      };

      const utc = localToUTC(local, 'Asia/Kathmandu');
      const roundTrip = utcToLocal(utc, 'Asia/Kathmandu');

      expect(roundTrip.hour).toBe(local.hour);
      expect(roundTrip.minute).toBe(local.minute);

      // Verify offset is +345 minutes (5.75 hours)
      const offset = getTimezoneOffset(utc, 'Asia/Kathmandu');
      expect(offset).toBe(345);
    });
  });

  describe('Offset sign convention and correctness', () => {
    it('should return negative offset for America/Los_Angeles (west of UTC)', () => {
      // Winter (PST, UTC-8)
      const winterDate = new Date('2024-01-15T12:00:00Z');
      const winterOffset = getTimezoneOffset(winterDate, 'America/Los_Angeles');
      expect(winterOffset).toBe(-480); // -8 hours

      // Summer (PDT, UTC-7)
      const summerDate = new Date('2024-07-15T12:00:00Z');
      const summerOffset = getTimezoneOffset(summerDate, 'America/Los_Angeles');
      expect(summerOffset).toBe(-420); // -7 hours
    });

    it('should return positive offset for Asia/Tokyo (east of UTC)', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const offset = getTimezoneOffset(date, 'Asia/Tokyo');
      expect(offset).toBe(540); // +9 hours
    });

    it('should return zero offset for UTC', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const offset = getTimezoneOffset(date, 'UTC');
      expect(offset).toBe(0);
    });
  });

  describe('Midnight handling', () => {
    it('should handle midnight without 24:00 weirdness', () => {
      const midnight: LocalDateTime = {
        year: 2024,
        month: 6,
        day: 15,
        hour: 0,
        minute: 0,
        second: 0,
      };

      const utc = localToUTC(midnight, 'America/New_York');
      const roundTrip = utcToLocal(utc, 'America/New_York');

      expect(roundTrip.hour).toBe(0);
      expect(roundTrip.minute).toBe(0);
      expect(roundTrip.day).toBe(15);
    });

    it('should handle 23:59:59 without overflow', () => {
      const almostMidnight: LocalDateTime = {
        year: 2024,
        month: 6,
        day: 15,
        hour: 23,
        minute: 59,
        second: 59,
      };

      const utc = localToUTC(almostMidnight, 'America/New_York');
      const roundTrip = utcToLocal(utc, 'America/New_York');

      expect(roundTrip.hour).toBe(23);
      expect(roundTrip.minute).toBe(59);
      expect(roundTrip.second).toBe(59);
      expect(roundTrip.day).toBe(15);
    });
  });

  describe('Error handling', () => {
    it('should throw on invalid timezone in localToUTC', () => {
      const local: LocalDateTime = {
        year: 2024,
        month: 6,
        day: 15,
        hour: 12,
        minute: 0,
      };

      expect(() => {
        localToUTC(local, 'Invalid/Timezone');
      }).toThrow(/Invalid timezone/);
    });
  });
});
