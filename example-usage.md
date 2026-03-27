# Example Usage

This document shows how to use the Astro MCP server with an AI agent like Claude.

**Note:** The natal chart is stored in memory for the duration of your session. If you disconnect and reconnect, you'll need to call `set_natal_chart` again.

## Important: Time Handling

**Always provide birth time in LOCAL time** (not UTC):
- Use the time as it appeared on the clock at the birth location
- Specify the IANA timezone (e.g., `America/New_York`, not `EST`)
- The server will convert to UTC and handle DST automatically
- You'll receive verification feedback showing both local and UTC times

## Setting Up Your Wife's Natal Chart

First, she needs to provide her birth data. Ask your AI agent:

```
Please set my natal chart:
- Name: Jane
- Birth: January 15, 1985 at 14:30 (2:30 PM)
- Location: Los Angeles, CA (34.0522°N, 118.2437°W)
- Timezone: America/Los_Angeles
```

The agent will call `set_natal_chart` with:
```json
{
  "name": "Jane",
  "year": 1985,
  "month": 1,
  "day": 15,
  "hour": 22,
  "minute": 30,
  "latitude": 34.0522,
  "longitude": -118.2437,
  "timezone": "America/Los_Angeles"
}
```

Note: Hour should be in UTC (PST is UTC-8, so 14:30 PST = 22:30 UTC)

## Daily Transit Queries

### Morning Check-In
"What are my transits for today?"

The agent will call:
- `get_daily_transits` - Current planetary positions
- `get_moon_transits` - Moon aspects to natal planets
- `get_personal_planet_transits` - Sun/Mercury/Venus/Mars aspects
- `get_outer_planet_transits` - Slower moving planets

### Specific Questions

**"When will the Moon conjunct my Venus be exact?"**
- Agent calls `get_exact_transit_times`
- Returns precise time when aspect is 0° orb

**"What transits are coming up this week?"**
- Agent calls `get_upcoming_transits` with `days: 7`
- Shows all transits approaching within 2° orb

**"Show me just the outer planet transits"**
- Agent calls `get_outer_planet_transits`
- Returns Jupiter, Saturn, Uranus, Neptune, Pluto aspects

## Sample Output

### Moon Transits
```
Moon Transits:

Moon conjunction Venus: 0.45° orb (applying) - Exact: 2026-03-27T03:24:15.000Z
Moon sextile Mars: 1.23° orb (separating)
Moon trine Jupiter: 2.87° orb (applying)
```

### Personal Planet Transits
```
Personal Planet Transits:

Sun square natal Moon: 0.89° orb (applying) - Exact: 2026-03-27T18:45:32.000Z
Venus trine natal Sun: 3.21° orb (separating)
Mars opposition natal Mercury: 5.67° orb (applying)
```

### Upcoming Transits (7 days)
```
Upcoming Transits (next 7 days):

Jupiter trine natal Venus: 1.45° orb (applying) - Exact: 2026-03-29T12:30:00.000Z
Saturn square natal Mars: 1.89° orb (applying) - Exact: 2026-04-01T08:15:45.000Z
```

## Understanding the Output

- **Orb**: How close the aspect is (0° = exact)
- **Applying**: Transit is getting closer to exact
- **Separating**: Transit is moving away from exact
- **Exact time**: When the aspect becomes 0° orb (only shown for transits within 2°)

## Tips for Your Wife

1. **Morning routine**: Check daily transits each morning
2. **Plan ahead**: Use `get_upcoming_transits` to see what's coming
3. **Track exact times**: Important transits show exact timing for planning
4. **Focus on what matters**: 
   - Moon transits change quickly (every few hours)
   - Personal planets change daily/weekly
   - Outer planets can last weeks/months
