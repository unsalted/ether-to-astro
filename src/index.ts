/**
 * Main MCP server for astrological calculations
 * 
 * @remarks
 * Provides tools for:
 * - Setting and managing natal charts
 * - Calculating planetary positions and transits
 * - Generating astrological charts
 * - Computing houses, rise/set times, and eclipses
 * 
 * Uses Swiss Ephemeris for accurate astronomical calculations.
 * All calculations are tropical (not sidereal) and geocentric.
 */

import { writeFile } from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Temporal } from '@js-temporal/polyfill';
import { ChartRenderer } from './charts.js';
import { getDefaultTheme } from './constants.js';
import { EclipseCalculator } from './eclipses.js';
import { EphemerisCalculator } from './ephemeris.js';
import { TimeFormatter } from './formatter.js';
import { HouseCalculator } from './houses.js';
import { logger } from './logger.js';
import { RiseSetCalculator } from './riseset.js';
import { TransitCalculator, deduplicateTransits } from './transits.js';
import { missingNatalChart, mcpResult, mcpError } from './tool-result.js';
import { localToUTC, utcToLocal, addLocalDays, type Disambiguation } from './time-utils.js';
import {
  ASTEROIDS,
  type HouseSystem,
  type NatalChart,
  NODES,
  OUTER_PLANETS,
  PERSONAL_PLANETS,
  PLANETS,
  type Transit,
  type TransitResponse,
  type PlanetPositionResponse,
  ZODIAC_SIGNS,
} from './types.js';

const server = new Server(
  {
    name: 'ether-to-astro-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Parse and validate a date-only string in YYYY-MM-DD format
 * @param dateStr - Date string to parse
 * @returns LocalDateTime at noon
 * @throws Error if format is invalid or date is not a real calendar date
 */
function parseDateOnlyInput(dateStr: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, got "${dateStr}"`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Validate ranges
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month} (must be 1-12)`);
  }
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day: ${day} (must be 1-31)`);
  }

  // Validate it's a real calendar date by attempting to create it with Temporal
  try {
    Temporal.PlainDate.from({ year, month, day });
  } catch {
    throw new Error(`Invalid calendar date: ${dateStr}`);
  }

  return { year, month, day, hour: 12, minute: 0 };
}

/**
 * In-memory natal chart — the server's sole piece of mutable state.
 *
 * Lifecycle:
 *  - Starts as `null` when the process launches.
 *  - Set by `set_natal_chart`; overwritten on each call.
 *  - Persists for the lifetime of this stdio process (one per MCP client).
 *  - Tools that require it (`get_transits`, `get_houses`, `get_rise_set_times`,
 *    `generate_natal_chart`, `generate_transit_chart`) return a structured
 *    MISSING_NATAL_CHART error if it is null.
 *  - Use `get_server_status` to inspect whether a chart is loaded.
 *
 * Thread safety: Each MCP client connection spawns a separate Node.js process
 * via stdio transport, so this variable is isolated per client.
 * No synchronization needed as requests are serialized within a single process.
 */
let natalChart: NatalChart | null = null;

// Calculator instances (initialized on demand)
const ephem = new EphemerisCalculator();
const transitCalc = new TransitCalculator(ephem);
const houseCalc = new HouseCalculator(ephem);
const riseSetCalc = new RiseSetCalculator(ephem);
const eclipseCalc = new EclipseCalculator(ephem);
const chartRenderer = new ChartRenderer(ephem, houseCalc);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'set_natal_chart',
        description:
          'Store natal chart data for transit calculations. Birth time should be LOCAL time at the birth location (not UTC). The server converts to UTC using the timezone parameter. Optional birth_time_disambiguation handles DST overlap/gap edge cases (default: reject).',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name for this chart',
            },
            year: { type: 'number', description: 'Birth year' },
            month: { type: 'number', description: 'Birth month (1-12)' },
            day: { type: 'number', description: 'Birth day' },
            hour: { type: 'number', description: 'Birth hour (0-23, LOCAL TIME at birth location)' },
            minute: { type: 'number', description: 'Birth minute' },
            latitude: { type: 'number', description: 'Birth location latitude' },
            longitude: { type: 'number', description: 'Birth location longitude' },
            timezone: { type: 'string', description: 'Timezone (e.g., America/New_York, Europe/London)' },
            birth_time_disambiguation: {
              type: 'string',
              enum: ['compatible', 'earlier', 'later', 'reject'],
              description: 'How to handle DST-ambiguous or nonexistent local birth times. Default: reject.',
            },
            house_system: {
              type: 'string',
              description: 'House system preference: P=Placidus (default), W=Whole Sign, K=Koch, E=Equal',
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
      },
      {
        name: 'get_transits',
        description:
          'Get transits (aspects between current/future planets and natal chart). Returns aspects within orb, with exact timing when close. Date defaults to today at local noon in the natal chart timezone.',
        inputSchema: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date for transits (ISO format YYYY-MM-DD). Defaults to today.',
            },
            categories: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['moon', 'personal', 'outer', 'all'],
              },
              description: 'Planet categories to include: moon, personal (Sun/Mercury/Venus/Mars), outer (Jupiter/Saturn/Uranus/Neptune/Pluto), or all. Defaults to ["all"].',
            },
            include_mundane: {
              type: 'boolean',
              description: 'Include current planetary positions (not transits to natal chart). Defaults to false.',
            },
            days_ahead: {
              type: 'number',
              description: 'Number of days to look ahead for upcoming transits. 0 = today only. Defaults to 0.',
              default: 0,
            },
            max_orb: {
              type: 'number',
              description: 'Maximum orb in degrees to include. Defaults to 8.',
              default: 8,
            },
            exact_only: {
              type: 'boolean',
              description: 'Only return transits with exact times calculated (within 2° orb). Defaults to false.',
            },
            applying_only: {
              type: 'boolean',
              description: 'Only return applying (tightening) transits. Defaults to false.',
            },
          },
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
      },
      {
        name: 'get_retrograde_planets',
        description: 'Show which planets are currently retrograde',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_rise_set_times',
        description: 'Get sunrise, sunset, moonrise, moonset times for today',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_asteroid_positions',
        description:
          'Get positions of major asteroids (Chiron, Ceres, Pallas, Juno, Vesta) and Nodes',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_next_eclipses',
        description: 'Find the next solar and lunar eclipses',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_server_status',
        description:
          'Inspect the current server state: whether a natal chart is loaded, its name and timezone, and the server version. Call this before making assumptions about loaded context.',
        inputSchema: {
          type: 'object',
          properties: {},
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
              description:
                'Optional absolute file path to save the chart (e.g., /path/to/chart.webp)',
            },
          },
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
              description: 'Optional date for transits (ISO format), defaults to now',
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
              description:
                'Optional absolute file path to save the chart (e.g., /path/to/chart.webp)',
            },
          },
        },
      },
    ],
  };
});

/**
 * Handle MCP tool requests
 * 
 * @param request - The MCP tool request
 * @returns Tool response with data or error
 * @throws Error for unhandled tools
 * 
 * @remarks
 * Routes requests to appropriate handlers. Initializes ephemeris on first use.
 * All handlers return structured responses suitable for MCP clients.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'set_natal_chart': {
        /**
         * Set natal chart data for subsequent calculations
         * 
         * @remarks
         * Converts local birth time to UTC, calculates Julian Day,
         * and stores the chart with all calculated data.
         * Returns verification details including key positions.
         */
        // Capture requested house system before any mutation
        const requestedHouseSystem = (args.house_system as HouseSystem | undefined) ?? null;

        const chart: NatalChart = {
          name: args.name as string,
          birthDate: {
            year: args.year as number,
            month: args.month as number,
            day: args.day as number,
            hour: args.hour as number,
            minute: args.minute as number,
          },
          location: {
            latitude: args.latitude as number,
            longitude: args.longitude as number,
            timezone: args.timezone as string,
          },
        };

        const birthTimeDisambiguation =
          (args.birth_time_disambiguation as Disambiguation | undefined) ?? 'reject';

        // Convert local birth time to UTC with strict disambiguation
        // Birth times should reject ambiguous/nonexistent times rather than guess
        let utcDate: Date;
        try {
          utcDate = localToUTC(chart.birthDate, chart.location.timezone, birthTimeDisambiguation);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return mcpError({
            code: 'INVALID_INPUT',
            message: `${message}. For DST overlap/gap birth times, retry set_natal_chart with birth_time_disambiguation='earlier' or 'later'.`,
            retryable: true,
            suggestedFix: "Pass birth_time_disambiguation: 'earlier' or 'later' in set_natal_chart.",
          });
        }
        const utcComponents = utcToLocal(utcDate, 'UTC');
        
        // Calculate Julian Day from UTC time
        const jd = ephem.dateToJulianDay(utcDate);
        
        // Calculate planet positions
        const planetIds = Object.values(PLANETS);
        const positions = ephem.getAllPlanets(jd, planetIds);
        
        // Determine house system (default to Placidus, or Whole Sign for polar latitudes)
        const isPolar = Math.abs(chart.location.latitude) > 66;
        let houseSystem: HouseSystem = requestedHouseSystem || 'P';
        if (isPolar && houseSystem === 'P') {
          houseSystem = 'W'; // Fallback to Whole Sign for polar latitudes
        }
        
        // Calculate houses for verification
        const houses = houseCalc.calculateHouses(
          jd,
          chart.location.latitude,
          chart.location.longitude,
          houseSystem
        );

        // Store chart with all calculated data
        // Use the actual house system that was used (may differ from requested if fallback occurred)
        natalChart = {
          ...chart,
          planets: positions,
          julianDay: jd,
          houseSystem: houses.system,
          utcDateTime: utcComponents,
        };
        
        // Return detailed verification feedback
        const sun = positions.find(p => p.planet === 'Sun');
        const moon = positions.find(p => p.planet === 'Moon');
        
        if (!sun || !moon) {
          throw new Error('Ephemeris failed to compute Sun/Moon positions for natal chart.');
        }
        
        const formatDegree = (lon: number) => {
          const sign = ZODIAC_SIGNS[Math.floor(lon / 30)];
          const degree = lon % 30;
          return `${degree.toFixed(0)}° ${sign}`;
        };
        
        const localTimeStr = `${chart.birthDate.month}/${chart.birthDate.day}/${chart.birthDate.year} ${chart.birthDate.hour}:${String(chart.birthDate.minute).padStart(2, '0')}`;
        const utcTimeStr = `${utcComponents.month}/${utcComponents.day}/${utcComponents.year} ${utcComponents.hour}:${String(utcComponents.minute).padStart(2, '0')} UTC`;
        
        const systemNames: { [key: string]: string } = {
          P: 'Placidus',
          W: 'Whole Sign',
          K: 'Koch',
          E: 'Equal',
        };
        
        // Format location with correct hemisphere directions
        const latDir = chart.location.latitude >= 0 ? 'N' : 'S';
        const lonDir = chart.location.longitude >= 0 ? 'E' : 'W';
        const latAbs = Math.abs(chart.location.latitude);
        const lonAbs = Math.abs(chart.location.longitude);
        
        const feedback = [
          `Natal chart saved for ${chart.name}`,
          '',
          'Birth Details:',
          `- Local Time: ${localTimeStr} (${chart.location.timezone})`,
          `- UTC Time: ${utcTimeStr}`,
          `- Location: ${latAbs.toFixed(2)}°${latDir}, ${lonAbs.toFixed(2)}°${lonDir}`,
          '',
          'Chart Angles:',
          `- Sun: ${formatDegree(sun.longitude)}`,
          `- Moon: ${formatDegree(moon.longitude)}`,
          `- Ascendant: ${formatDegree(houses.ascendant)}`,
          `- MC: ${formatDegree(houses.mc)}`,
          '',
          `House System: ${systemNames[houses.system] || houses.system}`,
        ];
        
        if (isPolar && houses.system !== houseSystem) {
          feedback.push('', `Note: Polar latitude detected (${chart.location.latitude.toFixed(1)}°). Requested ${systemNames[houseSystem]}, using ${systemNames[houses.system]} instead.`);
        } else if (isPolar) {
          feedback.push('', `Note: Polar latitude detected (${chart.location.latitude.toFixed(1)}°). Using ${systemNames[houses.system]} house system.`);
        }

        const structuredData = {
          name: chart.name,
          birthTime: {
            local: localTimeStr,
            utc: utcTimeStr,
            timezone: chart.location.timezone,
          },
          location: {
            latitude: chart.location.latitude,
            longitude: chart.location.longitude,
          },
          julianDay: jd,
          requestedHouseSystem, // What user asked for (or null if omitted)
          resolvedHouseSystem: houses.system, // What was actually used
          angles: {
            sun: formatDegree(sun.longitude),
            moon: formatDegree(moon.longitude),
            ascendant: formatDegree(houses.ascendant),
            mc: formatDegree(houses.mc),
          },
          isPolar,
        };

        return mcpResult(structuredData, feedback.join('\n'));
      }

      case 'get_transits': {
        if (!natalChart) {
          return mcpError(missingNatalChart());
        }

        const dateStr = args.date as string | undefined;
        const categories = (args.categories as string[]) ?? ['all'];
        const includeMundane = (args.include_mundane as boolean) ?? false;
        const daysAhead = (args.days_ahead as number | undefined) ?? 0;
        const maxOrb = (args.max_orb as number | undefined) ?? 8;
        const exactOnly = (args.exact_only as boolean) ?? false;
        const applyingOnly = (args.applying_only as boolean) ?? false;

        // Validate numeric inputs
        if (daysAhead < 0) {
          return mcpError({ code: 'INVALID_INPUT', message: 'days_ahead must be >= 0', retryable: false });
        }
        if (maxOrb < 0) {
          return mcpError({ code: 'INVALID_INPUT', message: 'max_orb must be >= 0', retryable: false });
        }

        // Build planet list from categories
        let transitingPlanetIds: number[] = [];
        if (categories.includes('all')) {
          transitingPlanetIds = Object.values(PLANETS);
        } else {
          if (categories.includes('moon')) {
            transitingPlanetIds.push(PLANETS.MOON);
          }
          if (categories.includes('personal')) {
            transitingPlanetIds.push(...PERSONAL_PLANETS.filter(p => !transitingPlanetIds.includes(p)));
          }
          if (categories.includes('outer')) {
            transitingPlanetIds.push(...OUTER_PLANETS.filter(p => !transitingPlanetIds.includes(p)));
          }
        }

        const timezone = natalChart.location.timezone;

        // Date-only input is interpreted as noon in the natal chart's timezone
        // For consistency, omitted date also uses today at local noon (not current instant)
        let targetDate: Date;
        if (dateStr) {
          try {
            const parsed = parseDateOnlyInput(dateStr);
            targetDate = localToUTC(parsed, timezone);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid date format';
            return mcpError({ code: 'INVALID_INPUT', message, retryable: false });
          }
        } else {
          // No date provided: use today at local noon for reproducibility
          const now = new Date();
          const localNow = utcToLocal(now, timezone);
          const localNoon = { ...localNow, hour: 12, minute: 0, second: 0 };
          targetDate = localToUTC(localNoon, timezone);
        }

        // Collect transits across date range
        // Use timezone-aware calendar addition to handle month/year rollovers and DST
        const allTransits: Transit[] = [];
        const startLocal = utcToLocal(targetDate, timezone);
        for (let day = 0; day <= daysAhead; day++) {
          // Add N calendar days using proper Temporal-based addition
          const dayUTC = addLocalDays(startLocal, timezone, day);
          const jd = ephem.dateToJulianDay(dayUTC);
          const transitingPlanets = ephem.getAllPlanets(jd, transitingPlanetIds);
          const transits = transitCalc.findTransits(transitingPlanets, natalChart.planets || [], jd);
          allTransits.push(...transits);
        }

        // Deduplicate: keep best hit per aspect (exact > smallest orb > earliest)
        let filteredTransits = deduplicateTransits(allTransits);

        // Apply filters
        filteredTransits = filteredTransits.filter(t => t.orb <= maxOrb);
        if (exactOnly) {
          filteredTransits = filteredTransits.filter(t => t.exactTime !== undefined);
        }
        if (applyingOnly) {
          filteredTransits = filteredTransits.filter(t => t.isApplying);
        }
        filteredTransits.sort((a, b) => a.orb - b.orb);

        const localDate = utcToLocal(targetDate, timezone);
        const dateLabel = `${localDate.year}-${String(localDate.month).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;

        const structuredData: TransitResponse = {
          date: dateLabel,
          timezone,
          transits: filteredTransits.map(t => ({
            transitingPlanet: t.transitingPlanet,
            aspect: t.aspect,
            natalPlanet: t.natalPlanet,
            orb: Number.parseFloat(t.orb.toFixed(2)),
            isApplying: t.isApplying,
            exactTime: t.exactTime?.toISOString(),
            transitLongitude: t.transitLongitude,
            natalLongitude: t.natalLongitude,
          })),
        };

        let responseData: Record<string, unknown> = structuredData as unknown as Record<string, unknown>;
        let mundaneText = '';

        if (includeMundane) {
          const currentJD = ephem.dateToJulianDay(targetDate);
          const currentPositions = ephem.getAllPlanets(currentJD, transitingPlanetIds);
          const mundaneData: PlanetPositionResponse = {
            date: dateLabel,
            timezone,
            positions: currentPositions,
          };
          responseData = { transits: structuredData, mundane: mundaneData };
          mundaneText = '\n\nCurrent Planetary Positions:\n\n' + currentPositions
            .map(p => `${p.planet}: ${p.degree.toFixed(1)}° ${p.sign} (${p.isRetrograde ? 'Rx' : 'Direct'})`)
            .join('\n');
        }

        const humanLines = filteredTransits
          .map((t) => {
            const exactStr = t.exactTime
              ? ` - Exact: ${TimeFormatter.formatInTimezone(t.exactTime, timezone)}`
              : '';
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
          })
          .join('\n');

        const rangeStr = daysAhead > 0 ? ` (next ${daysAhead + 1} days)` : '';
        const transitHeader = filteredTransits.length > 0
          ? `Transits${rangeStr}:\n\n${humanLines}`
          : 'No transits found matching the specified criteria.';

        return mcpResult(responseData, transitHeader + mundaneText);
      }

      case 'get_houses': {
        if (!natalChart) {
          return mcpError(missingNatalChart());
        }

        const system = (args.system as string) || natalChart.houseSystem || 'P';
        if (!natalChart.julianDay) {
          return mcpError({
            code: 'INVALID_INPUT',
            message: 'Natal chart is missing julianDay. Re-run set_natal_chart to fix.',
            retryable: true,
            suggestedFix: 'Call set_natal_chart again with birth details.',
          });
        }
        const jd = natalChart.julianDay;

        const houses = houseCalc.calculateHouses(
          jd,
          natalChart.location.latitude,
          natalChart.location.longitude,
          system
        );

        const humanLines = houses.cusps
          .slice(1) // skip unused index 0
          .map((deg: number, i: number) => {
            const sign = ZODIAC_SIGNS[Math.floor(deg / 30)];
            return `House ${i + 1}: ${(deg % 30).toFixed(2)}° ${sign}`;
          })
          .join('\n');
        const humanText = `Houses (${houses.system}):\nAsc: ${houses.ascendant.toFixed(2)}° | MC: ${houses.mc.toFixed(2)}°\n\n${humanLines}`;

        return mcpResult(houses, humanText);
      }

      case 'get_retrograde_planets': {
        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const allPlanetIds = Object.values(PLANETS);
        const positions = ephem.getAllPlanets(jd, allPlanetIds);
        const retrograde = positions.filter(p => p.isRetrograde);

        const timezone = natalChart?.location.timezone ?? 'UTC';
        const localNow = utcToLocal(now, timezone);
        const dateLabel = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(localNow.day).padStart(2, '0')}`;

        const structuredData = {
          date: dateLabel,
          timezone,
          planets: retrograde,
        };

        const humanText = retrograde.length === 0
          ? 'No planets are currently retrograde.'
          : `Retrograde Planets:\n\n${retrograde.map(p => `${p.planet}: ${p.degree.toFixed(2)}° ${p.sign}`).join('\n')}`;

        return mcpResult(structuredData, humanText);
      }

      case 'get_rise_set_times': {
        if (!natalChart) {
          return mcpError(missingNatalChart());
        }

        const timezone = natalChart.location.timezone;
        
        // Get today's date in natal chart timezone and anchor at midnight
        // This ensures we get today's rise/set events, not "next events after now"
        const now = new Date();
        const localNow = utcToLocal(now, timezone);
        const localMidnight = { year: localNow.year, month: localNow.month, day: localNow.day, hour: 0, minute: 0, second: 0 };
        const midnightUTC = localToUTC(localMidnight, timezone);
        
        const dateLabel = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(localNow.day).padStart(2, '0')}`;

        const results = await riseSetCalc.getAllRiseSet(
          midnightUTC,
          natalChart.location.latitude,
          natalChart.location.longitude
        );

        const structuredData = {
          date: dateLabel,
          timezone,
          times: results.map(r => ({
            planet: r.planet,
            rise: r.rise?.toISOString() ?? null,
            set: r.set?.toISOString() ?? null,
          })),
        };

        const humanText = `Rise/Set Times:\n\n${results.map(r => {
          const rise = r.rise ? TimeFormatter.formatInTimezone(r.rise, timezone) : 'none';
          const set = r.set ? TimeFormatter.formatInTimezone(r.set, timezone) : 'none';
          return `${r.planet}: Rise ${rise}, Set ${set}`;
        }).join('\n')}`;

        return mcpResult(structuredData, humanText);
      }

      case 'get_asteroid_positions': {
        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const asteroidIds = [...ASTEROIDS, ...NODES];
        const positions = ephem.getAllPlanets(jd, asteroidIds);

        const timezone = natalChart?.location.timezone ?? 'UTC';
        const localNow = utcToLocal(now, timezone);
        const dateLabel = `${localNow.year}-${String(localNow.month).padStart(2, '0')}-${String(localNow.day).padStart(2, '0')}`;

        const structuredData = {
          date: dateLabel,
          timezone,
          positions,
        };

        const humanText = 'Asteroid & Node Positions:\n\n' + positions
          .map((p) => {
            const rx = p.isRetrograde ? ' Rx' : '';
            return `${p.planet}: ${p.degree.toFixed(2)}° ${p.sign}${rx}`;
          })
          .join('\n');

        return mcpResult(structuredData, humanText);
      }

      case 'get_next_eclipses': {
        const now = new Date();
        const jd = ephem.dateToJulianDay(now);

        const solarEclipse = eclipseCalc.findNextSolarEclipse(jd);
        const lunarEclipse = eclipseCalc.findNextLunarEclipse(jd);

        const timezone = natalChart?.location.timezone || 'UTC';

        const eclipses = [];
        const humanLines = [];

        if (solarEclipse) {
          eclipses.push({
            type: solarEclipse.type,
            eclipseType: solarEclipse.eclipseType,
            maxTime: solarEclipse.maxTime.toISOString(),
          });
          humanLines.push(
            `Next Solar Eclipse: ${TimeFormatter.formatInTimezone(solarEclipse.maxTime, timezone)} (${solarEclipse.eclipseType})`
          );
        }
        if (lunarEclipse) {
          eclipses.push({
            type: lunarEclipse.type,
            eclipseType: lunarEclipse.eclipseType,
            maxTime: lunarEclipse.maxTime.toISOString(),
          });
          humanLines.push(
            `Next Lunar Eclipse: ${TimeFormatter.formatInTimezone(lunarEclipse.maxTime, timezone)} (${lunarEclipse.eclipseType})`
          );
        }

        const structuredData = { timezone, eclipses };
        const humanText = eclipses.length === 0
          ? 'No eclipses found in the near future.'
          : `Upcoming Eclipses:\n\n${humanLines.join('\n')}`;

        return mcpResult(structuredData, humanText);
      }

      case 'get_server_status': {
        const statusData = {
          serverVersion: '1.0.0',
          hasNatalChart: natalChart !== null,
          natalChartName: natalChart?.name ?? null,
          natalChartTimezone: natalChart?.location.timezone ?? null,
          ephemerisInitialized: !!ephem.eph,
          stateModel: 'stateful-per-process',
        };

        const humanText = natalChart
          ? `Server ready. Natal chart loaded: ${natalChart.name} (${natalChart.location.timezone})`
          : 'Server ready. No natal chart loaded — call set_natal_chart first.';

        return mcpResult(statusData, humanText);
      }

      case 'generate_natal_chart': {
        if (!natalChart) {
          return mcpError(missingNatalChart());
        }

        const theme = (args.theme as 'light' | 'dark') || getDefaultTheme(natalChart.location.timezone);
        const format = (args.format as 'svg' | 'png' | 'webp') || 'svg';
        const outputPath = args.output_path as string | undefined;
        const chart = await chartRenderer.generateNatalChart(natalChart, theme, format);

        // Save to file if path provided
        if (outputPath) {
          if (format === 'svg') {
            await writeFile(outputPath, chart as string, 'utf-8');
          } else {
            await writeFile(outputPath, chart as Buffer);
          }
          return {
            content: [
              { type: 'text', text: `Natal Chart for ${natalChart.name} saved to: ${outputPath}` },
            ],
          };
        }

        if (format === 'svg') {
          return {
            content: [
              { type: 'text', text: `Natal Chart for ${natalChart.name}:` },
              { type: 'text', text: chart as string },
            ],
          };
        }

        // PNG or WebP - return as base64
        const base64 = (chart as Buffer).toString('base64');
        const mimeType = format === 'png' ? 'image/png' : 'image/webp';
        return {
          content: [
            {
              type: 'text',
              text: `Natal Chart for ${natalChart.name} (${theme} theme, ${format.toUpperCase()} format):`,
            },
            { type: 'image', data: base64, mimeType },
          ],
        };
      }

      case 'generate_transit_chart': {
        if (!natalChart) {
          return mcpError(missingNatalChart());
        }

        const dateStr = args.date as string | undefined;
        const theme = (args.theme as 'light' | 'dark' | undefined) ?? getDefaultTheme(natalChart.location.timezone);
        const format = (args.format as 'svg' | 'png' | 'webp' | undefined) ?? 'svg';

        let targetDate: Date;
        if (dateStr) {
          try {
            const parsed = parseDateOnlyInput(dateStr);
            targetDate = localToUTC(parsed, natalChart.location.timezone);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid date format';
            return mcpError({ code: 'INVALID_INPUT', message, retryable: false });
          }
        } else {
          // No date provided: use today at local noon for consistency with date-only workflows
          const now = new Date();
          const localNow = utcToLocal(now, natalChart.location.timezone);
          const localNoon = { ...localNow, hour: 12, minute: 0, second: 0 };
          targetDate = localToUTC(localNoon, natalChart.location.timezone);
        }

        const outputPath = args.output_path as string | undefined;
        const chart = await chartRenderer.generateTransitChart(
          natalChart,
          targetDate,
          theme,
          format
        );

        // Format date label for output
        const dateLabel = TimeFormatter.formatDateOnly(targetDate, natalChart.location.timezone);

        // Save to file if path provided
        if (outputPath) {
          if (format === 'svg') {
            await writeFile(outputPath, chart as string, 'utf-8');
          } else {
            await writeFile(outputPath, chart as Buffer);
          }
          return {
            content: [
              {
                type: 'text',
                text: `Transit Chart for ${natalChart.name} (${dateLabel}) saved to ${outputPath}`,
              },
            ],
          };
        }

        // Return chart based on format
        if (format === 'svg') {
          return {
            content: [
              {
                type: 'text',
                text: `Transit Chart for ${natalChart.name} (${dateLabel})`,
              },
              { type: 'text', text: chart as string },
            ],
          };
        }

        // PNG or WebP - return as base64
        const base64 = (chart as Buffer).toString('base64');
        const mimeType = format === 'png' ? 'image/png' : 'image/webp';
        return {
          content: [
            {
              type: 'text',
              text: `Transit Chart for ${natalChart.name} (${dateLabel}, ${theme} theme, ${format.toUpperCase()} format):`,
            },
            { type: 'image', data: base64, mimeType },
          ],
        };
      }

      default:
        return mcpError({
          code: 'INVALID_INPUT',
          message: `Unknown tool: ${name}`,
          retryable: false,
          suggestedFix: 'Check the tool name against the list returned by ListTools.',
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Map known error patterns to appropriate codes
    let code: import('./tool-result.js').ToolIssueCode;
    if (errorMessage.includes('Invalid timezone') || errorMessage.includes('timezone')) {
      code = 'INVALID_TIMEZONE';
    } else if (errorMessage.includes('Invalid house system')) {
      code = 'INVALID_HOUSE_SYSTEM';
    } else if (errorMessage.includes('Ephemeris') || errorMessage.includes('ephemeris')) {
      code = 'EPHEMERIS_COMPUTE_FAILED';
    } else if (errorMessage.includes('write') || errorMessage.includes('ENOENT') || errorMessage.includes('EACCES')) {
      code = 'FILE_WRITE_FAILED';
    } else if (errorMessage.includes('render') || errorMessage.includes('chart')) {
      code = 'CHART_RENDER_FAILED';
    } else {
      code = 'INTERNAL_ERROR';
    }
    
    return mcpError({
      code,
      message: errorMessage,
      retryable: code === 'EPHEMERIS_COMPUTE_FAILED' || code === 'FILE_WRITE_FAILED',
      details: { tool: name },
    });
  }
});

export async function main() {
  logger.info('Initializing Swiss Ephemeris');
  await ephem.init();
  logger.info('Ephemeris initialized');

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Astro MCP server running on stdio');
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
