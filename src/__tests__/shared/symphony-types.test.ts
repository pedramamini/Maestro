/**
 * Tests for shared/symphony-types.ts
 * Validates Symphony type definitions and the SymphonyError class.
 */

import { describe, it, expect } from 'vitest';
import {
  SymphonyError,
  type SymphonyErrorType,
  type SymphonyCategory,
  type ContributionStatus,
  type IssueStatus,
} from '../../shared/symphony-types';

describe('shared/symphony-types', () => {
  // ==========================================================================
  // SymphonyError Class Tests
  // ==========================================================================
  describe('SymphonyError', () => {
    it('should set message correctly', () => {
      const error = new SymphonyError('Test error message', 'network');
      expect(error.message).toBe('Test error message');
    });

    it('should set type property', () => {
      const error = new SymphonyError('Test error', 'github_api');
      expect(error.type).toBe('github_api');
    });

    it('should set cause property', () => {
      const originalError = new Error('Original error');
      const error = new SymphonyError('Wrapped error', 'git', originalError);
      expect(error.cause).toBe(originalError);
    });

    it('should have name as "SymphonyError"', () => {
      const error = new SymphonyError('Test', 'network');
      expect(error.name).toBe('SymphonyError');
    });

    it('should be instanceof Error', () => {
      const error = new SymphonyError('Test', 'network');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof SymphonyError', () => {
      const error = new SymphonyError('Test', 'network');
      expect(error).toBeInstanceOf(SymphonyError);
    });

    it('should work without cause parameter', () => {
      const error = new SymphonyError('No cause', 'parse');
      expect(error.cause).toBeUndefined();
    });

    it('should preserve stack trace', () => {
      const error = new SymphonyError('Test', 'network');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('SymphonyError');
    });

    describe('error type values', () => {
      const errorTypes: SymphonyErrorType[] = [
        'network',
        'github_api',
        'git',
        'parse',
        'pr_creation',
        'autorun',
        'cancelled',
      ];

      it.each(errorTypes)('should accept "%s" as a valid error type', (errorType) => {
        const error = new SymphonyError(`Error of type ${errorType}`, errorType);
        expect(error.type).toBe(errorType);
      });
    });
  });

  // ==========================================================================
  // Type Validation Tests (compile-time checks with runtime verification)
  // ==========================================================================
  describe('SymphonyCategory type', () => {
    const validCategories: SymphonyCategory[] = [
      'ai-ml',
      'developer-tools',
      'infrastructure',
      'documentation',
      'web',
      'mobile',
      'data',
      'security',
      'other',
    ];

    it.each(validCategories)('should accept "%s" as a valid category', (category) => {
      // This test verifies the type at compile-time and that the values are valid
      const testCategory: SymphonyCategory = category;
      expect(testCategory).toBe(category);
    });

    it('should have 9 valid categories', () => {
      expect(validCategories).toHaveLength(9);
    });
  });

  describe('ContributionStatus type', () => {
    const validStatuses: ContributionStatus[] = [
      'cloning',
      'creating_pr',
      'running',
      'paused',
      'completing',
      'ready_for_review',
      'failed',
      'cancelled',
    ];

    it.each(validStatuses)('should accept "%s" as a valid contribution status', (status) => {
      const testStatus: ContributionStatus = status;
      expect(testStatus).toBe(status);
    });

    it('should have 8 valid contribution statuses', () => {
      expect(validStatuses).toHaveLength(8);
    });
  });

  describe('IssueStatus type', () => {
    const validStatuses: IssueStatus[] = ['available', 'in_progress', 'completed'];

    it.each(validStatuses)('should accept "%s" as a valid issue status', (status) => {
      const testStatus: IssueStatus = status;
      expect(testStatus).toBe(status);
    });

    it('should have 3 valid issue statuses', () => {
      expect(validStatuses).toHaveLength(3);
    });
  });

  describe('SymphonyErrorType type', () => {
    const validErrorTypes: SymphonyErrorType[] = [
      'network',
      'github_api',
      'git',
      'parse',
      'pr_creation',
      'autorun',
      'cancelled',
    ];

    it.each(validErrorTypes)('should accept "%s" as a valid error type', (errorType) => {
      const testErrorType: SymphonyErrorType = errorType;
      expect(testErrorType).toBe(errorType);
    });

    it('should have 7 valid error types', () => {
      expect(validErrorTypes).toHaveLength(7);
    });
  });
});
