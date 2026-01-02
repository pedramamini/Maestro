import { describe, it, expect } from 'vitest';
import {
  formatFlowResult,
  formatFlowResultAsJson,
  formatFlowResultCompact,
  formatBatchFlowResult,
  formatStepsTable,
  formatStatusBadge,
  formatDuration,
  formatProgressBar,
  FlowFormatOptions,
} from '../../../main/ios-tools/action-formatter';
import { FlowRunResult, FlowStepResult, BatchFlowResult } from '../../../main/ios-tools/flow-runner';

describe('action-formatter', () => {
  // Helper to create a mock flow result
  const createFlowResult = (overrides: Partial<FlowRunResult> = {}): FlowRunResult => ({
    passed: true,
    duration: 5000,
    flowPath: '/test/flows/login.yaml',
    udid: 'mock-udid-1234',
    totalSteps: 5,
    passedSteps: 5,
    failedSteps: 0,
    skippedSteps: 0,
    steps: [
      { index: 0, name: 'Launch app', passed: true, duration: 500 },
      { index: 1, name: 'Tap Login', passed: true, duration: 200 },
      { index: 2, name: 'Enter email', passed: true, duration: 300 },
      { index: 3, name: 'Enter password', passed: true, duration: 300 },
      { index: 4, name: 'Assert Welcome', passed: true, duration: 100 },
    ],
    rawOutput: '✓ Step 1\n✓ Step 2\n✓ Step 3',
    exitCode: 0,
    ...overrides,
  });

  describe('formatFlowResult', () => {
    it('formats a passing flow result', () => {
      const result = createFlowResult();
      const formatted = formatFlowResult(result);

      expect(formatted.status).toBe('PASSED');
      expect(formatted.summary).toContain('PASSED');
      expect(formatted.summary).toContain('5/5');
      expect(formatted.markdown).toContain('✓ Flow Execution PASSED');
    });

    it('formats a failing flow result', () => {
      const result = createFlowResult({
        passed: false,
        passedSteps: 3,
        failedSteps: 2,
        error: 'Element not found: Welcome message',
        steps: [
          { index: 0, name: 'Launch app', passed: true },
          { index: 1, name: 'Tap Login', passed: true },
          { index: 2, name: 'Assert Welcome', passed: false, error: 'Element not found' },
        ],
      });
      const formatted = formatFlowResult(result);

      expect(formatted.status).toBe('FAILED');
      expect(formatted.summary).toContain('FAILED');
      expect(formatted.markdown).toContain('✗ Flow Execution FAILED');
      expect(formatted.markdown).toContain('Element not found');
    });

    it('includes step details when requested', () => {
      const result = createFlowResult();
      const formatted = formatFlowResult(result, { includeSteps: true });

      expect(formatted.markdown).toContain('### Steps');
      expect(formatted.markdown).toContain('✓ Launch app');
      expect(formatted.markdown).toContain('✓ Tap Login');
    });

    it('excludes step details when not requested', () => {
      const result = createFlowResult();
      const formatted = formatFlowResult(result, { includeSteps: false });

      expect(formatted.markdown).not.toContain('### Steps');
    });

    it('includes artifact paths when available', () => {
      const result = createFlowResult({
        passed: false,
        failureScreenshotPath: '/artifacts/failure.png',
        reportPath: '/artifacts/report.xml',
      });
      const formatted = formatFlowResult(result, { includeArtifactPaths: true });

      expect(formatted.markdown).toContain('### Artifacts');
      expect(formatted.markdown).toContain('failure.png');
      expect(formatted.markdown).toContain('report.xml');
    });

    it('truncates long error messages', () => {
      const longError = 'A'.repeat(1000);
      const result = createFlowResult({
        passed: false,
        error: longError,
      });
      const formatted = formatFlowResult(result, { maxErrorLength: 100 });

      expect(formatted.markdown).toContain('...');
      expect(formatted.markdown.length).toBeLessThan(result.error!.length + 500);
    });

    it('includes raw output in verbose mode', () => {
      const result = createFlowResult();
      const formatted = formatFlowResult(result, { includeRawOutput: true, verbose: true });

      expect(formatted.markdown).toContain('Raw Output');
      expect(formatted.markdown).toContain(result.rawOutput);
    });

    it('formats duration in seconds', () => {
      const result = createFlowResult({ duration: 12500 });
      const formatted = formatFlowResult(result);

      expect(formatted.summary).toContain('12.5s');
    });
  });

  describe('formatFlowResultAsJson', () => {
    it('returns valid JSON', () => {
      const result = createFlowResult();
      const json = formatFlowResultAsJson(result);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('includes all relevant fields', () => {
      const result = createFlowResult({
        failureScreenshotPath: '/path/to/screenshot.png',
      });
      const parsed = JSON.parse(formatFlowResultAsJson(result));

      expect(parsed.passed).toBe(true);
      expect(parsed.status).toBe('PASSED');
      expect(parsed.durationSeconds).toBe('5.0');
      expect(parsed.steps.total).toBe(5);
      expect(parsed.steps.passed).toBe(5);
      expect(parsed.artifacts.failureScreenshot).toBe('/path/to/screenshot.png');
      expect(parsed.stepDetails).toHaveLength(5);
    });

    it('includes error in JSON for failed flows', () => {
      const result = createFlowResult({
        passed: false,
        error: 'Test error message',
      });
      const parsed = JSON.parse(formatFlowResultAsJson(result));

      expect(parsed.status).toBe('FAILED');
      expect(parsed.error).toBe('Test error message');
    });
  });

  describe('formatFlowResultCompact', () => {
    it('formats passing result as single line', () => {
      const result = createFlowResult();
      const compact = formatFlowResultCompact(result);

      expect(compact).toBe('PASSED 5/5 steps (5.0s)');
    });

    it('formats failing result with brief error', () => {
      const result = createFlowResult({
        passed: false,
        passedSteps: 3,
        error: 'This is a very long error message that should be truncated in the compact format',
      });
      const compact = formatFlowResultCompact(result);

      expect(compact).toContain('FAILED');
      expect(compact).toContain('3/5');
      expect(compact.length).toBeLessThan(100);
    });

    it('handles zero duration', () => {
      const result = createFlowResult({ duration: 0 });
      const compact = formatFlowResultCompact(result);

      expect(compact).toContain('0.0s');
    });
  });

  describe('formatBatchFlowResult', () => {
    const createBatchResult = (overrides: Partial<BatchFlowResult> = {}): BatchFlowResult => ({
      totalFlows: 3,
      passedFlows: 3,
      failedFlows: 0,
      results: [
        createFlowResult({ flowPath: '/flows/flow1.yaml' }),
        createFlowResult({ flowPath: '/flows/flow2.yaml' }),
        createFlowResult({ flowPath: '/flows/flow3.yaml' }),
      ],
      totalDuration: 15000,
      ...overrides,
    });

    it('formats all-passing batch result', () => {
      const batch = createBatchResult();
      const formatted = formatBatchFlowResult(batch);

      expect(formatted.status).toBe('PASSED');
      expect(formatted.summary).toContain('3/3 flows passed');
      expect(formatted.markdown).toContain('✓ Batch Flow Execution PASSED');
    });

    it('formats batch with failures', () => {
      const batch = createBatchResult({
        passedFlows: 2,
        failedFlows: 1,
        results: [
          createFlowResult({ flowPath: '/flows/flow1.yaml' }),
          createFlowResult({
            flowPath: '/flows/flow2.yaml',
            passed: false,
            error: 'Failed',
            failureScreenshotPath: '/path/to/failure.png',
          }),
          createFlowResult({ flowPath: '/flows/flow3.yaml' }),
        ],
      });
      const formatted = formatBatchFlowResult(batch);

      expect(formatted.status).toBe('FAILED');
      expect(formatted.summary).toContain('2/3 flows passed');
      expect(formatted.markdown).toContain('### Failed Flows');
    });

    it('includes individual flow results', () => {
      const batch = createBatchResult();
      const formatted = formatBatchFlowResult(batch, { includeSteps: true });

      expect(formatted.markdown).toContain('### Flow Results');
      expect(formatted.markdown).toContain('flow1');
      expect(formatted.markdown).toContain('flow2');
      expect(formatted.markdown).toContain('flow3');
    });

    it('excludes flow results when not requested', () => {
      const batch = createBatchResult();
      const formatted = formatBatchFlowResult(batch, { includeSteps: false });

      expect(formatted.markdown).not.toContain('### Flow Results');
    });
  });

  describe('formatStepsTable', () => {
    it('formats steps as markdown table', () => {
      const steps: FlowStepResult[] = [
        { index: 0, name: 'Step 1', passed: true, duration: 100 },
        { index: 1, name: 'Step 2', passed: false, duration: 200 },
      ];
      const table = formatStepsTable(steps);

      expect(table).toContain('| # | Step | Status | Duration |');
      expect(table).toContain('| 1 | Step 1 | ✓ Passed | 100ms |');
      expect(table).toContain('| 2 | Step 2 | ✗ Failed | 200ms |');
    });

    it('handles empty steps array', () => {
      const table = formatStepsTable([]);
      expect(table).toBe('No steps recorded.');
    });

    it('handles steps without duration', () => {
      const steps: FlowStepResult[] = [{ index: 0, name: 'Step', passed: true }];
      const table = formatStepsTable(steps);

      expect(table).toContain('| - |');
    });

    it('uses default name for unnamed steps', () => {
      const steps: FlowStepResult[] = [{ index: 0, passed: true }];
      const table = formatStepsTable(steps);

      expect(table).toContain('Step 1');
    });
  });

  describe('formatStatusBadge', () => {
    it('returns green badge for passed result', () => {
      const result = createFlowResult({ passed: true });
      const badge = formatStatusBadge(result);

      expect(badge).toContain('passed');
      expect(badge).toContain('green');
    });

    it('returns red badge for failed result', () => {
      const result = createFlowResult({ passed: false });
      const badge = formatStatusBadge(result);

      expect(badge).toContain('failed');
      expect(badge).toContain('red');
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5.0s');
      expect(formatDuration(12500)).toBe('12.5s');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('handles zero', () => {
      expect(formatDuration(0)).toBe('0ms');
    });
  });

  describe('formatProgressBar', () => {
    it('formats full progress bar', () => {
      const bar = formatProgressBar(10, 10, 10);
      expect(bar).toBe('[██████████] 100%');
    });

    it('formats empty progress bar', () => {
      const bar = formatProgressBar(0, 10, 10);
      expect(bar).toBe('[░░░░░░░░░░] 0%');
    });

    it('formats partial progress bar', () => {
      const bar = formatProgressBar(5, 10, 10);
      expect(bar).toBe('[█████░░░░░] 50%');
    });

    it('handles zero total', () => {
      const bar = formatProgressBar(0, 0, 10);
      expect(bar).toBe('[░░░░░░░░░░] 0%');
    });

    it('uses default width of 20', () => {
      const bar = formatProgressBar(10, 10);
      expect(bar.length).toBe('['.length + 20 + '] 100%'.length);
    });

    it('rounds percentage correctly', () => {
      const bar = formatProgressBar(1, 3, 10);
      expect(bar).toContain('33%');
    });
  });
});
