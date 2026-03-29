import { describe, expect, it } from 'vitest';
import { formatDateOnly, formatInTimezone } from '../../src/formatter.js';

describe('When formatting timestamps for users', () => {
  it('Given a timezone-aware timestamp, then output includes readable date and timezone abbreviation', () => {
    const date = new Date('2024-03-20T12:00:00Z');
    const formatted = formatInTimezone(date, 'America/New_York');
    expect(formatted).toContain('Mar');
    expect(formatted).toContain('2024');
    expect(formatted).toMatch(/\b(EDT|EST)\b/);
  });

  it('Given date-only formatting, then output excludes time and timezone suffixes', () => {
    const date = new Date('2024-03-20T15:30:00Z');
    const formatted = formatDateOnly(date, 'America/New_York');
    expect(formatted).toContain('Mar');
    expect(formatted).toContain('2024');
    expect(formatted).not.toMatch(/AM|PM|EDT|EST|UTC/);
  });

  it('Given the same UTC instant in different timezones, then local formatted strings differ', () => {
    const date = new Date('2024-03-20T12:00:00Z');
    const ny = formatInTimezone(date, 'America/New_York');
    const la = formatInTimezone(date, 'America/Los_Angeles');
    expect(ny).not.toBe(la);
    expect(ny).toMatch(/AM|PM/);
    expect(la).toMatch(/AM|PM/);
  });

  it('Given weekday formatting is requested, then output includes a weekday label', () => {
    const date = new Date('2024-03-20T12:00:00Z');
    const formatted = formatInTimezone(date, 'America/New_York', { weekday: true });
    expect(formatted).toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
  });
});
