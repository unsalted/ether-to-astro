# Product Tenets

This document defines what `ether-to-astro` is, what it is not, and how we avoid turning the MCP surface into a muddy bundle of personalized workflow logic.

## Mission

Build a trustworthy astrology computation layer for AI-native workflows.

## North-Star

`ether-to-astro` should provide reliable astrological facts and structured primitives that agents can use to build high-quality experiences without reimplementing astro math client-side.

## Primary Jobs To Be Done

- Compute natal, transit, mundane, and electional astrology data accurately.
- Expose that data through stable MCP and CLI primitives.
- Make those primitives composable for skills, prompts, and downstream agent workflows.
- Preserve clear boundaries between computation, interpretation, and personalization.

## What We Build

- Astrology computation and normalization
- Reusable primitives for transit and chart workflows
- Structured outputs that reduce fragile client-side reconstruction
- Docs and examples that help agents compose the system correctly

## What We Do Not Build

- A monolithic “do everything” astrology assistant inside MCP
- User-specific advice engines hardcoded into the core surface
- Prompt-shaped tools that mostly duplicate what a competent LLM can do from stable primitives
- Endless one-off reporting endpoints for every downstream workflow

## Boundary Rules

### MCP Owns

Put a capability in MCP if it is:

- deterministic or mostly deterministic,
- computational rather than interpretive,
- reusable across clients or skills,
- grounded in astro math, house logic, timezone logic, or ephemeris logic,
- and difficult or risky to reconstruct client-side.

Examples:

- transit calculation
- range-aware forecast data
- mundane aspects
- house activation metadata
- electional primitives
- local rising-sign windows

### Skills Own

Put a capability in a skill if it is:

- mostly synthesis, ranking, or formatting,
- non-deterministic or heavily dependent on judgment,
- user-specific or preference-heavy,
- likely to evolve quickly,
- and doable by a competent LLM in one or two calls to stable MCP primitives.

Examples:

- daily brief generation
- weekly overview synthesis
- opportunity/risk framing
- “best use today” language
- electional scoring using a specific user’s preferences
- preference-aware section ordering and tone

Skill ideas are the default incubation layer for new workflow concepts.

That does not make every skill example in this repo a committed product roadmap item.

Treat skill-layer examples and issue ideas as candidate workflows unless they are explicitly promoted into committed work.

### MCP Prompts Own

Use MCP prompts as thin, discoverable entry points into common workflows.

Prompts may:

- guide clients toward the right tools,
- provide a reusable public starting point,
- and expose common report workflows for non-local clients.

Prompts should not:

- become the primary place where product logic lives,
- duplicate full skill logic,
- or hardcode personalized heuristics that belong in a skill or profile.

### Profiles Or Preferences Own

Put durable personalization in a profile or preference layer, not in generic MCP tools.

Examples:

- Whole Sign-first reporting
- timezone defaults
- preferred electional filters
- section preferences
- naming and tagging preferences

## Feature Creep Guardrails

- MCP is for astrological facts, not personalized advice.
- Deterministic and generic astro computation is a strong candidate for MCP.
- Determinism alone is not enough; deterministic but opinionated workflow synthesis still belongs in a skill.
- A new MCP feature must justify why it cannot be cleanly handled by a skill in two calls.
- Prefer extending an existing tool over adding a new narrowly scoped tool.
- Do not add user-specific heuristics to MCP.
- Do not add report-generation tools to MCP unless the output is generic, stable, and broadly reusable.
- If a feature mixes computation and interpretation, split it.
  Computation belongs in MCP. Interpretation belongs in a skill.

## Promotion Rule

New workflow ideas should start life as skills or prompts.

That is an incubation step, not an automatic commitment to ship a repo-owned skill or workflow.

They should graduate into MCP only when:

- the computational pattern is stable,
- multiple workflows need the same primitive,
- and the client-side implementation would otherwise duplicate fragile astro logic.

## Decision Test

Before adding new MCP surface area, answer these questions:

1. Is this astrological computation or interpretation?
2. Is the output deterministic or mostly deterministic for the same inputs?
3. Would two different skills or clients need the same structured output?
4. Would keeping this outside MCP force astro logic duplication?
5. Can a competent LLM do this in two calls from existing primitives?
6. Are we adding a generic primitive, or hardcoding one user’s workflow?

If the output is deterministic, generic, and reusable, prefer MCP.

If a competent LLM can already do it in two calls and the remaining value is mostly synthesis or policy, it probably does not belong in MCP.

## Examples

### Belongs In MCP

- “Return a 7-day forecast grouped by day.”
- “Return mundane aspects between transiting planets.”
- “Return which natal and transiting houses are activated.”
- “Return Moon condition and rising-sign windows for a date and location.”
- “Add an `include_houses` or `include_mundane_aspects` flag to an existing tool.”

### Belongs In A Skill

- “Write a daily brief with top 3 influences.”
- “Rank today as clean, mixed, or caution.”
- “Suggest best uses for work, family, health, and spiritual practice.”
- “Score electional windows according to one user’s preferred rulers and Mars/Saturn cautions.”

### Does Not Belong

- “Best time for my Google QBR” as a first-class MCP tool
- one-user reporting tags embedded into tool contracts
- generic tools whose only job is to produce prose a skill could generate from structured data
- deterministic but policy-heavy labels like “clean”, “mixed”, or “caution” baked into core tools

## Related Docs

- [Architecture Boundaries](/Users/salted/Code/astro-mcp/docs/product/architecture-boundaries.md)
- [ADR 0001: MCP Vs Skill Boundary](/Users/salted/Code/astro-mcp/docs/product/adrs/0001-mcp-vs-skill-boundary.md)
