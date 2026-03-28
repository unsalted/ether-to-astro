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

`ether-to-astro` is a local-first astrology toolkit with two surfaces: `e2a`, a CLI, and `e2a-mcp`, an MCP server.

This started as a side project because my wife is the real user, and I wasn’t impressed with the tooling around her astrology fascination. I’ve worked on plenty of AI tools and have a pretty high bar for them. Most of what I found in this space felt flimsy, closed-off, or not designed for serious agent workflows.

So I built the version I wanted to exist: local-first, scriptable, tested, and structured to work well both from the command line and through MCP. I’m the builder. She’s the user. That turned out to be a pretty good way to make the product better.

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

## Engineering Contract

This repo uses a lightweight, agent-friendly operating contract:

- Keep changes focused and avoid unrelated churn in the same diff.
- Treat Biome as the source of truth for formatting, import order, and linting.
- Use conventional commit messages: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Keep PR descriptions short and explicit about what changed and how it was verified.

Required routine quality gate:

```bash
npm run quality:gate
```

This runs:

- `npm run build`
- `npm run lint`
- `npm test -- --run`

Use `npm run validate:astro` for high-risk astrology engine work such as ephemeris/root-solver/transit-timing changes. It is intentionally not part of the default routine gate.

Commit examples:

```text
fix(cli): resolve injected cwd for relative profile paths
test(profiles): cover default profile precedence
refactor(transits): simplify exact-time formatting
docs(readme): document remote-ready repo contract
```

Pull request checklist:

- Scope is focused and coherent.
- `npm run quality:gate` passed locally.
- Tests were added or updated when behavior changed.
- Docs were updated when workflow or interfaces changed.
- PR description includes:
  - What changed
  - How it was verified

## Setup

1. Run setup script or install manually (see above)

2. Build:

```bash
npm run build
```

3. Add MCP to your MCP settings (e.g., Claude Desktop config):

```json
{
  "mcpServers": {
    "astro": {
      "command": "e2a-mcp"
    }
  }
}
```

Package/binary names:
- Package: `ether-to-astro`
- CLI command: `e2a`
- MCP command: `e2a-mcp`

## Runtime Surfaces

### MCP server (stateful per process)

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

Examples:

```bash
# Help
npx e2a --help

# Set natal chart and print JSON
npx e2a set-natal-chart --name "Test" --year 1990 --month 1 --day 1 --hour 12 --minute 0 --latitude 40.7 --longitude -74.0 --timezone America/New_York

# Human-readable transit output
npx e2a get-transits --natal-file ./natal.json --date 2026-03-27 --pretty
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
npx e2a profiles list
npx e2a profiles show --profile elwyn
npx e2a profiles validate
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
- `get_transits` - Category-filtered transits with optional exact-time data

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

## License

AGPL-3.0-or-later

This package adopts the AGPL path because it depends on `sweph`, which declares
`(AGPL-3.0-or-later OR LGPL-3.0-or-later)` and reserves the LGPL path for the
conditions described by the Swiss Ephemeris licensing terms.
