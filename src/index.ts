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
import { ChartRenderer } from './charts.js';
import { getDefaultTheme } from './constants.js';
import { EclipseCalculator } from './eclipses.js';
import { EphemerisCalculator } from './ephemeris.js';
import { TimeFormatter } from './formatter.js';
import { HouseCalculator } from './houses.js';
import { logger } from './logger.js';
import { RiseSetCalculator } from './riseset.js';
import { TransitCalculator } from './transits.js';
import { missingNatalChart } from './tool-result.js';
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
  type TransitData,
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

// In-memory natal chart storage (scoped to server instance lifetime)
// Thread safety: Each MCP client connection spawns a separate Node.js process
// via stdio transport, so this global variable is isolated per client.
// No synchronization needed as requests are serialized within a single process.
let natalChart: NatalChart | null = null;

// Calculator instances (initialized on demand)
const ephem = new EphemerisCalculator();
const transitCalc = new TransitCalculator(ephem);
const houseCalc = new HouseCalculator(ephem);
const riseSetCalc = new RiseSetCalculator(ephem);
const eclipseCalc = new EclipseCalculator(ephem);
const chartRenderer = new ChartRenderer(ephem, houseCalc);
const formatter = new TimeFormatter();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'set_natal_chart',
        description:
          'Store natal chart data for transit calculations. Birth time should be LOCAL time at the birth location (not UTC). The server will convert to UTC using the timezone parameter and return verification details including Sun, Moon, Ascendant, and MC positions.',
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
          'Unified transit query with flexible filtering. Get transits between current/future planets and natal chart, with control over planet categories, date range, orb, and aspect filtering. This is the recommended tool for most transit queries.',
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
          'Generate a visual chart showing current transits overlaid on natal chart. Supports SVG, PNG, and WebP formats. Theme defaults to dark (6pm-6am) or light (6am-6pm) based on current time, but can be overridden with the theme parameter.',
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
        // Import time-utils at runtime to avoid circular dependencies
        const { localToUTC, utcToLocal } = await import('./time-utils.js');
        
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

        // Convert local birth time to UTC
        const utcDate = localToUTC(chart.birthDate, chart.location.timezone);
        const utcComponents = utcToLocal(utcDate, 'UTC');
        
        // Calculate Julian Day from UTC time
        const jd = ephem.dateToJulianDay(utcDate);
        
        // Calculate planet positions
        const planetIds = Object.values(PLANETS);
        const positions = ephem.getAllPlanets(jd, planetIds);
        
        // Determine house system (default to Placidus, or Whole Sign for polar latitudes)
        let houseSystem: HouseSystem = (args.house_system as HouseSystem) || 'P';
        const isPolar = Math.abs(chart.location.latitude) > 66;
        
        // For polar latitudes, suggest Whole Sign if not specified
        if (isPolar && !args.house_system) {
          houseSystem = 'W'; // Whole Sign works at all latitudes
        }
        
        // Calculate houses for verification
        const houses = houseCalc.calculateHouses(
          jd,
          chart.location.latitude,
          chart.location.longitude,
          houseSystem
        );

        // Store chart with all calculated data
        natalChart = {
          ...chart,
          planets: positions,
          julianDay: jd,
          houseSystem,
          utcDateTime: utcComponents,
        };
        
        // Return detailed verification feedback
        const sun = positions.find(p => p.planet === 'Sun');
        const moon = positions.find(p => p.planet === 'Moon');
        
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
          `- Sun: ${formatDegree(sun?.longitude || 0)}`,
          `- Moon: ${formatDegree(moon?.longitude || 0)}`,
          `- Ascendant: ${formatDegree(houses.ascendant)}`,
          `- MC: ${formatDegree(houses.mc)}`,
          '',
          `House System: ${systemNames[houseSystem] || houseSystem}`,
        ];
        
        if (isPolar) {
          feedback.push('', `Note: Polar latitude detected (${chart.location.latitude.toFixed(1)}°). Using ${systemNames[houseSystem]} house system.`);
        }

        return {
          content: [
            {
              type: 'text',
              text: feedback.join('\n'),
            },
          ],
        };
      }

      case 'get_moon_transits': {
        /**
         * Get Moon transits to natal planets
         * 
         * @remarks
         * Focuses on Moon aspects which change frequently.
         * Useful for daily emotional and timing insights.
         */
        if (!natalChart) {
          const error = missingNatalChart();
          return {
            content: [
              { type: 'text', text: JSON.stringify({ ok: false, error }, null, 2) },
            ],
          };
        }

        // Parse parameters with defaults
        const dateStr = args.date as string | undefined;
        const categories = (args.categories as string[]) || ['all'];
        const includeMundane = (args.include_mundane as boolean) || false;
        const daysAhead = (args.days_ahead as number) || 0;
        const maxOrb = (args.max_orb as number) || 8;
        const exactOnly = (args.exact_only as boolean) || false;
        const applyingOnly = (args.applying_only as boolean) || false;

        // Determine which planets to include
        let transitingPlanetIds: number[] = [];
        if (categories.includes('all')) {
          transitingPlanetIds = Object.values(PLANETS);
        } else {
          if (categories.includes('moon')) {
            transitingPlanetIds.push(PLANETS.MOON);
          }
          if (categories.includes('personal')) {
            transitingPlanetIds.push(...PERSONAL_PLANETS.filter(p => p !== PLANETS.MOON));
          }
          if (categories.includes('outer')) {
            transitingPlanetIds.push(...OUTER_PLANETS);
          }
        }

        // Parse date or use today
        const targetDate = dateStr
          ? new Date(dateStr + 'T12:00:00Z')
          : new Date();

        // Collect transits across date range
        const allTransits: Transit[] = [];
        
        for (let day = 0; day <= daysAhead; day++) {
          const date = new Date(targetDate);
          date.setDate(date.getDate() + day);
          const jd = ephem.dateToJulianDay(date);

          const transitingPlanets = ephem.getAllPlanets(jd, transitingPlanetIds);
          const transits = transitCalc.findTransits(transitingPlanets, natalChart.planets || [], jd);

          allTransits.push(...transits);
        }

        // Deduplicate
        const seen = new Set<string>();
        let filteredTransits = allTransits.filter((t) => {
          const key = `${t.transitingPlanet}-${t.natalPlanet}-${t.aspect}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Apply filters
        filteredTransits = filteredTransits.filter(t => t.orb <= maxOrb);
        
        if (exactOnly) {
          filteredTransits = filteredTransits.filter(t => t.exactTime !== undefined);
        }
        
        if (applyingOnly) {
          filteredTransits = filteredTransits.filter(t => t.isApplying);
        }

        // Sort by orb
        filteredTransits.sort((a, b) => a.orb - b.orb);

        const timezone = natalChart.location.timezone;

        // Build structured response
        const structuredData: TransitResponse = {
          date: targetDate.toISOString().split('T')[0],
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

        // If include_mundane, also add current planetary positions
        let responseData: any = structuredData;
        let mundaneText = '';
        
        if (includeMundane) {
          const currentJD = ephem.dateToJulianDay(targetDate);
          const currentPositions = ephem.getAllPlanets(currentJD, transitingPlanetIds);
          
          const mundaneData: PlanetPositionResponse = {
            date: targetDate.toISOString().split('T')[0],
            timezone,
            positions: currentPositions,
          };
          
          responseData = { transits: structuredData, mundane: mundaneData };
          
          mundaneText = '\n\nCurrent Planetary Positions:\n\n' + currentPositions
            .map(p => `${p.planet}: ${p.degree.toFixed(1)}° ${p.sign} (${p.isRetrograde ? 'Rx' : 'Direct'})`)
            .join('\n');
        }

        // Build human-readable text
        if (filteredTransits.length === 0 && !includeMundane) {
          return {
            content: [
              { type: 'text', text: JSON.stringify(structuredData, null, 2) },
              { type: 'text', text: '\n\nNo transits found matching the specified criteria.' },
            ],
          };
        }

        const humanText = filteredTransits
          .map((t) => {
            const exactStr = t.exactTime
              ? ` - Exact: ${TimeFormatter.formatInTimezone(t.exactTime, timezone)}`
              : '';
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
          })
          .join('\n');

        const rangeStr = daysAhead > 0 ? ` (next ${daysAhead + 1} days)` : '';
        const transitHeader = filteredTransits.length > 0 ? `\n\nTransits${rangeStr}:\n\n${humanText}` : '';
        
        return {
          content: [
            { type: 'text', text: JSON.stringify(responseData, null, 2) },
            { type: 'text', text: transitHeader + mundaneText },
          ],
        };
      }

      case 'get_planet_positions': {
        /**
         * Get current planetary positions
         * 
         * @remarks
         * Returns positions for all planets at specified date.
         * Includes zodiac signs, degrees, and retrograde status.
         */
        const dateStr = args.date as string | undefined;
        const categories = (args.categories as string[]) || ['all'];
        const includeMundane = (args.include_mundane as boolean) || false;
        const daysAhead = (args.days_ahead as number) || 0;
        const maxOrb = (args.max_orb as number) || 8;

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const allPlanetIds = Object.values(PLANETS);
        const positions = ephem.getAllPlanets(jd, allPlanetIds);

        const output = positions
          .map((p) => {
            const rx = p.isRetrograde ? ' Rx' : '';
            return `${p.planet}: ${p.degree.toFixed(2)}° ${p.sign}${rx}`;
          })
          .join('\n');

        return {
          content: [{ type: 'text', text: `Planetary Positions:\n\n${output}` }],
        };
      }

      case 'get_personal_planet_transits': {
        /**
         * Get transits from personal planets
         * 
         * @remarks
         * Includes Sun, Mercury, Venus, Mars transits.
         * Represents personal, day-to-day influences.
         */
        if (!natalChart) {
          const error = missingNatalChart();
          return {
            content: [
              { type: 'text', text: JSON.stringify({ ok: false, error }, null, 2) },
            ],
          };
        }

        // Parse parameters with defaults
        const dateStr = args.date as string | undefined;
        const categories = (args.categories as string[]) || ['all'];
        const includeMundane = (args.include_mundane as boolean) || false;
        const daysAhead = (args.days_ahead as number) || 0;
        const maxOrb = (args.max_orb as number) || 8;
        const exactOnly = (args.exact_only as boolean) || false;
        const applyingOnly = (args.applying_only as boolean) || false;

        // Determine which planets to include
        let transitingPlanetIds: number[] = [];
        if (categories.includes('all')) {
          transitingPlanetIds = Object.values(PLANETS);
        } else {
          if (categories.includes('moon')) {
            transitingPlanetIds.push(PLANETS.MOON);
          }
          if (categories.includes('personal')) {
            transitingPlanetIds.push(...PERSONAL_PLANETS.filter(p => p !== PLANETS.MOON));
          }
          if (categories.includes('outer')) {
            transitingPlanetIds.push(...OUTER_PLANETS);
          }
        }

        // Parse date or use today
        const targetDate = dateStr
          ? new Date(dateStr + 'T12:00:00Z')
          : new Date();

        // Collect transits across date range
        const allTransits: Transit[] = [];
        
        for (let day = 0; day <= daysAhead; day++) {
          const date = new Date(targetDate);
          date.setDate(date.getDate() + day);
          const jd = ephem.dateToJulianDay(date);

          const transitingPlanets = ephem.getAllPlanets(jd, transitingPlanetIds);
          const transits = transitCalc.findTransits(transitingPlanets, natalChart.planets || [], jd);

          allTransits.push(...transits);
        }

        // Deduplicate
        const seen = new Set<string>();
        let filteredTransits = allTransits.filter((t) => {
          const key = `${t.transitingPlanet}-${t.natalPlanet}-${t.aspect}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Apply filters
        filteredTransits = filteredTransits.filter(t => t.orb <= maxOrb);
        
        if (exactOnly) {
          filteredTransits = filteredTransits.filter(t => t.exactTime !== undefined);
        }
        
        if (applyingOnly) {
          filteredTransits = filteredTransits.filter(t => t.isApplying);
        }

        // Sort by orb
        filteredTransits.sort((a, b) => a.orb - b.orb);

        const timezone = natalChart.location.timezone;

        // Build structured response
        const structuredData: TransitResponse = {
          date: targetDate.toISOString().split('T')[0],
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

        // If include_mundane, also add current planetary positions
        let responseData: any = structuredData;
        let mundaneText = '';
        
        if (includeMundane) {
          const currentJD = ephem.dateToJulianDay(targetDate);
          const currentPositions = ephem.getAllPlanets(currentJD, transitingPlanetIds);
          
          const mundaneData: PlanetPositionResponse = {
            date: targetDate.toISOString().split('T')[0],
            timezone,
            positions: currentPositions,
          };
          
          responseData = { transits: structuredData, mundane: mundaneData };
          
          mundaneText = '\n\nCurrent Planetary Positions:\n\n' + currentPositions
            .map(p => `${p.planet}: ${p.degree.toFixed(1)}° ${p.sign} (${p.isRetrograde ? 'Rx' : 'Direct'})`)
            .join('\n');
        }

        // Build human-readable text
        if (filteredTransits.length === 0 && !includeMundane) {
          return {
            content: [
              { type: 'text', text: JSON.stringify(structuredData, null, 2) },
              { type: 'text', text: '\n\nNo transits found matching the specified criteria.' },
            ],
          };
        }

        const humanText = filteredTransits
          .map((t) => {
            const exactStr = t.exactTime
              ? ` - Exact: ${TimeFormatter.formatInTimezone(t.exactTime, timezone)}`
              : '';
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
          })
          .join('\n');

        const rangeStr = daysAhead > 0 ? ` (next ${daysAhead + 1} days)` : '';
        const transitHeader = filteredTransits.length > 0 ? `\n\nTransits${rangeStr}:\n\n${humanText}` : '';
        
        return {
          content: [
            { type: 'text', text: JSON.stringify(responseData, null, 2) },
            { type: 'text', text: transitHeader + mundaneText },
          ],
        };
      }

      case 'get_exact_transit_times': {
        /**
         * Calculate exact times when transits become perfect
         * 
         * @remarks
         * Finds precise times when aspects reach 0° orb.
         * Uses binary search for accuracy within specified tolerance.
         */
        if (!natalChart) {
          const error = missingNatalChart();
          return {
            content: [
              { type: 'text', text: JSON.stringify({ ok: false, error }, null, 2) },
            ],
          };
        }

        // Parse parameters with defaults
        const dateStr = args.date as string | undefined;
        const categories = (args.categories as string[]) || ['all'];
        const includeMundane = (args.include_mundane as boolean) || false;
        const daysAhead = (args.days_ahead as number) || 0;
        const maxOrb = (args.max_orb as number) || 8;
        const exactOnly = (args.exact_only as boolean) || false;
        const applyingOnly = (args.applying_only as boolean) || false;

        // Determine which planets to include
        let transitingPlanetIds: number[] = [];
        if (categories.includes('all')) {
          transitingPlanetIds = Object.values(PLANETS);
        } else {
          if (categories.includes('moon')) {
            transitingPlanetIds.push(PLANETS.MOON);
          }
          if (categories.includes('personal')) {
            transitingPlanetIds.push(...PERSONAL_PLANETS.filter(p => p !== PLANETS.MOON));
          }
          if (categories.includes('outer')) {
            transitingPlanetIds.push(...OUTER_PLANETS);
          }
        }

        // Parse date or use today
        const targetDate = dateStr
          ? new Date(dateStr + 'T12:00:00Z')
          : new Date();

        // Collect transits across date range
        const allTransits: Transit[] = [];
        
        for (let day = 0; day <= daysAhead; day++) {
          const date = new Date(targetDate);
          date.setDate(date.getDate() + day);
          const jd = ephem.dateToJulianDay(date);

          const transitingPlanets = ephem.getAllPlanets(jd, transitingPlanetIds);
          const transits = transitCalc.findTransits(transitingPlanets, natalChart.planets || [], jd);

          allTransits.push(...transits);
        }

        // Deduplicate
        const seen = new Set<string>();
        let filteredTransits = allTransits.filter((t) => {
          const key = `${t.transitingPlanet}-${t.natalPlanet}-${t.aspect}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Apply filters
        filteredTransits = filteredTransits.filter(t => t.orb <= maxOrb);
        
        if (exactOnly) {
          filteredTransits = filteredTransits.filter(t => t.exactTime !== undefined);
        }
        
        if (applyingOnly) {
          filteredTransits = filteredTransits.filter(t => t.isApplying);
        }

        // Sort by orb
        filteredTransits.sort((a, b) => a.orb - b.orb);

        const timezone = natalChart.location.timezone;

        // Build structured response
        const structuredData: TransitResponse = {
          date: targetDate.toISOString().split('T')[0],
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

        // If include_mundane, also add current planetary positions
        let responseData: any = structuredData;
        let mundaneText = '';
        
        if (includeMundane) {
          const currentJD = ephem.dateToJulianDay(targetDate);
          const currentPositions = ephem.getAllPlanets(currentJD, transitingPlanetIds);
          
          const mundaneData: PlanetPositionResponse = {
            date: targetDate.toISOString().split('T')[0],
            timezone,
            positions: currentPositions,
          };
          
          responseData = { transits: structuredData, mundane: mundaneData };
          
          mundaneText = '\n\nCurrent Planetary Positions:\n\n' + currentPositions
            .map(p => `${p.planet}: ${p.degree.toFixed(1)}° ${p.sign} (${p.isRetrograde ? 'Rx' : 'Direct'})`)
            .join('\n');
        }

        // Build human-readable text
        if (filteredTransits.length === 0 && !includeMundane) {
          return {
            content: [
              { type: 'text', text: JSON.stringify(structuredData, null, 2) },
              { type: 'text', text: '\n\nNo transits found matching the specified criteria.' },
            ],
          };
        }

        const humanText = filteredTransits
          .map((t) => {
            const exactStr = t.exactTime
              ? ` - Exact: ${TimeFormatter.formatInTimezone(t.exactTime, timezone)}`
              : '';
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
          })
          .join('\n');

        const rangeStr = daysAhead > 0 ? ` (next ${daysAhead + 1} days)` : '';
        const transitHeader = filteredTransits.length > 0 ? `\n\nTransits${rangeStr}:\n\n${humanText}` : '';
        
        return {
          content: [
            { type: 'text', text: JSON.stringify(responseData, null, 2) },
            { type: 'text', text: transitHeader + mundaneText },
          ],
        };
      }

      case 'get_asteroid_positions': {
        /**
         * Get positions for major asteroids
         * 
         * @remarks
         * Returns positions for Chiron, Ceres, Pallas, Juno, Vesta.
         * Useful for detailed astrological analysis.
         */
        if (!natalChart) {
          const error = missingNatalChart();
          return {
            content: [
              { type: 'text', text: JSON.stringify({ ok: false, error }, null, 2) },
            ],
          };
        }

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const asteroidIds = [...ASTEROIDS, ...NODES];
        const positions = ephem.getAllPlanets(jd, asteroidIds);

        const output = positions
          .map((p) => {
            const rx = p.isRetrograde ? ' Rx' : '';
            return `${p.planet}: ${p.degree.toFixed(2)}° ${p.sign}${rx}`;
          })
          .join('\n');

        return {
          content: [{ type: 'text', text: `Asteroid & Node Positions:\n\n${output}` }],
        };
      }

      case 'get_sunrise_sunset': {
        /**
         * Get sunrise and sunset times
         * 
         * @remarks
         * Returns rise/set times for the Sun.
         * Most commonly requested astronomical data.
         */
        if (!natalChart) {
          const error = missingNatalChart();
          return {
            content: [
              { type: 'text', text: JSON.stringify({ ok: false, error }, null, 2) },
            ],
          };
        }

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);

        const solarEclipse = eclipseCalc.findNextSolarEclipse(jd);
        const lunarEclipse = eclipseCalc.findNextLunarEclipse(jd);

        const timezone = natalChart?.location.timezone || 'UTC';

        const output = [];

        if (solarEclipse) {
          output.push(
            `Next Solar Eclipse: ${TimeFormatter.formatInTimezone(solarEclipse.date, timezone)}`
          );
        }

        if (lunarEclipse) {
          output.push(
            `Next Lunar Eclipse: ${TimeFormatter.formatInTimezone(lunarEclipse.date, timezone)}`
          );
        }

        if (output.length === 0) {
          return {
            content: [{ type: 'text', text: 'No eclipses found in the near future.' }],
          };
        }

        return {
          content: [{ type: 'text', text: `Upcoming Eclipses:\n\n${output.join('\n')}` }],
        };
      }

      case 'generate_natal_chart': {
        /**
         * Generate a visual natal chart wheel
         * 
         * @remarks
         * Creates an SVG/PNG/WebP chart with planets, houses, and aspects.
         * Uses time-based theme unless overridden. Can save to file.
         */
        if (!natalChart) {
          return {
            content: [
              {
                type: 'text',
                text: 'No natal chart found. Please set natal chart first using set_natal_chart.',
              },
            ],
          };
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
        /**
         * Generate a visual transit chart
         * 
         * @remarks
         * Shows current transits overlaid on natal chart.
         * Uses specified date or defaults to now.
         */
        if (!natalChart) {
          return {
            content: [
              {
                type: 'text',
                text: 'No natal chart found. Please set natal chart first using set_natal_chart.',
              },
            ],
          };
        }

        // Parse date string as UTC noon to avoid timezone shifts
        // Date-only ISO strings like "2026-03-27" can parse as local midnight
        const transitDate = args.date 
          ? new Date((args.date as string) + 'T12:00:00Z')
          : undefined;
        const theme = (args.theme as 'light' | 'dark') || getDefaultTheme(natalChart.location.timezone);
        const format = (args.format as 'svg' | 'png' | 'webp') || 'svg';
        const outputPath = args.output_path as string | undefined;
        const chart = await chartRenderer.generateTransitChart(
          natalChart,
          transitDate || new Date(),
          theme,
          format
        );

        const dateStr = transitDate
          ? TimeFormatter.formatDateOnly(transitDate, natalChart.location.timezone)
          : 'Current';

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
                text: `Transit Chart for ${natalChart.name} (${dateStr}) saved to: ${outputPath}`,
              },
            ],
          };
        }

        if (format === 'svg') {
          return {
            content: [
              { type: 'text', text: `Transit Chart for ${natalChart.name} (${dateStr}):` },
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
              text: `Transit Chart for ${natalChart.name} (${dateStr}, ${theme} theme, ${format.toUpperCase()} format):`,
            },
            { type: 'image', data: base64, mimeType },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        { type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` },
      ],
      isError: true,
    };
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
