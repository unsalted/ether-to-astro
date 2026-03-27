# Ether-to-Astro MCP Server

MCP server for astrology calculations and transit tracking using Swiss Ephemeris.

## Features

Your wife can ask her AI agent about:

### Transits
- **Daily mundane transits** - Current planetary positions
- **Moon transits** - Fast-moving Moon aspects to natal planets
- **Personal planet transits** - Sun, Mercury, Venus, Mars aspects to natal chart
- **Outer planet transits** - Jupiter, Saturn, Uranus, Neptune, Pluto aspects
- **Exact transit times** - Precise timing when transits become exact (0° orb)
- **Upcoming transits** - Multi-day forecast for transits approaching within 2°

### Advanced Features
- **House cusps** - Ascendant, Midheaven, and all 12 houses (multiple systems)
- **Retrograde status** - Which planets are currently retrograde
- **Rise/Set times** - Sunrise, sunset, moonrise, moonset
- **Asteroids & Nodes** - Chiron, Ceres, Pallas, Juno, Vesta, North Node
- **Eclipses** - Next solar and lunar eclipse dates
- **Visual Charts** - Generate SVG natal and transit chart wheels with aspects

## Installation

```bash
./setup.sh
```

### Ephemeris Data Configuration

The server downloads Swiss Ephemeris data files during installation. You can control which version using the `EPHEMERIS_VERSION` environment variable:

**Options:**
- `long` (default) - 6000 years (3000 BC - 3000 AD), ~5MB, recommended for professional use
- `short` - 600 years (1800-2400 AD), ~2MB, sufficient for modern charts
- `moshier` - No downloads, uses built-in Moshier approximation (lower precision)

**Examples:**
```bash
# Default (long version)
npm install

# Short version
EPHEMERIS_VERSION=short npm install

# Moshier only (no downloads)
EPHEMERIS_VERSION=moshier npm install
```

Or manually:
```bash
npm install
npm run build
```

## Setup

1. Run setup script or install manually (see above)

2. Add to your MCP settings (e.g., Claude Desktop config):

```json
{
  "mcpServers": {
    "astro": {
      "command": "node",
      "args": ["/path/to/ether-to-astro-mcp/dist/index.js"]
    }
  }
}
```

## How It Works

### In-Memory Storage
The MCP server uses **in-memory storage** for natal chart data:
- Each client connection gets its own Node.js process instance
- Natal chart is stored in RAM for the duration of the connection
- When you disconnect, the process exits and memory is automatically freed
- No files are created or persisted to disk
- Simply call `set_natal_chart` again when reconnecting

This design is **MCP-compliant** for stdio transport and ensures complete isolation between different clients.

### Time Handling
The server accepts **local birth time** (not UTC):
- Provide birth time in local time at the birth location
- Specify the IANA timezone (e.g., `America/New_York`, `Europe/London`)
- The server automatically converts to UTC and handles DST correctly
- Verification feedback shows both local and UTC times for confirmation

**Example:** Born October 17, 1977 at 1:06 PM in Beaver Falls, PA:
- Input: `hour: 13, minute: 6, timezone: 'America/New_York'`
- Server converts: 1:06 PM EDT → 5:06 PM UTC
- Calculates correct Moon sign (0° Capricorn) and Ascendant (0° Capricorn)

### House Systems
Supports multiple house systems:
- **Placidus** (default) - Most common in modern Western astrology
- **Whole Sign** - Traditional system, works at all latitudes
- **Koch** - Popular in Europe
- **Equal** - Simple 30° divisions

The server automatically uses Whole Sign for polar latitudes (>66°) where Placidus fails mathematically. You can specify your preferred system with the `house_system` parameter.

## Usage

### 1. Set Natal Chart (First Time)

```
Use the set_natal_chart tool with:
- name: "Your Name"
- year, month, day, hour, minute (birth time in UTC)
- latitude, longitude (birth location)
- timezone (e.g., "America/Los_Angeles")
```

### 2. Query Transits

Ask your AI agent:
- "What are today's transits?"
- "Show me Moon transits"
- "What outer planet transits are active?"
- "When will this transit be exact?"
- "What transits are coming up this week?"

## Tools Available

### Setup
- `set_natal_chart` - Store birth chart data

### Transits
- `get_daily_transits` - Current planetary positions (with retrograde indicators)
- `get_moon_transits` - Moon aspects to natal planets
- `get_personal_planet_transits` - Sun/Mercury/Venus/Mars aspects
- `get_outer_planet_transits` - Jupiter/Saturn/Uranus/Neptune/Pluto aspects
- `get_exact_transit_times` - Calculate exact aspect times
- `get_upcoming_transits` - Multi-day forecast (default 7 days)

### Advanced Tools
- `get_houses` - House cusps, Ascendant, Midheaven (Placidus, Koch, Whole Sign, Equal)
- `get_retrograde_planets` - Show which planets are retrograde
- `get_rise_set_times` - Sunrise, sunset, moonrise, moonset
- `get_asteroid_positions` - Chiron, Ceres, Pallas, Juno, Vesta, Nodes
- `get_next_eclipses` - Next solar and lunar eclipses

### Visual Charts
- `generate_natal_chart` - SVG natal chart wheel with planets, houses, and aspects
- `generate_transit_chart` - SVG chart with current transits overlaid on natal chart

## Technical Details

- **Engine**: WebAssembly Swiss Ephemeris (no native compilation needed!)
- **Accuracy**: Moshier mode (~1 arcsecond precision)
- **Chart Rendering**: @astrodraw/astrochart with JSDOM for server-side SVG generation
- **Orb settings**: 
  - Conjunction/Opposition: 8°
  - Square: 7°
  - Trine: 7°
  - Sextile: 6°
- **Aspects tracked**: Conjunction (0°), Opposition (180°), Square (90°), Trine (120°), Sextile (60°)
- **Supported bodies**: All planets, Chiron, Ceres, Pallas, Juno, Vesta, North Node
- **Exact time calculation**: Uses binary search interpolation for precision
- **Advance warnings**: Shows transits within 2° orb

## License

MIT
