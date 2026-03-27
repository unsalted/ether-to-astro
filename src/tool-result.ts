/**
 * Structured error handling for MCP tool results
 * 
 * Provides agent-recoverable error codes and suggestions for self-correction.
 * Distinguishes between recoverable domain errors and hard infrastructure failures.
 */

export type ToolIssueCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_PLANET'
  | 'NO_RISE_SET_EVENT'
  | 'CIRCUMPOLAR_OBJECT'
  | 'POLAR_LATITUDE_LIMIT'
  | 'EPHEMERIS_NOT_INITIALIZED'
  | 'EPHEMERIS_COMPUTE_FAILED'
  | 'TIMEZONE_ERROR'
  | 'MISSING_NATAL_CHART'
  | 'INVALID_DATE'
  | 'INVALID_HOUSE_SYSTEM';

export interface ToolIssue {
  code: ToolIssueCode;
  message: string;
  retryable: boolean;
  suggestedFix?: string;
  details?: Record<string, unknown>;
}

export type ToolResult<T> = {
  ok: true;
  data: T;
  warnings?: ToolIssue[];
} | {
  ok: false;
  error: ToolIssue;
};

/**
 * Create a successful tool result
 */
export function success<T>(data: T, warnings?: ToolIssue[]): ToolResult<T> {
  return warnings ? { ok: true, data, warnings } : { ok: true, data };
}

/**
 * Create a failed tool result
 */
export function failure(error: ToolIssue): ToolResult<never> {
  return { ok: false, error };
}

/**
 * Map Swiss Ephemeris errors to structured tool issues
 */
export function mapSweError(
  context: string,
  err: unknown,
  details?: Record<string, unknown>
): ToolIssue {
  const message = err instanceof Error ? err.message : String(err);

  if (/not initialized/i.test(message)) {
    return {
      code: 'EPHEMERIS_NOT_INITIALIZED',
      message: 'Swiss Ephemeris is not initialized.',
      retryable: false,
      suggestedFix: 'Initialize the ephemeris engine before requesting calculations.',
      details,
    };
  }

  return {
    code: 'EPHEMERIS_COMPUTE_FAILED',
    message: `Swiss Ephemeris failed during ${context}.`,
    retryable: false,
    suggestedFix: 'Check inputs and ephemeris configuration.',
    details: { ...details, rawMessage: message },
  };
}

/**
 * Create a structured error for missing rise/set events
 */
export function noRiseSetEvent(
  eventType: 'rise' | 'set' | 'upper_meridian' | 'lower_meridian',
  planet: string,
  details: Record<string, unknown>
): ToolIssue {
  return {
    code: 'NO_RISE_SET_EVENT',
    message: `No ${eventType} event for ${planet} at the specified date and location.`,
    retryable: true,
    suggestedFix: 'Try another date, location, or request a different event type. Object may be circumpolar.',
    details,
  };
}

/**
 * Create a structured error for circumpolar objects
 */
export function circumpolarObject(
  planet: string,
  latitude: number,
  details?: Record<string, unknown>
): ToolIssue {
  return {
    code: 'CIRCUMPOLAR_OBJECT',
    message: `${planet} is circumpolar at latitude ${latitude.toFixed(1)}° - it does not rise or set.`,
    retryable: true,
    suggestedFix: 'Request meridian transit times instead, or try a different location.',
    details: { planet, latitude, ...details },
  };
}

/**
 * Create a structured error for missing natal chart
 */
export function missingNatalChart(): ToolIssue {
  return {
    code: 'MISSING_NATAL_CHART',
    message: 'No natal chart found. Please set natal chart first.',
    retryable: true,
    suggestedFix: 'Call set_natal_chart with birth details (date, time, location, timezone) before requesting transits or chart calculations.',
  };
}

/**
 * Create a warning for polar latitude limitations
 */
export function polarLatitudeWarning(
  latitude: number,
  houseSystem: string
): ToolIssue {
  return {
    code: 'POLAR_LATITUDE_LIMIT',
    message: `${houseSystem} house system may be inaccurate at polar latitudes (${latitude.toFixed(1)}°).`,
    retryable: true,
    suggestedFix: 'Consider using Whole Sign house system for latitudes >66°.',
    details: { latitude, houseSystem },
  };
}
