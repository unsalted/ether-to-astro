---
name: weekly-overview
description: Produce a weekly astrology overview from ether-to-astro MCP primitives. Use when a user wants an overview-first planning read that can optionally include secondary electional notes.
metadata:
  repo: ether-to-astro
---

# Weekly Overview

## Purpose
Use this skill when a user wants a seven-day overview, not just a same-day brief.

This skill is only as strong as the underlying forecast primitives. It must not fake a day-by-day weekly report from lossy MCP data.

## Inputs
- A loaded natal chart on the MCP side, or enough birth data to load one first.
- Start date for the weekly window. Default to today in the reporting timezone if unspecified.
- Optional deterministic defaults:
  - preferred reporting timezone
  - preferred house style for interpretation
  - weekday labels on or off

## Required MCP Calls
1. Call `get_server_status`.
2. Ensure a natal chart is loaded before continuing.
3. Prefer a true range-aware transit forecast primitive when available.
   Examples:
   - explicit `forecast` mode on `get_transits`
   - date-grouped transit forecast output
   - per-day mundane aspect data
4. Only use electional primitives as a second pass after the weekly overview exists.

## Workflow
1. Resolve the weekly window and reporting timezone.
2. Retrieve week-level transit data using a forecast-capable MCP surface.
3. Build the overview in this order:
   - collective weather across the week
   - notable personal modifiers by day or cluster
   - optional secondary timing suggestions
4. Keep recommendations clearly secondary to the overview.

## Elicitation
- If the user does not provide a start date, default to today in the reporting timezone.
- If the user appears to mean a calendar week rather than the next seven days, ask for the intended start date or state the assumption clearly.
- Do not ask extra questions if the overview can proceed truthfully with the default seven-day window.

## Output Contract
- Default section order:
  1. `Week Overview`
  2. `Daily Highlights`
  3. `Interpretive Lens`
  4. `Optional Timing Suggestions`
- `Week Overview` should summarize the overall weather first.
- `Daily Highlights` should preserve actual day boundaries when the MCP data supports them.
- `Interpretive Lens` should explain why certain days stand out using referenced astro facts.
- `Optional Timing Suggestions` should remain clearly secondary and should only appear when supported by MCP primitives.

## Boundaries
- Do not use current lossy multi-day `get_transits` behavior as if it were a true weekly forecast.
- If the forecast-capable MCP primitive is missing, say so explicitly and do one of the following:
  - provide a limited best-hit preview, clearly labeled as such, or
  - stop and explain that a true weekly overview is not yet supported by the current MCP surface.
- Do not hardcode personal scoring policy into the contract.
- Do not move prose generation into MCP.

## Good Patterns
- Overview first, suggestions second.
- Mundane baseline first, natal modifiers second.
- Keep optional electional guidance visibly separate from the main weekly read.

## Failure Handling
- If no natal chart is loaded, stop and request natal-chart setup.
- If the forecast primitive is missing, do not synthesize a false weekly report.
