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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AstroService } from './astro-service.js';
import { mapErrorMessageToToolIssueCode } from './error-mapping.js';
import { logger } from './logger.js';
import { getToolSpec, MCP_TOOL_SPECS } from './tool-registry.js';
import { mcpError, mcpResult, missingNatalChart } from './tool-result.js';
import type { NatalChart } from './types.js';

const server = new Server(
  {
    name: 'e2a-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
const astroService = new AstroService();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: MCP_TOOL_SPECS.map((spec) => ({
      name: spec.name,
      description: spec.description,
      inputSchema: spec.inputSchema,
    })),
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
    const spec = getToolSpec(name);
    if (!spec) {
      return mcpError({
        code: 'INVALID_INPUT',
        message: `Unknown tool: ${name}`,
        retryable: false,
        suggestedFix: 'Check the tool name against the list returned by ListTools.',
      });
    }

    if (spec.requiresNatalChart && !natalChart) {
      return mcpError(missingNatalChart());
    }

    const result = await spec.execute(
      {
        service: astroService,
        natalChart,
      },
      args as Record<string, unknown>
    );

    if (result.kind === 'state') {
      if (result.natalChart !== undefined) {
        natalChart = result.natalChart;
      }
      return mcpResult(result.data, result.text);
    }

    return { content: result.content };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const code = mapErrorMessageToToolIssueCode(errorMessage);

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
  await astroService.init();
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
