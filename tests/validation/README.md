# Astro Validation Harness

Run the core harness:

```bash
npm run validate:astro
```

Run with optional Astrolog parity:

```bash
VALIDATE_WITH_ASTROLOG=1 ASTROLOG_BIN=astrolog npm run validate:astro
```

Notes:

- Core validation requires only Node + this repo.
- Astrolog checks are optional and auto-skipped unless enabled and available.
- Astrolog parity is the repo's optional curated external-oracle lane.
- Astrolog parity covers a curated 25-fixture corpus (positions, houses, transit snapshots, and edge UTC normalization cases).
- Dense-scan root oracle is independent from production `findExactTransitTimes()`.
- The harness now validates both engine-level math and deterministic `AstroService` behavior.
- Hard failures fail the test run.
- Soft mismatches are logged as warnings.
- A machine-readable report is written to `/tmp/astro-validation-report.json`.
- Rise/set and eclipse sections are capability/smoke checks in this harness (exact parity references are not yet externalized there).
- Astrolog house parity treats Whole Sign ASC/MC cusp proxies as non-comparable; Whole Sign checks focus on cusp parity, while ASC/MC proxy warnings are reserved for non-Whole-Sign systems.

Service-layer coverage now includes:

- Electional context invariants: sect classification, near-horizon warnings, house fallback warnings, and optional-field toggles.
- Rising-sign window invariants: full local-day coverage, DST-transition serialization, deterministic repeats, and exact-vs-approximate boundary precision.
- Service-level transit serialization: enriched placement fields, explicit calculation/reporting timezones, forecast grouping, and sign-boundary carry behavior.

Property testing is intentionally separate from this harness:

- `npm run test:property` runs generated `fast-check` invariants.
- Property tests do not use Astrolog parity.
- Astrolog remains a named, curated, opt-in oracle lane for credibility and explainable golden-case comparisons.

Tolerance summary:

- Position parity (same engine): `0.0001°` for longitude/latitude/speed
- Houses: `0.01°`
- Exact roots: preferred `<=2 min`, hard fail `>10 min`
- Rise/set and eclipse times (same engine references): `<=1 min`
