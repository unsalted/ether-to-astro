import { describe, expect, it } from 'vitest';
import { getThemeSettings } from '../../src/chart-types.js';

describe('When selecting chart theme settings', () => {
  it('Given dark theme and transparency options, then background colors are resolved correctly', () => {
    const dark = getThemeSettings('dark', false);
    const darkTransparent = getThemeSettings('dark', true);
    expect(dark.COLOR_BACKGROUND).toBe('#282c34');
    expect(darkTransparent.COLOR_BACKGROUND).toBe('transparent');
  });

  it('Given light theme and transparency options, then background colors are resolved correctly', () => {
    const light = getThemeSettings('light', false);
    const lightTransparent = getThemeSettings('light', true);
    expect(light.COLOR_BACKGROUND).toBe('#ffffff');
    expect(lightTransparent.COLOR_BACKGROUND).toBe('transparent');
  });
});
