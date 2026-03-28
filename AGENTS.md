# AGENTS.md

## Purpose
This file is for coding agents working in `ether-to-astro`. It documents the real architecture and safe change workflow so edits stay correct, low-risk, and release-safe.

## Current Runtime Facts
- Engine is native Node binding: `sweph` (not WASM/WASI).
- `sweph` is version-pinned in `package.json` to keep numeric baselines stable for fixtures/validation.
- MCP entrypoint is `src/loader.ts` -> `src/index.ts`.
- CLI entrypoint is `src/cli.ts` (`e2a` bin), designed for single-shot stateless usage.
- CLI profiles are read from `.astro.json` via `src/profile-store.ts` (read-only in v1).
- Ephemeris files are expected under `data/ephemeris` and configured via `set_ephe_path()`.
- Server state is process-local and in-memory: one mutable `natalChart` in `src/index.ts`.

## Fast Commands
- Install: `npm install`
- Build: `npm run build`
- CLI: `npm run start:cli -- --help`
- Unit/integration tests: `npm test -- --run`
- Routine quality gate: `npm run quality:gate`
- Validation harness: `npm run validate:astro`
- Strict dead-code check: `npm run build -- --noUnusedLocals --noUnusedParameters`
- Lint: `npm run lint`

## Code Map
- `src/astro-service.ts`: shared business logic used by both MCP and CLI.
- `src/index.ts`: MCP tool schemas + request handling + stateful orchestration.
- `src/cli.ts`: commander-based single-shot CLI surface.
- `src/profile-store.ts`: `.astro.json` profile resolution + schema validation for CLI.
- `src/ephemeris.ts`: low-level ephemeris adapter, JD/date conversion, position calc, exact root solver.
- `src/transits.ts`: transit detection, exact-time policy, applying/separating selection, dedupe.
- `src/houses.ts`: house cusps + polar fallback behavior.
- `src/riseset.ts`: rise/set/meridian event semantics.
- `src/eclipses.ts`: next solar/lunar eclipse lookup.
- `src/time-utils.ts`: Temporal-based timezone/DST conversions.
- `src/charts.ts`: AstroChart SVG rendering and image conversion.

## Validation Harness Map
- `tests/validation/validation.spec.ts`: end-to-end validation suite.
- `tests/validation/utils/denseRootOracle.ts`: independent dense-scan oracle for root finding.
- `tests/validation/compare/*`: subsystem comparators and mismatch severity.
- `tests/validation/adapters/internal.ts`: normalized adapter over production code.
- `tests/validation/adapters/astrolog.ts`: optional external CLI parity.
- Report output: `/tmp/astro-validation-report.json`.

## Non-Negotiable Behavior Invariants
- Root solver and oracle must stay logically independent.
- Root count mismatches are hard failures (not warnings).
- Transit exact-time status semantics must remain explicit:
  - `within_preview`
  - `outside_preview`
  - `not_found`
  - `unsupported_body`
  - `undefined` means exact-time was not attempted because orb is too wide.
- Rise/set semantics are “next event after anchor instant”, not “civil-day bucket”.
- DST ambiguity/nonexistent local times for birth data must honor disambiguation policy.

## Tolerances (Validation)
Defined in `tests/validation/utils/tolerances.ts`:
- Position longitude/latitude/speed: `0.0001`
- Houses: `0.01°`
- Root timing preferred: `2 min`
- Root timing hard fail: `10 min`
- Rise/set and eclipse timing (same-engine refs): `1 min`
- Root dedupe epsilon: `1 min`

## High-Risk Areas (Change Carefully)
- `EphemerisCalculator.findExactTransitTimes()` in `src/ephemeris.ts`.
- Transit root-selection policy in `src/transits.ts`.
- Time conversion/disambiguation in `src/time-utils.ts`.
- CLI/MCP surface drift between `src/cli.ts`, `src/index.ts`, and `src/astro-service.ts`.
- Packaging / bin / publish behavior for `e2a` and `e2a-mcp`.
- Capability checks and comparator severity in validation harness.

## Review Priority Ladder
- **P1** - Wrong astro math, wrong timezone/DST handling, wrong transit/root behavior, CLI/MCP contract drift, packaging/bin/publish breakage, or validation regressions that could ship incorrect results.
- **P2** - Missing or weak tests for high-risk changes, docs/help-text drift, profile resolution regressions, or changes that make validation/debugging harder.
- **P3** - Style, cleanup, wording, and low-risk refactors with no behavioral impact.

## Safe Change Workflow
1. Make focused edits (avoid broad refactors).
2. Run `npm run quality:gate` for normal changes.
3. Run `npm run validate:astro` for high-risk astro engine changes.
4. If root mismatches appear, inspect `/tmp/astro-validation-report.json` details:
   - production roots
   - oracle roots
   - residuals
   - sampled trace
   - crossing metadata
5. Only relax fixtures/tolerances with explicit justification.

## Repo Contract
- Routine merge gate is `npm run build`, `npm run lint`, and `npm test -- --run`.
- `npm run validate:astro` is targeted validation, not the default gate for every change.
- Biome is the source of truth for formatting, import order, and linting.
- CLI profile resolution is adapter-only behavior; do not leak `.astro.json`, `--profile`, or profile-file semantics into MCP tool contracts.
- `src/astro-service.ts` is the shared behavior layer; prefer fixing logic there before adding surface-specific patches in CLI or MCP.
- Preferred commit types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- Keep commits scoped to one coherent change whenever possible.

## Release Governance
- `main` is PR-only and branch-protected; do not push directly.
- Use Conventional Commits / commitizen-style messages for all commits.
- Version bumps are release actions, not routine feature commits:
  1. Merge release-ready fixes to `main` via PR.
  2. On `main`, run `npm version patch|minor|major` (creates commit + tag).
  3. Push commit and tag, then publish a GitHub Release for that tag.
  4. `release.yml` handles npm publish via trusted publishing.
- Keep release commit message explicit (for example: `chore(release): 1.0.1`) when invoking version bump.
- Do not cut/version tags from feature branches.

## Known Gotchas
- `sweph` has process-wide settings (e.g., ephemeris path); avoid per-request mutation.
- In the normal Node runtime, rise/set and eclipse functionality are expected to work. Treat breakage there as a real regression, not as optional capability drift.
- `get_server_status` is the source of truth for loaded-chart state on the MCP side. Do not invent parallel state reporting elsewhere.

## Agent Style for This Repo
- Prefer minimal, typed, fixture-driven changes.
- Keep adapter normalization stable when comparing outputs.
- Do not mask solver regressions with broad dedupe/tolerance changes.
- Keep external CLI parity optional and auto-skippable.
- If changing command/tool signatures, update all three together: schema/help text, implementation, and tests.
- For release-facing changes, check README/help text/package metadata for drift.
