import { describe, expect, it } from 'vitest';
import { mapErrorMessageToToolIssueCode } from '../../src/error-mapping.js';

describe('mapErrorMessageToToolIssueCode', () => {
  it('maps rising-sign mode and coordinates validation failures to INVALID_INPUT', () => {
    expect(mapErrorMessageToToolIssueCode('Invalid mode: fast')).toBe('INVALID_INPUT');
    expect(mapErrorMessageToToolIssueCode('Invalid latitude: 95 (must be between -90 and 90)')).toBe(
      'INVALID_INPUT'
    );
    expect(
      mapErrorMessageToToolIssueCode('Invalid longitude: -190 (must be between -180 and 180)')
    ).toBe('INVALID_INPUT');
  });

  it('preserves existing timezone classification', () => {
    expect(mapErrorMessageToToolIssueCode('Invalid timezone: Nope/Not-A-Timezone')).toBe(
      'INVALID_TIMEZONE'
    );
  });
});
