# Astro MCP Test Suite

Comprehensive unit and integration tests for the Astro MCP server with 80% code coverage target.

## Test Structure

```
tests/
├── unit/                      # Unit tests for individual modules
│   ├── ephemeris.test.ts      # Ephemeris calculations (18 tests)
│   ├── transits.test.ts       # Transit calculations (9 tests)
│   ├── houses.test.ts         # House system calculations (8 tests)
│   ├── charts.test.ts         # Chart rendering (16 tests)
│   ├── storage.test.ts        # Natal chart storage (8 tests)
│   └── formatter.test.ts      # Time formatting (6 tests)
├── integration/               # Integration tests (planned)
│   ├── mcp-tools.test.ts      # MCP tool handlers
│   └── end-to-end.test.ts     # Full workflow scenarios
├── fixtures/                  # Test data and fixtures
│   ├── bowen-yang-chart.ts    # Bowen Yang's birth chart
│   └── expected-results.ts    # Known calculation results
└── setup.ts                   # Test environment setup

Total: 65+ tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

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
- **Minimum 80%** across all metrics (lines, functions, branches, statements)
- Focus on core calculation logic
- Exclude logging and entry points

### Testing Strategy
1. **Unit Tests:** Test individual modules in isolation
2. **Integration Tests:** Test MCP tool handlers and workflows
3. **Mocking:** Use Moshier fallback for fast tests (no ephemeris files needed)
4. **Real Data:** Use Bowen Yang's chart for realistic scenarios

## Current Status

✅ **Completed:**
- Test infrastructure setup (vitest + coverage)
- Test fixtures with Bowen Yang's chart
- Formatter tests (6/6 passing)
- Test environment configuration

🚧 **In Progress:**
- Core unit tests (ephemeris, transits, houses, charts, storage)
- WASM/fetch mocking for Swiss Ephemeris
- Integration tests for MCP tools

## Known Issues

### WASM Loading in Tests
The Swiss Ephemeris library uses WASM which requires special handling in Node.js test environment:
- **Solution:** Mock fetch API in `tests/setup.ts`
- **Fallback:** Uses Moshier calculations when WASM unavailable
- **Impact:** Tests run faster without ephemeris files

### AstroChart Browser Dependencies
The AstroChart library expects browser globals:
- **Solution:** Use jsdom environment in vitest config
- **Polyfill:** Add `self` global in setup file

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

### WASM Loading Fails
Check that `tests/setup.ts` properly mocks fetch API.

### Coverage Too Low
Run with `--coverage` to see which lines aren't covered, then add targeted tests.

## Future Enhancements

- [ ] Integration tests for all 12 MCP tools
- [ ] End-to-end workflow tests
- [ ] Performance benchmarks
- [ ] Snapshot testing for chart SVG output
- [ ] Parameterized tests for multiple birth charts
- [ ] Real ephemeris data integration tests
