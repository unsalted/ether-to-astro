import type { AstroService } from './astro-service.js';
import type { Disambiguation } from './time-utils.js';
import type { HouseSystem, NatalChart } from './types.js';

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
    name: 'get_transits',
    description:
      'Get transits (aspects between current/future planets and natal chart). Supports mode=snapshot (single-day), mode=best_hit (multi-day compressed preview), and mode=forecast (day-grouped output). If mode is omitted, legacy behavior is preserved: days_ahead=0 resolves to snapshot and days_ahead>0 resolves to best_hit.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date for transits (ISO format YYYY-MM-DD). Defaults to today.',
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
            'Include a deterministic mundane baseline alongside natal transits: anchor-day positions, transit-to-transit aspects, and per-day `days[]` data for date ranges. Defaults to false.',
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
    inputSchema: { type: 'object', properties: {} },
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
    inputSchema: { type: 'object', properties: {} },
    requiresNatalChart: true,
    execute: async (ctx) => {
      const result = await ctx.service.getRiseSetTimes(ctx.natalChart as NatalChart);
      return { kind: 'state', data: result.data, text: result.text };
    },
  },
  {
    name: 'get_asteroid_positions',
    description: 'Get positions of major asteroids (Chiron, Ceres, Pallas, Juno, Vesta) and Nodes',
    inputSchema: { type: 'object', properties: {} },
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
    inputSchema: { type: 'object', properties: {} },
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
      'Inspect the current server state: whether a natal chart is loaded, its name and timezone, and the server version. Call this before making assumptions about loaded context.',
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
