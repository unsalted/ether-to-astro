# ADR 0001: MCP Vs Skill Boundary

- Status: Accepted
- Date: 2026-03-28

## Context

`ether-to-astro` is evolving from a set of astrology utilities into infrastructure for AI-native workflows.

Recent product exploration introduced requests for:

- daily and weekly transit reporting,
- mundane baseline plus natal modifier reasoning,
- electional support,
- Whole Sign-first house activation reporting,
- and preference-aware planning workflows.

Without an explicit boundary, it would be easy to grow the MCP surface into a large collection of personalized reporting tools. That would make the product harder to maintain, harder to reuse, and harder to reason about.

## Decision

We will keep the boundary as follows:

- `MCP tools` own reusable astrological computation and structured primitives.
- `Skills or workflows` own synthesis, ranking, personalization, and report generation.
- `MCP prompts` may expose common workflows for discovery, but they do not become the main home for product logic.
- `Profiles or preferences` own durable user-specific output choices and heuristics.

## Consequences

### Positive

- MCP stays focused and reusable.
- Skills can evolve quickly without destabilizing the computational layer.
- Personalized reporting can improve without forcing product-wide API churn.
- New agents and clients get a clearer mental model of the system.

### Negative

- Some workflows will require multiple calls instead of one large convenience tool.
- Skill authors must still do synthesis work rather than relying on all-in-one MCP endpoints.
- We need stronger docs and examples so the boundary remains easy to apply.

## Decision Rules

Add a capability to MCP when:

- it is deterministic or mostly deterministic,
- it is computation-heavy,
- reusable across multiple workflows,
- and risky or repetitive to reconstruct client-side.

Keep a capability in a skill when:

- it is interpretation-heavy,
- it is deterministic but mainly encodes workflow policy or ranking,
- user-specific,
- likely to evolve rapidly,
- or achievable by a competent LLM in two calls to stable primitives.

## Examples

### Belongs In MCP

- transit forecast data grouped by day
- mundane aspects
- house activation metadata
- electional primitives
- rising-sign windows

### Belongs In Skills

- daily briefing
- weekly overview synthesis
- “top influences” ranking
- best-use guidance
- personalized electional scoring

### Does Not Belong In MCP

- one-user workflow tags
- customized work or life advice
- generic prose-generation tools that a skill could perform from structured data

## Follow-Up

This ADR implies:

- future MCP proposals should justify why the capability cannot stay in a skill,
- new reporting workflows should start life outside MCP,
- and docs should make the two-call skill model the default design assumption.

## Related Docs

- [Product Tenets](/Users/salted/Code/astro-mcp/docs/product/product-tenets.md)
- [Architecture Boundaries](/Users/salted/Code/astro-mcp/docs/product/architecture-boundaries.md)
