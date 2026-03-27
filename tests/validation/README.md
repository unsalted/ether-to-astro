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
- Dense-scan root oracle is independent from production `findExactTransitTimes()`.
- Hard failures fail the test run.
- Soft mismatches are logged as warnings.
- A machine-readable report is written to `/tmp/astro-validation-report.json`.

Tolerance summary:

- Position parity (same engine): `0.0001°` for longitude/latitude/speed
- Houses: `0.01°`
- Exact roots: preferred `<=2 min`, hard fail `>10 min`
- Rise/set and eclipse times (same engine references): `<=1 min`
