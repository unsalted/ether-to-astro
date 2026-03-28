import type { ToolIssueCode } from './tool-result.js';

export function mapErrorMessageToToolIssueCode(errorMessage: string): ToolIssueCode {
  if (
    errorMessage.includes('Invalid date format') ||
    errorMessage.includes('Invalid calendar date') ||
    errorMessage.includes('Invalid month') ||
    errorMessage.includes('Invalid day') ||
    errorMessage.includes('days_ahead') ||
    errorMessage.includes('max_orb') ||
    errorMessage.includes('missing julianDay') ||
    errorMessage.includes('Invalid mode') ||
    errorMessage.includes('Invalid latitude') ||
    errorMessage.includes('Invalid longitude')
  ) {
    return 'INVALID_INPUT';
  }
  if (errorMessage.includes('Invalid timezone') || errorMessage.includes('timezone')) {
    return 'INVALID_TIMEZONE';
  }
  if (errorMessage.includes('Invalid house system')) {
    return 'INVALID_HOUSE_SYSTEM';
  }
  if (errorMessage.includes('Ephemeris') || errorMessage.includes('ephemeris')) {
    return 'EPHEMERIS_COMPUTE_FAILED';
  }
  if (
    errorMessage.includes('write') ||
    errorMessage.includes('ENOENT') ||
    errorMessage.includes('EACCES')
  ) {
    return 'FILE_WRITE_FAILED';
  }
  if (errorMessage.includes('render') || errorMessage.includes('chart')) {
    return 'CHART_RENDER_FAILED';
  }
  return 'INTERNAL_ERROR';
}
