import { describe, expect, it } from 'vitest';
import { mapToolErrorMessageToCode } from '../../src/tool-result.js';

describe('mapToolErrorMessageToCode', () => {
  it('maps rising-sign mode and coordinates validation failures to INVALID_INPUT', () => {
    expect(mapToolErrorMessageToCode('Invalid mode: fast')).toBe('INVALID_INPUT');
    expect(mapToolErrorMessageToCode('Invalid latitude: 95 (must be between -90 and 90)')).toBe(
      'INVALID_INPUT'
    );
    expect(
      mapToolErrorMessageToCode('Invalid longitude: -190 (must be between -180 and 180)')
    ).toBe('INVALID_INPUT');
  });

  it('preserves existing timezone classification', () => {
    expect(mapToolErrorMessageToCode('Invalid timezone: Nope/Not-A-Timezone')).toBe(
      'INVALID_TIMEZONE'
    );
  });
});
