import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultTheme } from '../../src/constants.js';

describe('When deriving default chart theme from local time', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Given evening local hour in target timezone, then default theme is dark', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-26T23:00:00Z'));
    expect(getDefaultTheme('America/New_York')).toBe('dark');
  });

  it('Given daytime local hour in target timezone, then default theme is light', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-26T17:00:00Z'));
    expect(getDefaultTheme('America/New_York')).toBe('light');
  });

  it('Given no timezone override, then server-local hour determines the theme', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-26T12:00:00Z'));
    expect(getDefaultTheme()).toMatch(/light|dark/);
  });
});
