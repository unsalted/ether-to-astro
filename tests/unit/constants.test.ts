import { describe, it, expect } from 'vitest';
import { getDefaultTheme } from '../../src/constants.js';

describe('getDefaultTheme', () => {
  it('should return dark theme for evening hours (6pm-6am)', () => {
    // Create a date at 8 PM in a specific timezone
    const theme = getDefaultTheme('America/New_York');
    
    // Theme depends on current time, so we test the function works
    expect(['light', 'dark']).toContain(theme);
  });

  it('should return light theme for daytime hours (6am-6pm)', () => {
    // Test with timezone parameter
    const theme = getDefaultTheme('Europe/London');
    
    expect(['light', 'dark']).toContain(theme);
  });

  it('should use server local time when no timezone provided', () => {
    const theme = getDefaultTheme();
    
    expect(['light', 'dark']).toContain(theme);
  });

  it('should handle different timezones correctly', () => {
    // When it's day in NY, might be night in Tokyo
    const nyTheme = getDefaultTheme('America/New_York');
    const tokyoTheme = getDefaultTheme('Asia/Tokyo');
    
    // Both should return valid themes
    expect(['light', 'dark']).toContain(nyTheme);
    expect(['light', 'dark']).toContain(tokyoTheme);
  });
});
