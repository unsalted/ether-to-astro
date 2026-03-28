/**
 * Structured error handling for MCP tool results
 *
 * @remarks
 * Provides agent-recoverable error codes and suggestions for self-correction.
 * Distinguishes between recoverable domain errors and hard infrastructure failures.
 *
 * Each error code includes whether it's retryable and suggested fixes
 * to help the agent recover from errors automatically.
 */

/**
 * Error codes for MCP tool operations
 *
 * @remarks
 * Each code represents a specific category of error that can occur
 * during astrological calculations. The codes are designed to be
 * machine-readable while still being descriptive.
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
  | 'INVALID_TIMEZONE'
  | 'MISSING_NATAL_CHART'
  | 'INVALID_DATE'
  | 'INVALID_HOUSE_SYSTEM'
  | 'FILE_WRITE_FAILED'
  | 'CHART_RENDER_FAILED'
  | 'INTERNAL_ERROR';

/**
 * Structured error information for tool operations
 *
 * @remarks
 * Contains the error code, human-readable message, and metadata
 * to help agents understand and recover from errors.
 */
export interface ToolIssue {
  /** Machine-readable error code */
  code: ToolIssueCode;
  /** Human-readable error description */
  message: string;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Suggested fix for the agent (optional) */
  suggestedFix?: string;
  /** Additional error context (optional) */
  details?: Record<string, unknown>;
}

/**
 * Result type for MCP tool operations
 *
 * @remarks
 * Discriminated union that distinguishes between successful
 * and failed operations. Success includes data and optional warnings,
 * while failure includes structured error information.
 */
export type ToolResult<T> =
  | {
      /** Success flag */
      ok: true;
      /** Result data */
      data: T;
      /** Optional warnings about the operation */
      warnings?: ToolIssue[];
    }
  | {
      /** Failure flag */
      ok: false;
      /** Error information */
      error: ToolIssue;
    };

/**
 * Create a successful tool result
 *
 * @param data - The successful result data
 * @param warnings - Optional warnings about the operation
 * @returns Success result with data
 *
 * @remarks
 * Use this to wrap successful operation results. Warnings are
 * optional and can indicate non-fatal issues.
 */
export function success<T>(data: T, warnings?: ToolIssue[]): ToolResult<T> {
  return warnings ? { ok: true, data, warnings } : { ok: true, data };
}

/**
 * Create a failed tool result
 *
 * @param error - Structured error information
 * @returns Failure result with error
 *
 * @remarks
 * Use this to wrap failed operations. The error should include
 * a code, message, and optionally retry/suggestion information.
 */
export function failure(error: ToolIssue): ToolResult<never> {
  return { ok: false, error };
}

/**
 * Schema version for structured responses.
 * Increment on breaking changes to response shapes.
 */
export const SCHEMA_VERSION = '1.0';

/**
 * Build a successful MCP tool response with structured data + human text.
 *
 * @param data - Structured payload
 * @param humanText - Human-readable summary
 * @param warnings - Optional warnings
 * @returns MCP content array (JSON first, text second)
 */
export function mcpResult<T>(data: T, humanText: string, warnings?: ToolIssue[]) {
  const envelope = warnings
    ? { ok: true as const, schemaVersion: SCHEMA_VERSION, data, warnings }
    : { ok: true as const, schemaVersion: SCHEMA_VERSION, data };
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(envelope, null, 2) },
      { type: 'text' as const, text: humanText },
    ],
  };
}

/**
 * Build an error MCP tool response with structured error.
 *
 * @param error - Structured error information
 * @returns MCP content array with isError flag
 */
export function mcpError(error: ToolIssue) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ok: false, schemaVersion: SCHEMA_VERSION, error }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Map Swiss Ephemeris errors to structured tool issues
 *
 * @param context - Operation context where error occurred
 * @param err - Raw error from Swiss Ephemeris
 * @param details - Additional error context
 * @returns Structured tool issue with retry information
 *
 * @remarks
 * Converts low-level Swiss Ephemeris errors into structured,
 * agent-recoverable error codes with suggested fixes.
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
 *
 * @param eventType - Type of event that was missing
 * @param planet - Planet name for context
 * @param details - Additional error context
 * @returns Structured tool issue indicating no event
 *
 * @remarks
 * Used when a planet doesn't rise/set at a location (circumpolar)
 * or when meridian transits don't occur.
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
    suggestedFix:
      'Try another date, location, or request a different event type. Object may be circumpolar.',
    details,
  };
}

/**
 * Create a structured error for circumpolar objects
 *
 * @param planet - Planet name for context
 * @param latitude - Observer latitude where object is circumpolar
 * @param details - Additional error context
 * @returns Structured tool issue for circumpolar object
 *
 * @remarks
 * Used when a planet never rises or sets at extreme latitudes.
 * The object is either always above or always below the horizon.
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
 *
 * @returns Structured tool issue for missing natal chart
 *
 * @remarks
 * Used when transit or chart operations are requested
 * before a natal chart has been set.
 */
export function missingNatalChart(): ToolIssue {
  return {
    code: 'MISSING_NATAL_CHART',
    message: 'No natal chart found. Please set natal chart first.',
    retryable: true,
    suggestedFix:
      'Call set_natal_chart with birth details (date, time, location, timezone) before requesting transits or chart calculations.',
  };
}

/**
 * Create a warning for polar latitude limitations
 *
 * @param latitude - Observer latitude in degrees
 * @param houseSystem - House system being used
 * @returns Structured tool issue warning about polar limitations
 *
 * @remarks
 * Some house systems (Placidus, Koch) fail at extreme latitudes.
 * This warns the user and suggests Whole Sign as a fallback.
 */
export function polarLatitudeWarning(latitude: number, houseSystem: string): ToolIssue {
  return {
    code: 'POLAR_LATITUDE_LIMIT',
    message: `${houseSystem} house system may be inaccurate at polar latitudes (${latitude.toFixed(1)}°).`,
    retryable: true,
    suggestedFix: 'Consider using Whole Sign house system for latitudes >66°.',
    details: { latitude, houseSystem },
  };
}
