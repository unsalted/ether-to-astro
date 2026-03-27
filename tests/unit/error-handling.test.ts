import { describe, it, expect } from 'vitest';
import {
  missingNatalChart,
  noRiseSetEvent,
  circumpolarObject,
  polarLatitudeWarning,
  mapSweError,
} from '../../src/tool-result.js';

describe('Structured error handling', () => {
  describe('missingNatalChart', () => {
    it('should return structured error with correct fields', () => {
      const error = missingNatalChart();
      
      expect(error.code).toBe('MISSING_NATAL_CHART');
      expect(error.message).toContain('No natal chart found');
      expect(error.retryable).toBe(true);
      expect(error.suggestedFix).toContain('set_natal_chart');
    });
  });

  describe('noRiseSetEvent', () => {
    it('should create error for missing rise event', () => {
      const error = noRiseSetEvent('rise', 'Sun', { latitude: 78, date: '2026-12-21' });
      
      expect(error.code).toBe('NO_RISE_SET_EVENT');
      expect(error.message).toContain('rise');
      expect(error.message).toContain('Sun');
      expect(error.retryable).toBe(true);
      expect(error.suggestedFix).toContain('circumpolar');
      expect(error.details).toEqual({ latitude: 78, date: '2026-12-21' });
    });

    it('should create error for missing meridian transit', () => {
      const error = noRiseSetEvent('upper_meridian', 'Moon', { latitude: 85 });
      
      expect(error.code).toBe('NO_RISE_SET_EVENT');
      expect(error.message).toContain('upper_meridian');
      expect(error.message).toContain('Moon');
    });
  });

  describe('circumpolarObject', () => {
    it('should create circumpolar error with latitude', () => {
      const error = circumpolarObject('Sun', 78.5);
      
      expect(error.code).toBe('CIRCUMPOLAR_OBJECT');
      expect(error.message).toContain('circumpolar');
      expect(error.message).toContain('78.5');
      expect(error.retryable).toBe(true);
      expect(error.suggestedFix).toContain('meridian transit');
      expect(error.details?.latitude).toBe(78.5);
    });
  });

  describe('polarLatitudeWarning', () => {
    it('should create warning for polar Placidus', () => {
      const warning = polarLatitudeWarning(78.2, 'Placidus');
      
      expect(warning.code).toBe('POLAR_LATITUDE_LIMIT');
      expect(warning.message).toContain('78.2');
      expect(warning.message).toContain('Placidus');
      expect(warning.retryable).toBe(true);
      expect(warning.suggestedFix).toContain('Whole Sign');
    });
  });

  describe('mapSweError', () => {
    it('should map not initialized error', () => {
      const error = mapSweError('planet calculation', new Error('Ephemeris not initialized'));
      
      expect(error.code).toBe('EPHEMERIS_NOT_INITIALIZED');
      expect(error.retryable).toBe(false);
      expect(error.suggestedFix).toContain('Initialize');
    });

    it('should map generic computation error', () => {
      const error = mapSweError('house calculation', new Error('Unknown failure'), { latitude: 40 });
      
      expect(error.code).toBe('EPHEMERIS_COMPUTE_FAILED');
      expect(error.message).toContain('house calculation');
      expect(error.retryable).toBe(false);
      expect(error.details?.latitude).toBe(40);
      expect(error.details?.rawMessage).toBe('Unknown failure');
    });

    it('should handle non-Error objects', () => {
      const error = mapSweError('test', 'string error message');
      
      expect(error.code).toBe('EPHEMERIS_COMPUTE_FAILED');
      expect(error.details?.rawMessage).toBe('string error message');
    });
  });

  describe('Error structure validation', () => {
    it('should have all required fields', () => {
      const error = missingNatalChart();
      
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('message');
      expect(error).toHaveProperty('retryable');
      expect(typeof error.code).toBe('string');
      expect(typeof error.message).toBe('string');
      expect(typeof error.retryable).toBe('boolean');
    });

    it('should have optional suggestedFix and details', () => {
      const error = noRiseSetEvent('rise', 'Sun', { test: 'data' });
      
      expect(error.suggestedFix).toBeDefined();
      expect(error.details).toBeDefined();
      expect(typeof error.suggestedFix).toBe('string');
      expect(typeof error.details).toBe('object');
    });
  });
});
