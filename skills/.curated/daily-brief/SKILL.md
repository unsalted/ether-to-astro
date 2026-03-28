---
name: daily-brief
description: Produce a concise daily astrology brief from ether-to-astro MCP primitives. Use when a user wants today's personal transits and collective weather summarized without turning interpretation into MCP logic.
metadata:
  repo: ether-to-astro
---

# Daily Brief

## Purpose
Use this skill when a user wants a same-day astrology brief grounded in `ether-to-astro` MCP data.

This skill owns synthesis, ordering, and narrative framing. It does not invent astro facts or encode its own computational logic.

## Inputs
- A loaded natal chart on the MCP side, or enough birth data to load one first.
- Date to analyze. Default to today in the reporting timezone if the user does not specify a date.
- Optional deterministic defaults:
  - preferred reporting timezone
  - preferred house style for interpretation
  - weekday labels on or off

## Required MCP Calls
1. Call `get_server_status`.
2. If no natal chart is loaded, either:
   - call `set_natal_chart` when the user has supplied birth data, or
   - stop and ask for natal-chart setup.
3. Call `get_transits` for the target date.
   Recommended arguments:
   - `date`
   - `include_mundane: true`
   - `categories: ["all"]`
4. Use additional MCP primitives only when they already exist and materially improve the brief:
   - house-aware transit metadata
   - electional context
   - rising-sign windows

## Workflow
1. Resolve the target date and reporting timezone.
2. Retrieve same-day transit data.
3. Separate the output into:
   - mundane baseline
   - personal transit modifiers
4. Rank or group the results for readability, but keep all rankings clearly skill-side.
5. Produce a concise brief with explicit references back to the underlying astro facts.

## Output Contract
- Keep the brief short and practical.
- Default section order:
  1. `Overview`
  2. `Mundane Baseline`
  3. `Personal Modifiers`
  4. `Optional Timing Notes`
- Reference actual astro facts directly:
  - planets
  - aspects
  - sign or house context when available
  - exact timing only when the MCP result provides it
- Use weekday labels only when enabled by config or clearly requested by the user.
- If the available MCP data is incomplete, say so plainly instead of implying precision that is not present.

## Boundaries
- Do not turn the brief into a new MCP contract.
- Do not describe ranking labels such as `clean`, `mixed`, or `caution` as deterministic truth.
- Do not invent house activations, electional windows, or mundane-aspect data when the MCP response does not provide them.
- Do not use multi-day `get_transits` output as if it were a true day-by-day forecast unless the explicit forecast contract exists.

## Good Patterns
- Summarize mundane weather first, then describe how natal transits personalize it.
- Use exact-time notes only when the tool returned them.
- Prefer a compact brief over exhaustive prose.

## Failure Handling
- If no natal chart is available, stop and request natal-chart setup.
- If the MCP surface lacks a needed primitive, explain the missing capability and continue with the best truthful same-day brief possible.
