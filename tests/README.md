# Astro Test Suite

Comprehensive unit and validation tests for the `e2a` CLI and `e2a-mcp` server, with an 80% global coverage target.

## Test Structure

```
tests/
├── unit/                      # Unit tests for runtime and domain modules
│   ├── astro-service.test.ts  # Service orchestration and tool-facing behavior
│   ├── cli*.test.ts           # CLI contracts, profiles, error handling
│   ├── tool-registry.test.ts  # MCP tool spec mapping and execution wrappers
│   ├── ephemeris/transits/*   # Core astrology math and solver behavior
│   ├── riseset/eclipses/*     # Event calculators and edge flags
│   └── charts/houses/*        # Rendering and house-system behavior
├── property/                  # `fast-check` invariant coverage and shrinkable counterexamples
├── helpers/                   # Reusable test helpers/builders
├── fixtures/                  # Test data and fixtures
│   ├── bowen-yang-chart.ts    # Bowen Yang's birth chart
│   └── expected-results.ts    # Known calculation results
├── setup.ts                   # Test environment setup
└── validation/                # End-to-end validation harness

Total: 150+ tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run property tests
npm run test:property

# Run tests with UI
npm run test:ui

# Run specific test file
npm test tests/unit/ephemeris.test.ts

# Watch mode
npm test -- --watch
```

## Test Data

### Bowen Yang's Birth Chart
- **Born:** November 6, 1990, 11:30 AM
- **Location:** Brisbane, Australia (27.4705°S, 153.0260°E)
- **Timezone:** Australia/Brisbane (UTC+10)

This real-world chart is used throughout the test suite to ensure calculations work with actual astrological data.

## Test Philosophy

### User Story Format
Tests are written as user stories to make them readable and maintainable:

```typescript
describe('When an AI asks "What transits is Bowen experiencing today?"', () => {
  it('should find transits between current planets and natal planets', () => {
    // Test implementation
  });
});
```

### Coverage Goals
- **Minimum 80%** across lines, functions, branches, and statements
- Preserve high-fidelity solver tests while adding deterministic orchestration tests
- Exclude logging/entrypoint-only modules from coverage gates

### Testing Strategy
1. **Core math lane:** Real ephemeris/solver behavior (minimal mocking)
2. **Orchestration lane:** Fast deterministic tests with injected mocks/fakes
3. **Filesystem/profile lane:** Temp-fs integration style for precedence and parsing
4. **Validation lane:** Cross-check production outputs with oracle comparators
5. **Property lane:** Generated invariant checks with `fast-check`

### Property Lane
- Property tests live under `tests/property/`.
- Seeded reruns are supported via:
  - `ASTRO_PROPERTY_SEED`
  - `ASTRO_PROPERTY_RUNS`
  - `ASTRO_PROPERTY_HEAVY_RUNS`
- This lane is additive and intentionally separate from `quality:gate` for now.
- Use it for invariants, determinism, and shrinkable counterexamples rather than external parity.

## Current Status

✅ **Completed:**
- Unit suites for service, CLI, registry, domain calculators, and profile store
- Validation harness with subsystem comparators and dense root oracle
- Property-test lane for generated invariants across time utils, services, houses, and transits
- Deterministic time setup and fixture-driven real-world chart checks

## Known Issues

### Ephemeris in Tests
The project uses native `sweph` bindings in Node.js:
- **Setup:** `tests/setup.ts` fixes test time for deterministic output
- **Data:** tests use real ephemeris logic with local ephemeris files when available
- **Fallback:** Moshier mode remains available when ephemeris files are missing

### AstroChart Browser Dependencies
The chart library expects browser-like globals:
- Use `jsdom` test environment
- Polyfill `self` in `tests/setup.ts`

## Coverage Reports

After running `npm run test:coverage`, view reports at:
- **HTML:** `coverage/index.html`
- **LCOV:** `coverage/lcov.info` (for CI/CD)
- **JSON:** `coverage/coverage-final.json`

## CI/CD Integration

Tests are designed to run in GitHub Actions:
```yaml
- name: Run tests with coverage
  run: npm run test:coverage
- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Writing New Tests

### Example Test Structure
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { ModuleToTest } from '../../src/module.js';
import { bowenYangChart } from '../fixtures/bowen-yang-chart.js';

describe('When a user wants to [action]', () => {
  let instance: ModuleToTest;

  beforeAll(async () => {
    instance = new ModuleToTest();
    await instance.init();
  });

  describe('Given [context]', () => {
    it('should [expected behavior]', () => {
      // Arrange
      const input = bowenYangChart;
      
      // Act
      const result = instance.method(input);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.property).toBe(expectedValue);
    });
  });
});
```

### Best Practices
1. Use descriptive test names that read like sentences
2. Follow Arrange-Act-Assert pattern
3. Use Bowen Yang's chart for realistic data
4. Mock external dependencies (file I/O, network)
5. Test edge cases (polar regions, retrograde planets, etc.)
6. Keep tests fast (<30s total runtime)

## Troubleshooting

### Tests Timeout
Increase timeout in `vitest.config.ts`:
```typescript
testTimeout: 30000 // 30 seconds
```

### Ephemeris Data Missing
Check that `data/ephemeris` exists or reinstall with `npm install` (runs postinstall downloader).

### Coverage Too Low
Run with `--coverage` to see which lines aren't covered, then add targeted tests.

## Future Enhancements

- [ ] Thread-level MCP request/response integration tests
- [ ] CI flake detector pass (repeat-run sampling on key suites)
- [ ] Additional chart rendering failure-path contract tests
