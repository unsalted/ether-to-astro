# Quick Setup Guide

## Installation

```bash
./setup.sh
```

This will:
1. Install npm dependencies (including WebAssembly Swiss Ephemeris)
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
      "command": "node",
      "args": ["/Users/salted/Code/astro-mcp/dist/index.js"]
    }
  }
}
```

**Important**: Replace `/Users/salted/Code/astro-mcp` with your actual path!

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
- `get_daily_transits` - Current planetary positions
- `get_moon_transits` - Moon aspects to natal planets
- `get_personal_planet_transits` - Sun/Mercury/Venus/Mars aspects
- `get_outer_planet_transits` - Jupiter/Saturn/Uranus/Neptune/Pluto aspects
- `get_exact_transit_times` - Calculate exact times for current transits
- `get_upcoming_transits` - Multi-day forecast (default 7 days)

## Technical Notes

- Uses WebAssembly Swiss Ephemeris (no native compilation!)
- Moshier mode provides ~1 arcsecond precision
- No ephemeris data files needed
- Works on Mac/Linux (Node.js required)
