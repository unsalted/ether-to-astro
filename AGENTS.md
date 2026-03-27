# AGENTS.md

## Purpose
This file is for coding agents working in `astro-mcp`. It documents the real architecture and safe change workflow so edits stay correct and low-risk.

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
- Capability checks and comparator severity in validation harness.

## Safe Change Workflow
1. Make focused edits (avoid broad refactors).
2. Run `npm run build`.
3. Run `npm test -- --run`.
4. Run `npm run validate:astro`.
5. If root mismatches appear, inspect `/tmp/astro-validation-report.json` details:
   - production roots
   - oracle roots
   - residuals
   - sampled trace
   - crossing metadata
6. Only relax fixtures/tolerances with explicit justification.

## Known Gotchas
- `sweph` has process-wide settings (e.g., ephemeris path); avoid per-request mutation.

## Agent Style for This Repo
- Prefer minimal, typed, fixture-driven changes.
- Keep adapter normalization stable when comparing outputs.
- Do not mask solver regressions with broad dedupe/tolerance changes.
- Keep external CLI parity optional and auto-skippable.
