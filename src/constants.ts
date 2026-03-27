// Log levels
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

// Error categories
export const ErrorCategory = {
  EPHEMERIS: 'EPHEMERIS',
  CALCULATION: 'CALCULATION',
  STORAGE: 'STORAGE',
  VALIDATION: 'VALIDATION',
  CHART_RENDERING: 'CHART_RENDERING',
  SERVER: 'SERVER',
} as const;

export type ErrorCategoryType = (typeof ErrorCategory)[keyof typeof ErrorCategory];

// Chart theme colors
export const LIGHT_THEME_COLORS = [
  '#ffffff', // Aries - White (fire)
  '#c1e6d1', // Taurus - Mint (earth)
  '#ffffff', // Gemini - White (air)
  '#c1e6d1', // Cancer - Mint (water)
  '#ffffff', // Leo - White (fire)
  '#c1e6d1', // Virgo - Mint (earth)
  '#ffffff', // Libra - White (air)
  '#c1e6d1', // Scorpio - Mint (water)
  '#ffffff', // Sagittarius - White (fire)
  '#c1e6d1', // Capricorn - Mint (earth)
  '#ffffff', // Aquarius - White (air)
  '#c1e6d1', // Pisces - Mint (water)
];

export const DARK_THEME_COLORS = [
  '#282c34', // Aries - Dark (fire)
  '#8545b0', // Taurus - Purple (earth)
  '#282c34', // Gemini - Dark (air)
  '#8545b0', // Cancer - Purple (water)
  '#282c34', // Leo - Dark (fire)
  '#8545b0', // Virgo - Purple (earth)
  '#282c34', // Libra - Dark (air)
  '#8545b0', // Scorpio - Purple (water)
  '#282c34', // Sagittarius - Dark (fire)
  '#8545b0', // Capricorn - Purple (earth)
  '#282c34', // Aquarius - Dark (air)
  '#8545b0', // Pisces - Purple (water)
];

// Aspect colors for light theme
export const LIGHT_ASPECT_COLORS = {
  conjunction: { degree: 0, orbit: 10, color: 'transparent' },
  square: { degree: 90, orbit: 8, color: '#fb923c' }, // Orange
  trine: { degree: 120, orbit: 8, color: '#34d399' }, // Emerald
  opposition: { degree: 180, orbit: 10, color: '#a78bfa' }, // Purple
  sextile: { degree: 60, orbit: 6, color: '#22d3ee' }, // Cyan
};

// Aspect colors for dark theme
export const DARK_ASPECT_COLORS = {
  conjunction: { degree: 0, orbit: 10, color: 'transparent' },
  square: { degree: 90, orbit: 8, color: '#f97316' }, // Orange
  trine: { degree: 120, orbit: 8, color: '#10b981' }, // Emerald
  opposition: { degree: 180, orbit: 10, color: '#8b5cf6' }, // Purple
  sextile: { degree: 60, orbit: 6, color: '#06b6d4' }, // Cyan
};

/**
 * Determine chart theme based on time of day
 * Dark theme: 6 PM - 6 AM (18:00 - 06:00)
 * Light theme: 6 AM - 6 PM (06:00 - 18:00)
 */
export function getDefaultTheme(): 'light' | 'dark' {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6 ? 'dark' : 'light';
}
