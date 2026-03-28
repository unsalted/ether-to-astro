import { describe, expect, it } from 'vitest';
import {
  failure,
  mapSweError,
  mcpError,
  mcpResult,
  success,
  type ToolIssue,
} from '../../src/tool-result.js';

describe('When building tool result envelopes', () => {
  it('Given success and failure inputs, then wrapper helpers return the expected discriminated shapes', () => {
    const warning: ToolIssue = { code: 'INVALID_INPUT', message: 'warn', retryable: true };
    expect(success({ ok: 1 })).toEqual({ ok: true, data: { ok: 1 } });
    expect(success({ ok: 1 }, [warning])).toEqual({ ok: true, data: { ok: 1 }, warnings: [warning] });
    expect(failure(warning)).toEqual({ ok: false, error: warning });
  });

  it('Given a successful MCP result with optional warnings, then content envelope includes expected fields', () => {
    const withoutWarnings = mcpResult({ x: 1 }, 'ok');
    const withWarnings = mcpResult({ x: 1 }, 'ok', [
      { code: 'INVALID_INPUT', message: 'warn', retryable: true },
    ]);
    expect(withoutWarnings.content).toHaveLength(2);
    expect(withWarnings.content).toHaveLength(2);
    expect(withWarnings.content[0].text).toContain('"warnings"');
  });

  it('Given an MCP error, then envelope marks isError and includes structured payload', () => {
    const result = mcpError({ code: 'INTERNAL_ERROR', message: 'boom', retryable: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"ok": false');
    expect(result.content[0].text).toContain('"INTERNAL_ERROR"');
  });

  it('Given sweph initialization and generic errors, then mapSweError returns correct issue codes/details', () => {
    const init = mapSweError('calc', new Error('not initialized'));
    expect(init.code).toBe('EPHEMERIS_NOT_INITIALIZED');
    expect(init.details).toBeUndefined();

    const generic = mapSweError('houses', new Error('bad value'), { lat: 1 });
    expect(generic.code).toBe('EPHEMERIS_COMPUTE_FAILED');
    expect(generic.details).toMatchObject({ lat: 1, rawMessage: 'bad value' });
  });
});
