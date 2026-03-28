---
name: electional-overlay
description: Add a secondary electional timing overlay to an existing daily or weekly astrology workflow. Use when the user wants timing refinement after the main overview has already been established.
metadata:
  repo: ether-to-astro
---

# Electional Overlay

## Purpose
Use this skill to add timing refinement after a daily brief or weekly overview already exists.

This skill is not the primary report. It is a secondary overlay that narrows candidate windows using electional primitives.

## Inputs
- An existing daily brief or weekly overview context.
- Date, time, or narrowed candidate window to evaluate.
- Location and timezone for electional checks.
- Optional deterministic defaults:
  - preferred reporting timezone
  - weekday labels on or off

## Required MCP Calls
Use the smallest useful set of electional primitives available. Preferred surfaces include:
- a standalone electional-context tool for date/time/location
- rising-sign windows
- Moon condition or applying-aspect primitives

If the needed primitives are not available, stop and explain the limitation instead of inventing electional logic.

## Workflow
1. Start from an already-established overview or brief.
2. Narrow the timing question to a date or candidate window.
3. Call electional primitives for that narrowed scope.
4. Summarize the resulting timing implications as secondary notes.

## Elicitation
- Ask for missing information only when it materially changes the result.
- Prefer targeted clarifications over open-ended questions:
  - date or candidate window
  - location or timezone
  - action type, if the user wants timing for a specific kind of action
- If the user asks for a general timing overlay without enough specificity, ask for the narrowest missing detail needed to make the overlay meaningful.

## Output Contract
- Keep this as an add-on section, not a full replacement report.
- Default section order:
  1. `Timing Window`
  2. `Electional Signals`
  3. `Why It Stands Out`
- Reference the underlying deterministic facts directly.
- Make confidence and limitations clear when the primitive set is incomplete.

## Boundaries
- Do not invent electional scoring formulas inside the skill.
- Do not represent subjective ranking as MCP truth.
- Do not let asteroids or niche filters dominate unless the user explicitly asks for them.
- Do not replace the main weekly/daily overview with timing-only analysis.

## Good Patterns
- Treat electional guidance as optional and secondary.
- Use explicit time windows when the MCP primitive provides them.
- Explain why a window is notable using raw signals, not just verdict labels.

## Failure Handling
- If electional primitives are unavailable, say that timing refinement is limited by the current MCP surface.
- If the user has not narrowed the timing question enough, ask for the date, window, or location needed for a meaningful overlay.
