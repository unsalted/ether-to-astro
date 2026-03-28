# Setup Guide

This guide is for using `ether-to-astro` as a product, not for local development on the repo itself.

For contributor setup, local builds, tests, and release workflow, see [DEVELOPER.md](/Users/salted/Code/astro-mcp/DEVELOPER.md).

## Quick Start

### Use as an MCP server

Add this to your MCP client config:

```json
{
  "mcpServers": {
    "astro": {
      "command": "npx",
      "args": ["--yes", "--package=ether-to-astro", "e2a-mcp"]
    }
  }
}
```

Alternative after global install:

```json
{
  "mcpServers": {
    "astro": {
      "command": "e2a-mcp"
    }
  }
}
```

Then restart your MCP client and call `set_natal_chart` before requesting transits or charts.

### Use as a CLI

Run directly with `npx`:

```bash
npx --yes --package=ether-to-astro e2a --help
```

Or install globally:

```bash
npm install -g ether-to-astro
e2a --help
e2a-mcp --help
```

## Notes

- You do not need to run `npm run build` when installing from npm.
- `npx e2a` does not work by itself because npm resolves package names first. Use `npx --package=ether-to-astro e2a`.
- The package downloads Swiss Ephemeris data during install unless you choose `EPHEMERIS_VERSION=moshier`.

## Ephemeris Data Options

The package downloads Swiss Ephemeris data files during installation. You can control which version with `EPHEMERIS_VERSION`.

- `long` (default): 6000 years, recommended for professional use
- `short`: 600 years, smaller download for modern charts
- `moshier`: no ephemeris download, lower precision fallback

Examples:

```bash
npm install -g ether-to-astro
EPHEMERIS_VERSION=short npm install -g ether-to-astro
EPHEMERIS_VERSION=moshier npm install -g ether-to-astro
```

## First Use

Typical flow:

1. Start the MCP server or use the CLI.
2. Set the natal chart.
3. Request transits, houses, or chart rendering.

Example CLI call:

```bash
npx --yes --package=ether-to-astro e2a set-natal-chart \
  --name "Test" \
  --year 1990 \
  --month 1 \
  --day 1 \
  --hour 12 \
  --minute 0 \
  --latitude 40.7 \
  --longitude -74.0 \
  --timezone America/New_York
```

Then:

```bash
npx --yes --package=ether-to-astro e2a get-transits --natal-file ./natal.json --date 2026-03-27 --pretty
```

## Product Surfaces

- `e2a-mcp`: stateful MCP server
- `e2a`: stateless CLI

## Available Tools

- `set_natal_chart`
- `get_transits`
- `get_houses`
- `get_retrograde_planets`
- `get_rise_set_times`
- `get_asteroid_positions`
- `get_next_eclipses`
- `generate_natal_chart`
- `generate_transit_chart`
- `get_server_status`
