# ether-to-astro

```
███████╗██████╗  █████╗
██╔════╝╚════██╗██╔══██╗
█████╗   █████╔╝███████║
██╔══╝  ██╔═══╝ ██╔══██║
███████╗███████╗██║  ██║
╚══════╝╚══════╝╚═╝  ╚═╝
    ether-to-astro
```

Astrology tooling for agent workflows.

`ether-to-astro` is a local-first astrology toolkit with a unified `e2a` binary for CLI and MCP usage, plus an `e2a-mcp` compatibility alias for existing MCP setups.

This started as a side project because my wife is the real user, and I wasn’t impressed with the tooling around her astrology fascination. I’ve worked on plenty of AI tools and have a pretty high bar for them. Most of what I found in this space felt flimsy, closed-off, or not designed for serious agent workflows.

So I built the version I wanted to exist: local-first, scriptable, tested, and structured to work well both from the command line and through MCP. I built it, she uses it daily, and that feedback loop has made the product better.

## Quick Start

### MCP

Add this to your MCP client config:

```json
{
  "mcpServers": {
    "astro": {
      "command": "npx",
      "args": ["--yes", "--package=ether-to-astro", "e2a", "--mcp"]
    }
  }
}
```

Then restart your MCP client and call `set_natal_chart`.

### CLI

Run the CLI directly with `npx`:

```bash
npx --yes --package=ether-to-astro e2a --help
```

Or install globally:

```bash
npm install -g ether-to-astro
e2a --help
e2a --mcp --help
```

### Product Setup

- End-user setup and examples: [SETUP.md](/Users/salted/Code/astro-mcp/SETUP.md)
- Local repo setup and contributor workflow: [DEVELOPER.md](/Users/salted/Code/astro-mcp/DEVELOPER.md)

### Agent Skills

This repo also includes repo-owned agent skills in a standard `skills/` layout.

If you use the [Vercel `skills` CLI](https://github.com/vercel-labs/skills), you can inspect or install them from a local checkout:

```bash
# List skills available in this repo
npx skills add . --list

# Install the repo's skills to Codex for this project
npx skills add . --agent codex --skill daily-brief --skill weekly-overview --skill electional-overlay

# Install the repo's write-skill helper to Codex for this project
npx skills add . --agent codex --skill write-skill
```

You can also install from GitHub instead of a local checkout:

```bash
npx skills add unsalted/ether-to-astro --agent codex --skill write-skill
```

## Features

You can ask your AI agent about:

### Transits
- **Daily mundane positions** - Current planetary positions
- **Moon transits** - Fast-moving Moon aspects to natal planets
- **Personal planet transits** - Sun, Mercury, Venus, Mars aspects to natal chart
- **Outer planet transits** - Jupiter, Saturn, Uranus, Neptune, Pluto aspects
- **Exact transit times** - Precise timing when transits become exact (0° orb)
- **Upcoming transit preview** - Best upcoming hits across a requested date range

### Advanced Features
- **House cusps** - Ascendant, Midheaven, and all 12 houses (multiple systems)
- **Electional context** - Stateless ascendant, sect, Moon phase, and applying-aspect context for a specific date, time, and location
- **Retrograde status** - Which planets are currently retrograde
- **Rise/Set times** - Sunrise, sunset, moonrise, moonset
- **Asteroids & Nodes** - Chiron, Ceres, Pallas, Juno, Vesta, North Node
- **Eclipses** - Next solar and lunar eclipse dates
- **Visual Charts** - Generate SVG natal and transit chart wheels with aspects

## Installation

### From npm

For normal product usage, install from npm or use `npx`.

```bash
npx --yes --package=ether-to-astro e2a --help
```

Or:

```bash
npm install -g ether-to-astro
```

You do not need to run `npm run build` when installing from npm.

### From a local repo checkout

If you cloned this repository and want to run the local source checkout:

```bash
npm install
npm run build
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
```

## Package Names

- Package: `ether-to-astro`
- CLI command: `e2a`
- Canonical MCP command: `e2a --mcp`
- Compatibility MCP alias: `e2a-mcp`

## Runtime Surfaces

### MCP server (stateful per process)

Launch MCP mode with:

```bash
e2a --mcp --help
```

Optional deterministic startup defaults:

```bash
e2a --mcp --preferred-tz America/Los_Angeles --preferred-house-style W --weekday-labels
```

The `e2a-mcp` binary remains available as a compatibility alias and starts MCP mode automatically.

### In-Memory Storage
The MCP server uses **in-memory storage** for natal chart data:
- Each client connection gets its own Node.js process instance
- Natal chart is stored in RAM for the duration of the connection
- When you disconnect, the process exits and memory is automatically freed
- No files are created or persisted to disk
- Simply call `set_natal_chart` again when reconnecting

This design is **MCP-compliant** for stdio transport and ensures complete isolation between different clients.

### CLI (single-shot, stateless)

`e2a` is JSON-first for agent usage and supports `--pretty` for human-readable output.

`npx` usage note: this package is named `ether-to-astro`, so invoke bins with `--package`.
`npx e2a` will not work by itself because npm resolves package names first.

Examples:

```bash
# Help
npx --yes --package=ether-to-astro e2a --help

# Set natal chart and print JSON
npx --yes --package=ether-to-astro e2a set-natal-chart --name "Test" --year 1990 --month 1 --day 1 --hour 12 --minute 0 --latitude 40.7 --longitude -74.0 --timezone America/New_York

# Human-readable transit output
npx --yes --package=ether-to-astro e2a get-transits --natal-file ./natal.json --date 2026-03-27 --pretty
```

### CLI Profiles (`.astro.json`)

The CLI supports profile-based natal input for one-shot commands.

- `--profile <name>`: profile to use
- `--profile-file <path>`: explicit profile file path
- `ASTRO_PROFILE`, `ASTRO_PROFILE_FILE`: env var equivalents

Profile file resolution order:
1. `--profile-file`
2. `ASTRO_PROFILE_FILE`
3. `./.astro.json`
4. `~/.astro.json`

Profile name resolution order:
1. `--profile`
2. `ASTRO_PROFILE`
3. `defaultProfile` in the profile file

Read-only helper commands:

```bash
npx --yes --package=ether-to-astro e2a profiles list
npx --yes --package=ether-to-astro e2a profiles show --profile default
npx --yes --package=ether-to-astro e2a profiles validate
```

Recommended: add project-local `.astro.json` to `.gitignore` because it contains birth data.

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
- year, month, day, hour, minute (birth time in LOCAL time)
- latitude, longitude (birth location)
- timezone (e.g., "America/New_York", "Europe/London")
- house_system (optional): "P" (Placidus), "W" (Whole Sign), "K" (Koch), "E" (Equal)
```

### 2. Query Transits

Ask your AI agent:
- "What are today's transits?"
- "Show me Moon transits"
- "What outer planet transits are active?"
- "When will this transit be exact?"
- "What transits are coming up this week?"

## MCP Tools Available

### Setup
- `set_natal_chart` - Store birth chart data

### Transits
- `get_transits` - Category-filtered transits with optional exact-time data and explicit mode semantics:
  - `snapshot`: single-day view for the selected date
  - `best_hit`: compressed multi-day preview across the selected date window
  - `forecast`: day-grouped transit output across the selected date window
  - if `mode` is omitted, legacy behavior is preserved: `days_ahead=0` resolves to `snapshot`, and `days_ahead>0` resolves to `best_hit`

In this release, `include_mundane` remains anchored to the forecast start date even when `mode=forecast`. Range-aware mundane output is tracked separately.

### Electional
- `get_electional_context` - Stateless electional context for a local date, time, and location. Returns deterministic ascendant, sect/day-night classification, Moon phase, applying aspects, and optional ASC-ruler basics without requiring a natal chart.

### Advanced Tools
- `get_houses` - House cusps, Ascendant, Midheaven (Placidus, Koch, Whole Sign, Equal)
- `get_retrograde_planets` - Show which planets are retrograde
- `get_rise_set_times` - Sunrise, sunset, moonrise, moonset
- `get_asteroid_positions` - Chiron, Ceres, Pallas, Juno, Vesta, Nodes
- `get_next_eclipses` - Next solar and lunar eclipses

### Visual Charts
- `generate_natal_chart` - Natal chart wheel (SVG/PNG/WebP)
- `generate_transit_chart` - Transit overlay chart (SVG/PNG/WebP)

## CLI Commands Available

- `set-natal-chart`
- `get-transits`
- `get-houses`
- `get-retrograde-planets`
- `get-rise-set-times`
- `get-asteroid-positions`
- `get-next-eclipses`
- `generate-natal-chart`
- `generate-transit-chart`

## Technical Details

- **Engine**: Native Swiss Ephemeris via Node `sweph` bindings
- **Dependency policy**: `sweph` is pinned to an exact version to keep validation fixtures and numerical baselines stable across installs
- **Accuracy**:
  - Primary mode: Swiss Ephemeris data files (`SEFLG_SWIEPH`) for highest precision
  - Fallback mode: Moshier (`EPHEMERIS_VERSION=moshier` or missing ephemeris files), lower precision but fully functional
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

## Development

Contributor workflow, local repo setup, quality gates, and release-oriented notes live in [DEVELOPER.md](/Users/salted/Code/astro-mcp/DEVELOPER.md).

## License

AGPL-3.0-or-later

This package adopts the AGPL path because it depends on `sweph`, which declares
`(AGPL-3.0-or-later OR LGPL-3.0-or-later)` and reserves the LGPL path for the
conditions described by the Swiss Ephemeris licensing terms.
