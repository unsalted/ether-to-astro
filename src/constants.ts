// Log levels
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;

export type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

// Error categories
export const ErrorCategory = {
  EPHEMERIS: 'EPHEMERIS',
  CALCULATION: 'CALCULATION',
  STORAGE: 'STORAGE',
  VALIDATION: 'VALIDATION',
  CHART_RENDERING: 'CHART_RENDERING',
  SERVER: 'SERVER',
} as const;

export type ErrorCategoryType = typeof ErrorCategory[keyof typeof ErrorCategory];
