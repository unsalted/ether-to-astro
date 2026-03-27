import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { writeFile } from 'fs/promises';
import { ChartRenderer } from './charts.js';
import { ErrorCategory, getDefaultTheme } from './constants.js';
import { EclipseCalculator } from './eclipses.js';
import { EphemerisCalculator } from './ephemeris.js';
import { TimeFormatter } from './formatter.js';
import { HouseCalculator } from './houses.js';
import { logger } from './logger.js';
import { RiseSetCalculator } from './riseset.js';
import { ChartStorage } from './storage.js';
import { TransitCalculator } from './transits.js';
import {
  ASTEROIDS,
  type NatalChart,
  NODES,
  OUTER_PLANETS,
  PERSONAL_PLANETS,
  PLANETS,
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

const ephem = new EphemerisCalculator();
const transitCalc = new TransitCalculator(ephem);
const storage = new ChartStorage(ephem);
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
          'Store natal chart data for transit calculations. Requires birth date, time, and location.',
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
            hour: { type: 'number', description: 'Birth hour (0-23, UTC)' },
            minute: { type: 'number', description: 'Birth minute' },
            latitude: { type: 'number', description: 'Birth location latitude' },
            longitude: { type: 'number', description: 'Birth location longitude' },
            timezone: { type: 'string', description: 'Timezone (e.g., America/Los_Angeles)' },
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
        name: 'get_daily_transits',
        description: 'Get all current planetary positions (mundane transits) for today',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_moon_transits',
        description: 'Get Moon transits to natal chart planets for today',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_personal_planet_transits',
        description:
          'Get transits from personal planets (Sun, Mercury, Venus, Mars) to natal chart',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_outer_planet_transits',
        description:
          'Get transits from outer planets (Jupiter, Saturn, Uranus, Neptune, Pluto) to natal chart',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_upcoming_transits',
        description:
          'Get upcoming transits within orb (approaching within 2 degrees) for the next several days',
        inputSchema: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Number of days to look ahead (default: 7)',
              default: 7,
            },
          },
        },
      },
      {
        name: 'get_exact_transit_times',
        description: 'Calculate exact times when current transits become exact (0° orb)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_houses',
        description:
          'Calculate house cusps, Ascendant, and Midheaven for current time or natal chart',
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'set_natal_chart': {
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
        await storage.saveNatalChart(chart);
        return {
          content: [
            {
              type: 'text',
              text: `Natal chart saved for ${chart.name}. Birth chart calculated and stored.`,
            },
          ],
        };
      }

      case 'get_daily_transits': {
        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const planetIds = Object.values(PLANETS);
        const positions = ephem.getAllPlanets(jd, planetIds);

        const natalChart = await storage.loadNatalChart();
        const timezone = natalChart?.location.timezone || 'UTC';
        const dateStr = TimeFormatter.formatDateOnly(now, timezone);

        const output = positions
          .map((p) => `${p.planet}: ${p.degree.toFixed(2)}° ${p.sign} (${p.longitude.toFixed(2)}°)`)
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Current Planetary Positions (${dateStr}):\n\n${output}`,
            },
          ],
        };
      }

      case 'get_moon_transits': {
        const natalChart = await storage.loadNatalChart();
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

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const moonPos = ephem.getPlanetPosition(PLANETS.MOON, jd);

        const transits = transitCalc.findTransits([moonPos], natalChart.planets || [], jd);

        if (transits.length === 0) {
          return {
            content: [{ type: 'text', text: 'No Moon transits within orb today.' }],
          };
        }

        const timezone = natalChart.location.timezone;
        const output = transits
          .map((t) => {
            const exactStr = t.exactTime
              ? ` - Exact: ${TimeFormatter.formatInTimezone(t.exactTime, timezone)}`
              : '';
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `Moon ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
          })
          .join('\n');

        return {
          content: [{ type: 'text', text: `Moon Transits:\n\n${output}` }],
        };
      }

      case 'get_personal_planet_transits': {
        const natalChart = await storage.loadNatalChart();
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

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const personalPlanets = ephem.getAllPlanets(jd, PERSONAL_PLANETS);

        const transits = transitCalc.findTransits(personalPlanets, natalChart.planets || [], jd);

        if (transits.length === 0) {
          return {
            content: [{ type: 'text', text: 'No personal planet transits within orb today.' }],
          };
        }

        const timezone = natalChart.location.timezone;
        const output = transits
          .map((t) => {
            const exactStr = t.exactTime
              ? ` - Exact: ${TimeFormatter.formatInTimezone(t.exactTime, timezone)}`
              : '';
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
          })
          .join('\n');

        return {
          content: [{ type: 'text', text: `Personal Planet Transits:\n\n${output}` }],
        };
      }

      case 'get_outer_planet_transits': {
        const natalChart = await storage.loadNatalChart();
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

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const outerPlanets = ephem.getAllPlanets(jd, OUTER_PLANETS);

        const transits = transitCalc.findTransits(outerPlanets, natalChart.planets || [], jd);

        if (transits.length === 0) {
          return {
            content: [{ type: 'text', text: 'No outer planet transits within orb today.' }],
          };
        }

        const timezone = natalChart.location.timezone;
        const output = transits
          .map((t) => {
            const exactStr = t.exactTime
              ? ` - Exact: ${TimeFormatter.formatInTimezone(t.exactTime, timezone)}`
              : '';
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
          })
          .join('\n');

        return {
          content: [{ type: 'text', text: `Outer Planet Transits:\n\n${output}` }],
        };
      }

      case 'get_upcoming_transits': {
        const natalChart = await storage.loadNatalChart();
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

        const days = (args.days as number) || 7;
        const allPlanetIds = Object.values(PLANETS);
        const upcomingTransits = transitCalc.getUpcomingTransits(allPlanetIds, natalChart, days);

        if (upcomingTransits.length === 0) {
          return {
            content: [
              { type: 'text', text: `No transits approaching within 2° in the next ${days} days.` },
            ],
          };
        }

        const timezone = natalChart.location.timezone;
        const output = upcomingTransits
          .map((t) => {
            const exactStr = t.exactTime
              ? ` - Exact: ${TimeFormatter.formatInTimezone(t.exactTime, timezone)}`
              : '';
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: ${t.orb.toFixed(2)}° orb ${applyStr}${exactStr}`;
          })
          .join('\n');

        return {
          content: [{ type: 'text', text: `Upcoming Transits (next ${days} days):\n\n${output}` }],
        };
      }

      case 'get_exact_transit_times': {
        const natalChart = await storage.loadNatalChart();
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

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const allPlanetIds = Object.values(PLANETS);
        const currentPlanets = ephem.getAllPlanets(jd, allPlanetIds);

        const transits = transitCalc.findTransits(currentPlanets, natalChart.planets || [], jd);
        const exactTransits = transits.filter((t) => t.exactTime !== undefined);

        if (exactTransits.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No transits close enough to calculate exact times (must be within 2° orb).',
              },
            ],
          };
        }

        const timezone = natalChart.location.timezone;
        const output = exactTransits
          .map((t) => {
            const applyStr = t.isApplying ? '(applying)' : '(separating)';
            return `${t.transitingPlanet} ${t.aspect} ${t.natalPlanet}: Exact at ${TimeFormatter.formatInTimezone(t.exactTime!, timezone)} ${applyStr}`;
          })
          .join('\n');

        return {
          content: [{ type: 'text', text: `Exact Transit Times:\n\n${output}` }],
        };
      }

      case 'get_houses': {
        const natalChart = await storage.loadNatalChart();
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

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const system = (args.system as string) || 'P';

        const houses = houseCalc.calculateHouses(
          jd,
          natalChart.location.latitude,
          natalChart.location.longitude,
          system
        );

        const systemNames: { [key: string]: string } = {
          P: 'Placidus',
          K: 'Koch',
          W: 'Whole Sign',
          E: 'Equal',
        };

        const output = [
          `House System: ${systemNames[system] || system}`,
          `Ascendant: ${houseCalc.formatHousePosition(houses.ascendant)}`,
          `Midheaven: ${houseCalc.formatHousePosition(houses.mc)}`,
          '',
          'House Cusps:',
        ];

        houses.cusps.forEach((cusp, i) => {
          if (i > 0 && i <= 12) {
            output.push(`House ${i}: ${houseCalc.formatHousePosition(cusp)}`);
          }
        });

        return {
          content: [{ type: 'text', text: output.join('\n') }],
        };
      }

      case 'get_retrograde_planets': {
        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const allPlanetIds = Object.values(PLANETS);
        const positions = ephem.getAllPlanets(jd, allPlanetIds);

        const retrograde = positions.filter((p) => p.isRetrograde);

        if (retrograde.length === 0) {
          return {
            content: [{ type: 'text', text: 'No planets are currently retrograde.' }],
          };
        }

        const output = retrograde
          .map((p) => `${p.planet} Rx: ${p.degree.toFixed(2)}° ${p.sign}`)
          .join('\n');

        return {
          content: [{ type: 'text', text: `Retrograde Planets:\n\n${output}` }],
        };
      }

      case 'get_rise_set_times': {
        const natalChart = await storage.loadNatalChart();
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

        const now = new Date();
        const jd = ephem.dateToJulianDay(now);
        const timezone = natalChart.location.timezone;

        const sunTimes = riseSetCalc.calculateRiseSet(
          jd,
          PLANETS.SUN,
          natalChart.location.latitude,
          natalChart.location.longitude
        );

        const moonTimes = riseSetCalc.calculateRiseSet(
          jd,
          PLANETS.MOON,
          natalChart.location.latitude,
          natalChart.location.longitude
        );

        const output = [];

        if (sunTimes.rise) {
          output.push(`Sunrise: ${TimeFormatter.formatInTimezone(sunTimes.rise, timezone)}`);
        }
        if (sunTimes.set) {
          output.push(`Sunset: ${TimeFormatter.formatInTimezone(sunTimes.set, timezone)}`);
        }
        if (moonTimes.rise) {
          output.push(`Moonrise: ${TimeFormatter.formatInTimezone(moonTimes.rise, timezone)}`);
        }
        if (moonTimes.set) {
          output.push(`Moonset: ${TimeFormatter.formatInTimezone(moonTimes.set, timezone)}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: output.length > 0 ? output.join('\n') : 'Rise/set times not available',
            },
          ],
        };
      }

      case 'get_asteroid_positions': {
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

      case 'get_next_eclipses': {
        const now = new Date();
        const jd = ephem.dateToJulianDay(now);

        const solarEclipse = eclipseCalc.findNextSolarEclipse(jd);
        const lunarEclipse = eclipseCalc.findNextLunarEclipse(jd);

        const natalChart = await storage.loadNatalChart();
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
        const natalChart = await storage.loadNatalChart();
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

        const theme = (args.theme as 'light' | 'dark') || getDefaultTheme();
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
        const natalChart = await storage.loadNatalChart();
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

        const transitDate = args.date ? new Date(args.date as string) : undefined;
        const theme = (args.theme as 'light' | 'dark') || getDefaultTheme();
        const format = (args.format as 'svg' | 'png' | 'webp') || 'svg';
        const outputPath = args.output_path as string | undefined;
        const chart = await chartRenderer.generateTransitChart(
          natalChart,
          transitDate,
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
