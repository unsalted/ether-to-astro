import type { AstroService } from './astro-service.js';
import type { Disambiguation } from './time-utils.js';
import {
  type ElectionalHouseSystem,
  type HouseSystem,
  type NatalChart,
  SIGN_BOUNDARY_BODIES,
  type SignBoundaryBody,
} from './types.js';

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export type ToolExecutionResult =
  | { kind: 'state'; data: Record<string, unknown>; text: string; natalChart?: NatalChart }
  | { kind: 'content'; content: ToolContent[] };

export interface ToolExecutionContext {
  service: AstroService;
  natalChart: NatalChart | null;
}

type ToolArgs = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiresNatalChart: boolean;
  execute: (
    ctx: ToolExecutionContext,
    args: ToolArgs
  ) => Promise<ToolExecutionResult> | ToolExecutionResult;
}

export const MCP_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'set_preferences',
    description:
      'Update process-local MCP runtime preferences. Use this to change session reporting defaults such as timezone and house style without restarting the server.',
    inputSchema: {
      type: 'object',
      properties: {
        preferred_timezone: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description:
            'Optional reporting timezone override for this MCP session. Use null to clear the override.',
        },
        preferred_house_style: {
          anyOf: [{ type: 'string', enum: ['P', 'W', 'K', 'E'] }, { type: 'null' }],
          description:
            'Optional preferred house style override for this MCP session. Use null to clear the override.',
        },
      },
    },
    requiresNatalChart: false,
    execute: (ctx, args) => {
      const result = ctx.service.setPreferences({
        preferred_timezone: args.preferred_timezone as string | null | undefined,
        preferred_house_style: args.preferred_house_style as HouseSystem | null | undefined,
      });
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'set_natal_chart',
    description:
      'Store natal chart data for transit calculations. Birth time should be LOCAL time at the birth location (not UTC). The server converts to UTC using the timezone parameter. Optional birth_time_disambiguation handles DST overlap/gap edge cases (default: reject).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for this chart' },
        year: { type: 'number', description: 'Birth year' },
        month: { type: 'number', description: 'Birth month (1-12)' },
        day: { type: 'number', description: 'Birth day' },
        hour: { type: 'number', description: 'Birth hour (0-23, LOCAL TIME at birth location)' },
        minute: { type: 'number', description: 'Birth minute' },
        latitude: { type: 'number', description: 'Birth location latitude' },
        longitude: { type: 'number', description: 'Birth location longitude' },
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., America/New_York, Europe/London)',
        },
        birth_time_disambiguation: {
          type: 'string',
          enum: ['compatible', 'earlier', 'later', 'reject'],
          description:
            'How to handle DST-ambiguous or nonexistent local birth times. Default: reject.',
        },
        house_system: {
          type: 'string',
          description:
            'House system preference: P=Placidus (default), W=Whole Sign, K=Koch, E=Equal',
          enum: ['P', 'W', 'K', 'E'],
        },
      },
      required: [
        'name',
        'year',
        'month',
        'day',
        'hour',
        'minute',
        'latitude',
        'longitude',
        'timezone',
      ],
    },
    requiresNatalChart: false,
    execute: (ctx, args) => {
      const result = ctx.service.setNatalChart({
        name: args.name as string,
        year: args.year as number,
        month: args.month as number,
        day: args.day as number,
        hour: args.hour as number,
        minute: args.minute as number,
        latitude: args.latitude as number,
        longitude: args.longitude as number,
        timezone: args.timezone as string,
        house_system: args.house_system as HouseSystem | undefined,
        birth_time_disambiguation: args.birth_time_disambiguation as Disambiguation | undefined,
      });
      return { kind: 'state', data: result.data, text: result.text, natalChart: result.chart };
    },
  },
  {
    name: 'get_rising_sign_windows',
    description:
      'Get local-time windows for which zodiac signs are rising on a given date and location. Returns deterministic intervals only (no ranking or interpretation).',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Target local date (YYYY-MM-DD)',
        },
        latitude: { type: 'number', description: 'Latitude in decimal degrees (-90 to 90)' },
        longitude: {
          type: 'number',
          description: 'Longitude in decimal degrees (-180 to 180)',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (e.g., America/New_York)',
        },
        mode: {
          type: 'string',
          enum: ['approximate', 'exact'],
          description:
            'Boundary mode. approximate uses coarser stepping; exact refines sign-change boundaries.',
          default: 'approximate',
        },
      },
      required: ['date', 'latitude', 'longitude', 'timezone'],
    },
    requiresNatalChart: false,
    execute: (ctx, args) => {
      const result = ctx.service.getRisingSignWindows({
        date: args.date as string,
        latitude: args.latitude as number,
        longitude: args.longitude as number,
        timezone: args.timezone as string,
        mode: args.mode as 'approximate' | 'exact' | undefined,
      });
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_sign_boundary_events',
    description:
      'Return exact sign-boundary events for one or more planets across a local date window. Each event includes both from_sign and to_sign so ingress and egress are represented as one crossing.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Start local date (YYYY-MM-DD). Defaults to today in the resolved timezone.',
        },
        timezone: {
          type: 'string',
          description:
            'Optional timezone used for local-day interpretation and reporting. Falls back to the current MCP session timezone.',
        },
        days_ahead: {
          type: 'number',
          description:
            'Number of days to look ahead from the start date. Defaults to 0 for a single-day window.',
          default: 0,
        },
        bodies: {
          type: 'array',
          items: {
            type: 'string',
            enum: [...SIGN_BOUNDARY_BODIES],
          },
          description:
            'Optional list of supported bodies to scan. Defaults to all supported sign-boundary bodies.',
        },
      },
    },
    requiresNatalChart: false,
    execute: (ctx, args) => {
      const result = ctx.service.getSignBoundaryEvents({
        date: args.date as string | undefined,
        timezone: args.timezone as string | undefined,
        days_ahead: args.days_ahead as number | undefined,
        bodies: args.bodies as SignBoundaryBody[] | undefined,
      });
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_electional_context',
    description:
      'Get stateless electional context for a specific local date, time, and location. Returns deterministic timing facts such as ascendant, sect/day-night classification, Moon phase, applying aspects, and optional ascendant-ruler basics. This tool does not require a natal chart and is separate from get_transits.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Target local date (YYYY-MM-DD)',
        },
        time: {
          type: 'string',
          description:
            'Target local time (HH:mm or HH:mm:ss). DST-ambiguous or nonexistent local times are rejected.',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (e.g., America/New_York)',
        },
        latitude: { type: 'number', description: 'Latitude in decimal degrees (-90 to 90)' },
        longitude: {
          type: 'number',
          description: 'Longitude in decimal degrees (-180 to 180)',
        },
        house_system: {
          type: 'string',
          enum: ['P', 'K', 'W', 'R'],
          description:
            'House system used for ascendant extraction: P=Placidus (default), K=Koch, W=Whole Sign, R=Regiomontanus.',
        },
        include_ruler_basics: {
          type: 'boolean',
          description:
            'Include ascendant-ruler position, speed, and retrograde flag. Defaults to false.',
        },
        include_planetary_applications: {
          type: 'boolean',
          description: 'Include applying major aspects between current planets. Defaults to true.',
        },
        orb_degrees: {
          type: 'number',
          description:
            'Orb for electional aspect detection in degrees. Defaults to 3 and must be between 0.1 and 10.',
          default: 3,
        },
      },
      required: ['date', 'time', 'timezone', 'latitude', 'longitude'],
    },
    requiresNatalChart: false,
    execute: (ctx, args) => {
      const result = ctx.service.getElectionalContext({
        date: args.date as string,
        time: args.time as string,
        timezone: args.timezone as string,
        latitude: args.latitude as number,
        longitude: args.longitude as number,
        house_system: args.house_system as ElectionalHouseSystem | undefined,
        include_ruler_basics: args.include_ruler_basics as boolean | undefined,
        include_planetary_applications: args.include_planetary_applications as boolean | undefined,
        orb_degrees: args.orb_degrees as number | undefined,
      });
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_transits',
    description:
      'Get transits (aspects between current/future planets and natal chart). Each transit includes additive placement metadata for both sides (sign, degree, house) so clients can render activation context without reconstructing house logic. Supports mode=snapshot (single-day), mode=best_hit (multi-day compressed preview), and mode=forecast (day-grouped output). If mode is omitted, legacy behavior is preserved: days_ahead=0 resolves to snapshot and days_ahead>0 resolves to best_hit.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date for transits (ISO format YYYY-MM-DD). Defaults to today.',
        },
        timezone: {
          type: 'string',
          description:
            'Optional reporting timezone override. Calculation day interpretation still uses the natal chart timezone.',
        },
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['moon', 'personal', 'outer', 'all'] },
          description:
            'Planet categories to include: moon, personal (Sun/Mercury/Venus/Mars), outer (Jupiter/Saturn/Uranus/Neptune/Pluto), or all. Defaults to ["all"].',
        },
        include_mundane: {
          type: 'boolean',
          description:
            'Include deterministic mundane baseline data for the requested window. Output includes planetary positions using the same sign-boundary normalization as serialized transits, transit-to-transit mundane aspects, and non-narrative weather grouping metadata; forecast windows also include per-day mundane.days entries. Defaults to false.',
        },
        days_ahead: {
          type: 'number',
          description:
            'Number of days to look ahead. In snapshot mode only the start day is used. If mode is omitted, legacy behavior is preserved: 0 resolves to snapshot and values > 0 resolve to best_hit.',
          default: 0,
        },
        mode: {
          type: 'string',
          enum: ['snapshot', 'best_hit', 'forecast'],
          description:
            'Transit output mode: snapshot=single-day, best_hit=compressed preview across range, forecast=day-grouped output. If omitted, legacy behavior is preserved.',
        },
        max_orb: {
          type: 'number',
          description: 'Maximum orb in degrees to include. Defaults to 8.',
          default: 8,
        },
        exact_only: {
          type: 'boolean',
          description:
            'Only return transits with exact times calculated (within 2° orb). Defaults to false.',
        },
        applying_only: {
          type: 'boolean',
          description: 'Only return applying (tightening) transits. Defaults to false.',
        },
      },
    },
    requiresNatalChart: true,
    execute: (ctx, args) => {
      const result = ctx.service.getTransits(ctx.natalChart as NatalChart, {
        date: args.date as string | undefined,
        timezone: args.timezone as string | undefined,
        categories: args.categories as string[] | undefined,
        include_mundane: args.include_mundane as boolean | undefined,
        days_ahead: args.days_ahead as number | undefined,
        mode: args.mode as 'snapshot' | 'best_hit' | 'forecast' | undefined,
        max_orb: args.max_orb as number | undefined,
        exact_only: args.exact_only as boolean | undefined,
        applying_only: args.applying_only as boolean | undefined,
      });
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_houses',
    description:
      'Calculate house cusps, Ascendant, and Midheaven for the natal chart using the specified house system',
    inputSchema: {
      type: 'object',
      properties: {
        system: {
          type: 'string',
          enum: ['P', 'K', 'W', 'E'],
          description: 'House system: P=Placidus (default), K=Koch, W=Whole Sign, E=Equal',
          default: 'P',
        },
      },
    },
    requiresNatalChart: true,
    execute: (ctx, args) => {
      const result = ctx.service.getHouses(ctx.natalChart as NatalChart, {
        system: args.system as string | undefined,
      });
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_retrograde_planets',
    description: 'Show which planets are currently retrograde',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Optional reporting timezone override',
        },
      },
    },
    requiresNatalChart: false,
    execute: (ctx, args) => {
      const timezone = ctx.service.resolveReportingTimezone(
        args.timezone as string | undefined,
        ctx.natalChart?.location?.timezone
      );
      const result = ctx.service.getRetrogradePlanets(timezone);
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_rise_set_times',
    description: 'Get sunrise, sunset, moonrise, moonset times for today',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description:
            'Optional reporting timezone override. Rise/set anchoring still uses the natal chart timezone.',
        },
      },
    },
    requiresNatalChart: true,
    execute: async (ctx, args) => {
      const result = await ctx.service.getRiseSetTimes(
        ctx.natalChart as NatalChart,
        args.timezone as string | undefined
      );
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_asteroid_positions',
    description: 'Get positions of major asteroids (Chiron, Ceres, Pallas, Juno, Vesta) and Nodes',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Optional reporting timezone override',
        },
      },
    },
    requiresNatalChart: false,
    execute: (ctx, args) => {
      const timezone = ctx.service.resolveReportingTimezone(
        args.timezone as string | undefined,
        ctx.natalChart?.location?.timezone
      );
      const result = ctx.service.getAsteroidPositions(timezone);
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_next_eclipses',
    description: 'Find the next solar and lunar eclipses',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Optional reporting timezone override',
        },
      },
    },
    requiresNatalChart: false,
    execute: (ctx, args) => {
      const timezone = ctx.service.resolveReportingTimezone(
        args.timezone as string | undefined,
        ctx.natalChart?.location?.timezone
      );
      const result = ctx.service.getNextEclipses(timezone);
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_server_status',
    description:
      'Inspect the current server state: whether a natal chart is loaded, its name and timezone, the effective reporting timezone and house-style context, and the server version. Call this before making assumptions about loaded context.',
    inputSchema: { type: 'object', properties: {} },
    requiresNatalChart: false,
    execute: (ctx) => {
      const result = ctx.service.getServerStatus(ctx.natalChart);
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'generate_natal_chart',
    description:
      'Generate a visual natal chart wheel with planets, houses, and aspects. Supports SVG, PNG, and WebP formats. Theme defaults to dark (6pm-6am) or light (6am-6pm) based on current time, but can be overridden with the theme parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          enum: ['light', 'dark'],
          description:
            'Color theme override. Defaults to time-based: dark (6pm-6am) or light (6am-6pm)',
        },
        format: {
          type: 'string',
          enum: ['svg', 'png', 'webp'],
          description: 'Output format (svg, png, or webp), defaults to svg',
        },
        output_path: {
          type: 'string',
          description: 'Optional absolute file path to save the chart (e.g., /path/to/chart.webp)',
        },
      },
    },
    requiresNatalChart: true,
    execute: async (ctx, args) => {
      const result = await ctx.service.generateNatalChart(ctx.natalChart as NatalChart, {
        theme: args.theme as 'light' | 'dark' | undefined,
        format: args.format as 'svg' | 'png' | 'webp' | undefined,
        output_path: args.output_path as string | undefined,
      });
      if (result.outputPath) {
        return { kind: 'content', content: [{ type: 'text', text: result.text }] };
      }
      if (result.format === 'svg' && result.svg) {
        return {
          kind: 'content',
          content: [
            { type: 'text', text: result.text },
            { type: 'text', text: result.svg },
          ],
        };
      }
      if (result.image) {
        return {
          kind: 'content',
          content: [
            { type: 'text', text: result.text },
            { type: 'image', data: result.image.data, mimeType: result.image.mimeType },
          ],
        };
      }
      throw new Error('Chart generation returned no payload.');
    },
  },
  {
    name: 'generate_transit_chart',
    description:
      'Generate a visual transit chart showing current transits overlaid on the natal chart. Date defaults to today at local noon in the natal chart timezone. Supports SVG, PNG, and WebP formats with light or dark themes.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Optional date for transits (ISO format), defaults to today at local noon',
        },
        theme: {
          type: 'string',
          enum: ['light', 'dark'],
          description:
            'Color theme override. Defaults to time-based: dark (6pm-6am) or light (6am-6pm)',
        },
        format: {
          type: 'string',
          enum: ['svg', 'png', 'webp'],
          description: 'Output format (svg, png, or webp), defaults to svg',
        },
        output_path: {
          type: 'string',
          description: 'Optional absolute file path to save the chart (e.g., /path/to/chart.webp)',
        },
      },
    },
    requiresNatalChart: true,
    execute: async (ctx, args) => {
      const result = await ctx.service.generateTransitChart(ctx.natalChart as NatalChart, {
        date: args.date as string | undefined,
        theme: args.theme as 'light' | 'dark' | undefined,
        format: args.format as 'svg' | 'png' | 'webp' | undefined,
        output_path: args.output_path as string | undefined,
      });
      if (result.outputPath) {
        return { kind: 'content', content: [{ type: 'text', text: result.text }] };
      }
      if (result.format === 'svg' && result.svg) {
        return {
          kind: 'content',
          content: [
            { type: 'text', text: result.text },
            { type: 'text', text: result.svg },
          ],
        };
      }
      if (result.image) {
        return {
          kind: 'content',
          content: [
            { type: 'text', text: result.text },
            { type: 'image', data: result.image.data, mimeType: result.image.mimeType },
          ],
        };
      }
      throw new Error('Transit chart generation returned no payload.');
    },
  },
];

export function createToolSpecIndex(specs: ToolSpec[] = MCP_TOOL_SPECS): Map<string, ToolSpec> {
  return new Map(specs.map((spec) => [spec.name, spec]));
}

const TOOL_INDEX = createToolSpecIndex();

export function getToolSpec(name: string): ToolSpec | undefined {
  return TOOL_INDEX.get(name);
}
