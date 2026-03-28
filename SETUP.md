# Quick Setup Guide

## Installation

```bash
./setup.sh
```

This will:
1. Install npm dependencies (including native `sweph`)
2. Build TypeScript to JavaScript

## Add to Claude Desktop

Edit your Claude Desktop config file:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add this MCP server:

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

Alternative (after global install):

```json
{
  "mcpServers": {
    "astro": {
      "command": "e2a-mcp"
    }
  }
}
```

## First Use

1. Restart Claude Desktop
2. Set your wife's natal chart:

```
Please set my natal chart:
- Name: [Name]
- Birth: [Month] [Day], [Year] at [Hour]:[Minute] 
- Location: [City] ([Latitude], [Longitude])
- Timezone: [e.g., America/Los_Angeles]
```

3. Query transits:

```
What are my transits today?
Show me upcoming transits this week
When will the Moon conjunct my Venus be exact?
```

## MCP Tools Available

- `set_natal_chart` - Store birth data
- `get_transits` - Category-filtered transit analysis with optional exact-time data
- `get_houses` - House cusps plus angles (ASC/MC)
- `get_retrograde_planets` - Current retrograde status
- `get_rise_set_times` - Rise/set and meridian events
- `get_asteroid_positions` - Asteroids and nodes
- `get_next_eclipses` - Next solar/lunar eclipses
- `generate_natal_chart` - Render natal chart (SVG/PNG/WebP)
- `generate_transit_chart` - Render transit chart (SVG/PNG/WebP)
- `get_server_status` - MCP-side loaded-chart and service status

## Technical Notes

- Uses native `sweph` bindings for Swiss Ephemeris calculations
- Ephemeris files are downloaded/configured during install
- Works on macOS/Linux (Node.js 22+)
