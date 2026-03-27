import { describe, it, expect } from 'vitest';
import { TimeFormatter } from '../../src/formatter.js';

describe('When formatting astrological data for display', () => {
  describe('Given a date to format in timezone', () => {
    it('should format date with time in readable format', () => {
      const date = new Date('2024-03-20T12:00:00Z');
      const formatted = TimeFormatter.formatInTimezone(date, 'America/New_York');
      
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted).toContain('Mar');
      expect(formatted).toContain('20');
      expect(formatted).toContain('2024');
    });

    it('should format date only without time', () => {
      const date = new Date('2024-03-20T15:30:00Z');
      const formatted = TimeFormatter.formatDateOnly(date, 'America/New_York');
      
      expect(formatted).toBeDefined();
      expect(formatted).toContain('Mar');
      expect(formatted).toContain('20');
      expect(formatted).toContain('2024');
    });

    it('should handle Brisbane timezone', () => {
      const date = new Date('2024-03-20T12:00:00Z');
      const formatted = TimeFormatter.formatInTimezone(date, 'Australia/Brisbane');
      
      expect(formatted).toBeDefined();
      expect(formatted).toContain('2024');
    });

    it('should include timezone abbreviation', () => {
      const date = new Date('2024-03-20T12:00:00Z');
      const formatted = TimeFormatter.formatInTimezone(date, 'America/New_York');
      
      // Should include timezone like EDT or EST
      expect(formatted).toMatch(/[A-Z]{3,4}/);
    });
  });

  describe('When formatting dates in different timezones', () => {
    it('should show different times for different timezones', () => {
      const date = new Date('2024-03-20T12:00:00Z');
      const nyTime = TimeFormatter.formatInTimezone(date, 'America/New_York');
      const laTime = TimeFormatter.formatInTimezone(date, 'America/Los_Angeles');
      
      // NY and LA should show different times for the same UTC moment
      expect(nyTime).not.toBe(laTime);
    });

    it('should handle UTC timezone', () => {
      const date = new Date('2024-03-20T12:00:00Z');
      const formatted = TimeFormatter.formatInTimezone(date, 'UTC');
      
      expect(formatted).toBeDefined();
      expect(formatted).toContain('12');
    });
  });
});
