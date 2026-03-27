// Type definitions for AstroChart library data structures

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
  '#c1e6d1'  // Pisces - Mint (water)
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
  '#8545b0'  // Pisces - Purple (water)
];

export function getThemeSettings(theme: ChartTheme, transparent = false): Partial<AstroChartSettings> {
  if (theme === 'dark') {
    return {
      COLOR_BACKGROUND: transparent ? 'transparent' : '#282c34',
      CIRCLE_COLOR: '#4b5263',
      LINE_COLOR: '#4b5263',
      POINTS_COLOR: '#abb2bf',
      SIGNS_COLOR: '#d7dae0',
      CUSPS_FONT_COLOR: '#abb2bf',
      SYMBOL_AXIS_FONT_COLOR: '#abb2bf',
      ASPECTS: {
        conjunction: { degree: 0, orbit: 10, color: 'transparent' },
        square: { degree: 90, orbit: 8, color: '#f97316' },
        trine: { degree: 120, orbit: 8, color: '#10b981' },
        opposition: { degree: 180, orbit: 10, color: '#8b5cf6' },
        sextile: { degree: 60, orbit: 6, color: '#06b6d4' }
      },
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
      COLOR_PISCES: DARK_THEME_COLORS[11]
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
    ASPECTS: {
      conjunction: { degree: 0, orbit: 10, color: 'transparent' },
      square: { degree: 90, orbit: 8, color: '#fb923c' },
      trine: { degree: 120, orbit: 8, color: '#34d399' },
      opposition: { degree: 180, orbit: 10, color: '#a78bfa' },
      sextile: { degree: 60, orbit: 6, color: '#22d3ee' }
    },
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
    COLOR_PISCES: LIGHT_THEME_COLORS[11]
  };
}
