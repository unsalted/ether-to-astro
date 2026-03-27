// Type definitions for AstroChart library data structures
import {
  DARK_ASPECT_COLORS,
  DARK_THEME_COLORS,
  LIGHT_ASPECT_COLORS,
  LIGHT_THEME_COLORS,
} from './constants.js';

export interface AstroChartData {
  planets: AstroChartPlanets;
  cusps: number[];
}

export interface AstroChartPlanets {
  [planetName: string]: number[];
}

export interface AstroChartSettings {
  SYMBOL_SCALE?: number;
  STROKE_ONLY?: boolean;
  COLOR_BACKGROUND?: string;
  CIRCLE_COLOR?: string;
  LINE_COLOR?: string;
  POINTS_COLOR?: string;
  SIGNS_COLOR?: string;
  CUSPS_FONT_COLOR?: string;
  SYMBOL_AXIS_FONT_COLOR?: string;
  COLOR_ARIES?: string;
  COLOR_TAURUS?: string;
  COLOR_GEMINI?: string;
  COLOR_CANCER?: string;
  COLOR_LEO?: string;
  COLOR_VIRGO?: string;
  COLOR_LIBRA?: string;
  COLOR_SCORPIO?: string;
  COLOR_SAGITTARIUS?: string;
  COLOR_CAPRICORN?: string;
  COLOR_AQUARIUS?: string;
  COLOR_PISCES?: string;
  COLOR_SIGNS?: string[];
  ASPECTS?: {
    [key: string]: {
      degree: number;
      orbit: number;
      color: string;
    };
  };
}

export type ChartTheme = 'light' | 'dark';
export type ChartFormat = 'svg' | 'png' | 'webp';

export function getThemeSettings(
  theme: ChartTheme,
  transparent = false
): Partial<AstroChartSettings> {
  if (theme === 'dark') {
    return {
      COLOR_BACKGROUND: transparent ? 'transparent' : '#282c34',
      CIRCLE_COLOR: '#4b5263',
      LINE_COLOR: '#4b5263',
      POINTS_COLOR: '#abb2bf',
      SIGNS_COLOR: '#d7dae0',
      CUSPS_FONT_COLOR: '#abb2bf',
      SYMBOL_AXIS_FONT_COLOR: '#abb2bf',
      ASPECTS: DARK_ASPECT_COLORS,
      COLOR_ARIES: DARK_THEME_COLORS[0],
      COLOR_TAURUS: DARK_THEME_COLORS[1],
      COLOR_GEMINI: DARK_THEME_COLORS[2],
      COLOR_CANCER: DARK_THEME_COLORS[3],
      COLOR_LEO: DARK_THEME_COLORS[4],
      COLOR_VIRGO: DARK_THEME_COLORS[5],
      COLOR_LIBRA: DARK_THEME_COLORS[6],
      COLOR_SCORPIO: DARK_THEME_COLORS[7],
      COLOR_SAGITTARIUS: DARK_THEME_COLORS[8],
      COLOR_CAPRICORN: DARK_THEME_COLORS[9],
      COLOR_AQUARIUS: DARK_THEME_COLORS[10],
      COLOR_PISCES: DARK_THEME_COLORS[11],
    };
  }

  // Light theme (defaults)
  return {
    COLOR_BACKGROUND: transparent ? 'transparent' : '#ffffff',
    CIRCLE_COLOR: '#333333',
    LINE_COLOR: '#333333',
    POINTS_COLOR: '#000000',
    SIGNS_COLOR: '#000000',
    CUSPS_FONT_COLOR: '#000000',
    SYMBOL_AXIS_FONT_COLOR: '#333333',
    ASPECTS: LIGHT_ASPECT_COLORS,
    COLOR_ARIES: LIGHT_THEME_COLORS[0],
    COLOR_TAURUS: LIGHT_THEME_COLORS[1],
    COLOR_GEMINI: LIGHT_THEME_COLORS[2],
    COLOR_CANCER: LIGHT_THEME_COLORS[3],
    COLOR_LEO: LIGHT_THEME_COLORS[4],
    COLOR_VIRGO: LIGHT_THEME_COLORS[5],
    COLOR_LIBRA: LIGHT_THEME_COLORS[6],
    COLOR_SCORPIO: LIGHT_THEME_COLORS[7],
    COLOR_SAGITTARIUS: LIGHT_THEME_COLORS[8],
    COLOR_CAPRICORN: LIGHT_THEME_COLORS[9],
    COLOR_AQUARIUS: LIGHT_THEME_COLORS[10],
    COLOR_PISCES: LIGHT_THEME_COLORS[11],
  };
}
