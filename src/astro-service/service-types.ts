import type { Disambiguation } from '../time-utils.js';
import type { ElectionalHouseSystem, HouseSystem } from '../types.js';

/**
 * Public input type for building and caching the shared natal chart payload.
 */
export interface SetNatalChartInput {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  latitude: number;
  longitude: number;
  timezone: string;
  house_system?: HouseSystem;
  birth_time_disambiguation?: Disambiguation;
}

/**
 * Public input type for querying natal transits.
 */
export interface GetTransitsInput {
  date?: string;
  timezone?: string;
  categories?: string[];
  include_mundane?: boolean;
  days_ahead?: number;
  mode?: 'snapshot' | 'best_hit' | 'forecast';
  max_orb?: number;
  exact_only?: boolean;
  applying_only?: boolean;
}

/**
 * Public input type for stateless electional context lookup.
 */
export interface GetElectionalContextInput {
  date: string;
  time: string;
  timezone: string;
  latitude: number;
  longitude: number;
  house_system?: ElectionalHouseSystem;
  include_ruler_basics?: boolean;
  include_planetary_applications?: boolean;
  orb_degrees?: number;
}

/**
 * Public input type for house lookup on an existing natal chart.
 */
export interface GetHousesInput {
  system?: string;
}

/**
 * Public input type for daily rising-sign window lookup.
 */
export interface GetRisingSignWindowsInput {
  date: string;
  latitude: number;
  longitude: number;
  timezone: string;
  mode?: 'approximate' | 'exact';
}

/**
 * Public output-wrapper shared by service methods that return data plus text.
 */
export interface ServiceResult<T> {
  data: T;
  text: string;
}

/**
 * Public input type for updating process-local MCP runtime preferences.
 */
export interface SetPreferencesInput {
  preferred_timezone?: string | null;
  preferred_house_style?: HouseSystem | null;
}

/**
 * Public input type for chart rendering methods.
 */
export interface GenerateChartInput {
  theme?: 'light' | 'dark';
  format?: 'svg' | 'png' | 'webp';
  output_path?: string;
}

/**
 * Public input type for transit-chart rendering methods.
 */
export interface GenerateTransitChartInput extends GenerateChartInput {
  date?: string;
}
