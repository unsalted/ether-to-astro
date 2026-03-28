# Developer Guide

This guide is for contributors working in the repository.

For product setup and end-user usage, see [SETUP.md](/Users/salted/Code/astro-mcp/SETUP.md).

## Local Repo Setup

Requirements:

- Node.js 22+

Install dependencies:

```bash
npm install
```

Build the local checkout:

```bash
npm run build
```

Use the local CLI after building:

```bash
npm run start:cli -- --help
```

## Quality Gates

Routine merge gate:

```bash
npm run quality:gate
```

This runs:

- `npm run build`
- `npm run lint`
- `npm test -- --run`

Targeted validation for high-risk astrology engine changes:

```bash
npm run validate:astro
```

## Contributor Contract

- Keep changes focused and avoid unrelated churn in the same diff.
- Treat Biome as the source of truth for formatting, import order, and linting.
- Use conventional commit messages: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Keep PR descriptions short and explicit about what changed and how it was verified.
- Respect the MCP-vs-skill boundary documented in:
  - [docs/product/product-tenets.md](/Users/salted/Code/astro-mcp/docs/product/product-tenets.md)
  - [docs/product/architecture-boundaries.md](/Users/salted/Code/astro-mcp/docs/product/architecture-boundaries.md)
  - [docs/product/adrs/0001-mcp-vs-skill-boundary.md](/Users/salted/Code/astro-mcp/docs/product/adrs/0001-mcp-vs-skill-boundary.md)

## Technical Notes

- Engine: native Swiss Ephemeris via Node `sweph` bindings
- `sweph` is pinned to an exact version to keep validation fixtures and numerical baselines stable
- Primary accuracy mode uses Swiss Ephemeris data files
- `EPHEMERIS_VERSION=moshier` is supported as a lower-precision fallback
- Chart rendering uses `@astrodraw/astrochart` with JSDOM

## Common Commands

```bash
npm run build
npm run lint
npm test -- --run
npm run validate:astro
npm run start:cli -- --help
```
