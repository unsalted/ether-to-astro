# Architecture Boundaries

This document translates the product tenets into concrete repository and interface boundaries.

## System Layers

The product has four distinct layers:

1. `MCP tools`
   Source of truth for reusable astrological computation.
2. `MCP prompts`
   Thin public entry points that help clients discover or initiate common workflows.
3. `Assistant skills or workflows`
   AI-native orchestration, synthesis, ranking, and formatting built on top of MCP tools.
4. `Profiles or preferences`
   User- or workflow-specific settings that shape output without polluting generic tool contracts.

## The Boundary In One Sentence

MCP computes and exposes facts. Skills decide what matters, how to rank it, and how to present it.

## Determinism Rule

Deterministic, generic astrology outputs are strong candidates for MCP.

This includes:

- added flags on existing tools,
- expanded date windows,
- grouped forecast output,
- generic derived astro signals,
- and reusable metadata that multiple clients would otherwise reconstruct themselves.

Determinism is not sufficient by itself.

Deterministic outputs should still stay out of MCP when they primarily encode:

- personalized policy,
- workflow-specific scoring,
- subjective ranking,
- or narrative conclusions.

## What Counts As A Primitive

A primitive is a structured output that:

- represents reusable astrological truth,
- is deterministic or mostly deterministic for the same inputs,
- is stable across multiple workflows,
- and does not depend on one user’s preferred interpretation style.

Examples of good primitives:

- transit events
- date-grouped forecast windows
- mundane aspects
- house activations
- Moon condition
- ASC sign and ruler condition
- rising-sign windows

Examples of non-primitives:

- “top 3 influences today”
- “best time to influence leadership”
- “high opportunity” versus “mixed-intense”
- custom tags like “report readout” or “spiritual ritual”

## MCP Tool Design Rules

### Prefer Generic Modes Over Tool Proliferation

Good:

- one transit tool with explicit modes such as `snapshot`, `best_hit`, and `forecast`
- one electional-context tool with optional include flags for rising windows, Moon condition, and house context

Bad:

- `get_daily_transits`
- `get_weekly_transits`
- `get_best_transits_for_work`
- `get_spiritual_transits`

### Favor Structured Data Over Prose

Good MCP output:

- date-grouped JSON
- exact-time metadata
- sign, degree, house, and applying/separating state

Bad MCP output:

- opinionated text summaries
- personalized advice
- user-specific ranking labels baked into the contract

### Keep Personalization Out Of MCP

Do not hardcode into MCP:

- one user’s preferred house system for reporting
- one user’s preferred electional rulers
- one user’s work or life categories
- one user’s “good” and “bad” framing

Instead:

- expose the raw or lightly structured inputs,
- then let skills and preferences shape the output.

## Skill Design Rules

Skills should:

- call the smallest useful set of MCP primitives,
- avoid reimplementing astro logic,
- own synthesis and narrative structure,
- and encode workflow-level decisions such as section order, ranking, tone, and user-preference application.

The default target is a one-call or two-call skill flow.

Skill-layer examples in this repo are primarily boundary examples and workflow incubators.

They should not be read as automatic commitments to build or maintain every listed workflow as a first-class product artifact.

### Good Skill Flow

1. Call forecast primitives.
2. Optionally call electional primitives for narrowed windows.
3. Synthesize the report.

### Bad Skill Flow

- dozens of tiny MCP calls that should have been a reusable primitive
- custom astro math in the skill
- pretending uncertain interpretation is hard computation

## Prompt Design Rules

Prompts are optional adapters, not the core product logic.

Use prompts when you want:

- discoverability in MCP-aware clients,
- a stable public workflow entry point,
- and a generic wrapper around one or more tools.

Do not use prompts as a substitute for:

- a missing MCP primitive,
- or a real skill/workflow spec.

## Preference Design Rules

Profiles or preferences should contain durable output preferences and user heuristics.

Examples:

- reporting timezone
- preferred house system for interpretation
- favored electional filters
- preferred report sections
- recurring tags or domain labels

Preferences should not:

- alter astro computation silently,
- fork the meaning of a generic MCP tool,
- or create multiple incompatible interpretations of the same primitive.

## When To Add A New MCP Primitive

Add a new MCP primitive when all or most of the following are true:

- it is deterministic or mostly deterministic,
- it is computational,
- it is reusable,
- multiple skills or clients need it,
- it would be brittle to reconstruct client-side,
- and it reduces total system complexity.

## When Not To Add A New MCP Primitive

Do not add a new MCP primitive when:

- it mainly produces prose,
- it mainly encodes policy rather than astro fact,
- it mainly reflects one user’s preferences,
- the same result can be achieved by a competent LLM in two calls,
- or it would create a specialized tool for a narrow workflow instead of strengthening a generic primitive.

## Current Repo Implications

Based on the current product direction:

### Strong candidates for MCP

- range-aware transit forecast data
- mundane aspect data
- house-aware transit activations
- electional primitives
- rising-sign window helpers

### Candidate workflow experiments after primitive stabilization

- daily brief generation
- weekly overview synthesis
- electional overlay and ranking
- action-oriented summaries
- user-specific framing and categorization

### Strong candidates for docs or examples

- reference workflows that show how to combine forecast plus electional context
- examples of what lives in skills versus MCP
- preference contract guidance for user-facing reporting

## Related Docs

- [Product Tenets](/Users/salted/Code/astro-mcp/docs/product/product-tenets.md)
- [ADR 0001: MCP Vs Skill Boundary](/Users/salted/Code/astro-mcp/docs/product/adrs/0001-mcp-vs-skill-boundary.md)
