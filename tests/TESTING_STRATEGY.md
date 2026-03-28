# Testing Strategy for Astro MCP

## Date Mocking Approach

### Why Mock Dates?
Astrological calculations depend on the current date/time. Without mocking, tests would:
- Produce different results each day
- Fail unpredictably as planets move
- Make it impossible to write deterministic assertions

### Fixed Test Date
All tests use a **fixed "current" date**: **March 26, 2024, 12:00:00 UTC**

This is set in `tests/setup.ts`:
```typescript
export const FIXED_TEST_DATE = new Date('2024-03-26T12:00:00Z');
vi.setSystemTime(FIXED_TEST_DATE);
```

### Expected Results Calculation

Instead of hardcoding expected values, we:

1. **Calculate actual results** using the real ephemeris library
2. **Record those results** as expected values
3. **Assert against recorded values** in tests

#### Process:
```bash
# 1. Run the calculation script
npm run calculate-expected

# 2. Copy output into expected-results.ts
# 3. Use those values in test assertions
```

This ensures:
- ✅ Tests verify calculations are **consistent**
- ✅ Tests don't fail due to ephemeris precision differences
- ✅ We can detect **regressions** in calculation logic
- ✅ Expected values are **real**, not guessed

## Test Data Strategy

### Primary Test Chart: Bowen Yang
- **Born:** November 6, 1990, 11:30 AM Brisbane
- **UTC:** November 6, 1990, 01:30 UTC
- **Why:** Real person with publicly known birth data

### Secondary Test Charts
- **Midnight Chart:** Edge case for date boundaries
- **Polar Chart:** Edge case for extreme latitudes

## Assertion Patterns

### ✅ Good: Range Assertions
```typescript
// When exact value depends on ephemeris precision
expect(sunPosition.longitude).toBeGreaterThan(210);
expect(sunPosition.longitude).toBeLessThan(240);
expect(sunPosition.sign).toBe('Scorpio');
```

### ✅ Good: Calculated Expected Values
```typescript
// After running calculate-expected.ts
import { EXPECTED_NATAL_POSITIONS } from '../fixtures/expected-results.js';

expect(sunPosition.longitude).toBeCloseTo(EXPECTED_NATAL_POSITIONS.sun.longitude, 2);
```

### ❌ Bad: Hardcoded Guesses
```typescript
// Don't do this - values are guessed
expect(sunPosition.longitude).toBe(223.5);
```

### ❌ Bad: Using new Date()
```typescript
// Don't do this - produces different results each day
const currentJD = ephem.dateToJulianDay(new Date());
```

## Mocking Strategy

### What We Mock
1. **Date/Time:** Fixed to March 26, 2024, 12:00 UTC
2. **Orchestration dependencies:** Mock file writes, service adapters, and runtime context in CLI/service tests

### What We DON'T Mock
1. **Ephemeris Calculations:** Use real Moshier calculations
2. **Chart Rendering:** Use real AstroChart library
3. **House Calculations:** Use real Swiss Ephemeris algorithms

## Coverage Strategy

### Target: 80% Minimum
- **Lines:** 80%
- **Functions:** 80%
- **Branches:** 80%
- **Statements:** 80%

### Excluded from Coverage
- `src/loader.ts` - Entry point
- `src/logger.ts` - Logging utility
- `scripts/` - Build scripts
- Test files themselves

### Coverage Focus Areas
1. **High-risk runtime surfaces**
   - `astro-service`, `tool-registry`, `cli`, `riseset`, `eclipses`
2. **Core calculations**
   - Ephemeris calculations
   - Transit finding and exact-time status handling
   - House fallback behavior
3. **Output contracts**
   - JSON/text payloads
   - Chart content branches and file-output handling

## Test Organization

### Unit Tests
Two lanes:
1. **Core math lane** (minimal mocking): ephemeris/transits/houses/temporal edge behavior
2. **Orchestration lane** (deterministic mocks): astro-service/tool-registry/cli/profile-store/riseset/eclipses

### Validation Tests
`tests/validation/*` provides end-to-end subsystem comparison against independent adapters/oracles.

## Running Tests

### Development
```bash
# Watch mode with UI
npm run test:ui

# Run specific file
npm test tests/unit/ephemeris.test.ts

# Run with coverage
npm run test:coverage
```

### CI/CD
```bash
# Run all tests with coverage (GitHub Actions)
npm run test:coverage
```

## Troubleshooting

### "Expected X but got Y"
- Run `npm run calculate-expected` to regenerate expected values
- Check if ephemeris data files changed
- Verify FIXED_TEST_DATE is being used

### "Tests pass locally but fail in CI"
- Ensure Date is mocked in setup.ts
- Check that ephemeris files are present (or run in Moshier mode)
- Verify no tests use `new Date()` directly

### "Coverage too low"
- Run with `--coverage` to identify low-signal modules first
- Add deterministic orchestration tests before expanding expensive ephemeris scenarios
- Remove vacuous assertions (`length >= 0`, conditional-pass guards)

## Best Practices

1. **Always use FIXED_TEST_DATE** for "current" time
2. **Calculate expected values** from real ephemeris
3. **Use range assertions** for floating-point comparisons
4. **Test edge cases** (retrograde, polar regions, date boundaries)
5. **Keep tests fast** (<30s total runtime)
6. **Write concise contract-oriented test names**
7. **Follow Arrange-Act-Assert** pattern
8. **Mock orchestration dependencies** (file I/O, clock, service adapters)
9. **Don't mock core solver logic** (ephemeris, root finding)
10. **Update expected values** when ephemeris library changes
