import { describe, expect, it } from 'vitest';
import {
	buildAutoRunDocumentTaskState,
	buildAutoRunPredecessorContext,
	buildAutoRunAggregateUsageStats,
	buildAutoRunDocumentPromptSection,
	buildAutoRunLoopSummaryEntry,
	buildAutoRunStagePrompt,
	buildAutoRunTaskRecord,
	buildAutoRunVerifierNote,
	buildAutoRunTotalSummaryDetails,
	computeAutoRunTaskProgress,
	finalizeAutoRunTaskExecution,
	finalizeAutoRunTaskPresentation,
	finalizePlanExecuteVerifyResult,
	mergeAutoRunVerifierVerdict,
} from '../../shared/autorunExecutionModel';

const instructions = {
	planner: 'Planner instruction',
	executor: 'Executor instruction',
	verifier: 'Verifier instruction',
} as const;

describe('autorunExecutionModel', () => {
	it('builds document prompt sections for active-task-only mode', () => {
		const prompt = buildAutoRunDocumentPromptSection(
			'/repo/docs/task.md',
			'- [ ] Task 1',
			'active-task-only'
		);

		expect(prompt).toContain('# Current Document: /repo/docs/task.md');
		expect(prompt).toContain(
			'Only the active unchecked task and minimal nearby context are inlined below'
		);
		expect(prompt).toContain('- [ ] Task 1');
	});

	it('derives shared document task state from markdown content', () => {
		const state = buildAutoRunDocumentTaskState(`# Tasks
- [ ] Pending
- [x] Done
  - [ ] Nested pending`);

		expect(state.content).toContain('# Tasks');
		expect(state.taskCount).toBe(2);
		expect(state.checkedCount).toBe(1);
	});

	it('builds planner prompts with shared skill guidance for plan-execute-verify', () => {
		const prompt = buildAutoRunStagePrompt({
			stage: 'planner',
			agentStrategy: 'plan-execute-verify',
			instructions,
			basePrompt: 'Base prompt',
			documentPrompt: 'Document prompt',
			skillPromptBlock: '## Skills\n- gitnexus',
		});

		expect(prompt).toContain('Planner instruction');
		expect(prompt).toContain('Base prompt');
		expect(prompt).toContain('## Skills');
		expect(prompt).toContain('Document prompt');
	});

	it('builds verifier prompts with verification metadata and no shared skill block', () => {
		const prompt = buildAutoRunStagePrompt({
			stage: 'verifier',
			agentStrategy: 'plan-execute-verify',
			instructions,
			basePrompt: 'Base prompt',
			documentPrompt: 'Document prompt',
			skillPromptBlock: '## Skills\n- gitnexus',
			executorOutput: 'Updated task state',
			definitionOfDone: ['Relevant tests pass'],
			verificationSteps: ['Confirm the document changed'],
		});

		expect(prompt).toContain('Verifier instruction');
		expect(prompt).toContain('## Verification Steps');
		expect(prompt).toContain('- Confirm the document changed');
		expect(prompt).toContain('## Definition of Done');
		expect(prompt).toContain('- Relevant tests pass');
		expect(prompt).toContain('## Executor Output');
		expect(prompt).toContain('Updated task state');
		expect(prompt).not.toContain('## Skills');
	});

	it('builds deterministic predecessor context for join nodes', () => {
		const context = buildAutoRunPredecessorContext(
			['beta', 'alpha', 'missing'],
			new Map([
				[
					'alpha',
					{
						documentName: 'phase-a',
						summaries: ['Implemented the fan-out branch.', 'Implemented the fan-out branch.'],
						success: true,
						verifierVerdict: 'PASS',
					},
				],
				[
					'beta',
					{
						documentName: 'phase-b',
						summaries: ['Found one remaining gap.'],
						success: true,
						verifierVerdict: 'WARN',
					},
				],
			])
		);

		expect(context).toContain('## Predecessor Outputs');
		expect(context).toContain('### phase-b [WARN]');
		expect(context).toContain('### phase-a [PASS]');
		expect(context.indexOf('### phase-b [WARN]')).toBeLessThan(
			context.indexOf('### phase-a [PASS]')
		);
		expect(context).toContain('### missing [MISSING]');
		expect(context.match(/Implemented the fan-out branch\./g)).toHaveLength(1);
	});

	it('merges verifier verdict severity predictably', () => {
		expect(mergeAutoRunVerifierVerdict('PASS', 'WARN')).toBe('WARN');
		expect(mergeAutoRunVerifierVerdict('WARN', 'PASS')).toBe('WARN');
		expect(mergeAutoRunVerifierVerdict('PASS', 'FAIL')).toBe('FAIL');
		expect(mergeAutoRunVerifierVerdict(null, 'PASS')).toBe('PASS');
		expect(mergeAutoRunVerifierVerdict(undefined, undefined)).toBeNull();
	});

	it('finalizes task presentation with verifier note and peak context usage', () => {
		const presentation = finalizeAutoRunTaskPresentation({
			toolType: 'codex',
			usageBreakdown: {
				planner: {
					inputTokens: 100,
					outputTokens: 20,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					totalCostUsd: 0.01,
					contextWindow: 1000,
				},
				executor: {
					inputTokens: 500,
					outputTokens: 40,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					totalCostUsd: 0.03,
					contextWindow: 2000,
				},
			},
			usageStats: {
				inputTokens: 600,
				outputTokens: 60,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
				totalCostUsd: 0.04,
				contextWindow: 2000,
			},
			shortSummary: 'Updated task state',
			fullSynopsis: 'Patched the relevant files.',
			verifierVerdict: 'WARN',
			verifierNote: 'WARN\nMissing one regression test.',
		});

		expect(presentation.shortSummary).toBe('[WARN] Updated task state');
		expect(presentation.fullSynopsis).toContain('Patched the relevant files.');
		expect(presentation.fullSynopsis).toContain('Verifier:\nWARN\nMissing one regression test.');
		expect(presentation.contextDisplayUsageStats?.inputTokens).toBe(500);
	});

	it('computes shared task progress with checked counts when available', () => {
		const progress = computeAutoRunTaskProgress({
			previousRemainingTasks: 3,
			newRemainingTasks: 2,
			taskSucceeded: true,
			previousCheckedCount: 1,
			newCheckedCount: 2,
		});

		expect(progress.tasksCompletedThisRun).toBe(1);
		expect(progress.countedCompletedTasks).toBe(1);
		expect(progress.addedUncheckedTasks).toBe(0);
		expect(progress.totalTasksChange).toBe(0);
	});

	it('computes shared task progress from remaining counts without checked counts', () => {
		const progress = computeAutoRunTaskProgress({
			previousRemainingTasks: 4,
			newRemainingTasks: 3,
			taskSucceeded: false,
		});

		expect(progress.tasksCompletedThisRun).toBe(1);
		expect(progress.countedCompletedTasks).toBe(0);
		expect(progress.addedUncheckedTasks).toBeUndefined();
		expect(progress.totalTasksChange).toBeUndefined();
	});

	it('builds a reusable task record payload', () => {
		const record = buildAutoRunTaskRecord({
			usageStats: {
				inputTokens: 100,
				outputTokens: 10,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
				totalCostUsd: 0.01,
				contextWindow: 1000,
			},
			contextDisplayUsageStats: {
				inputTokens: 80,
				outputTokens: 8,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
				totalCostUsd: 0.008,
				contextWindow: 900,
			},
			usageBreakdown: {},
			shortSummary: 'Updated task summary',
			fullSynopsis: 'Updated task full response',
			verifierVerdict: 'PASS',
		});

		expect(record.summary).toBe('Updated task summary');
		expect(record.fullResponse).toBe('Updated task full response');
		expect(record.usageStats?.inputTokens).toBe(100);
		expect(record.contextDisplayUsageStats?.contextWindow).toBe(900);
		expect(record.verifierVerdict).toBe('PASS');
	});

	it('builds verifier notes from either response or error text', () => {
		expect(buildAutoRunVerifierNote('PASS\nLooks good.', undefined)).toBe('PASS\nLooks good.');
		expect(buildAutoRunVerifierNote(undefined, 'Timed out after 5000ms')).toBe(
			'Timed out after 5000ms'
		);
	});

	it('finalizes timeout progress as a successful task execution', () => {
		const finalized = finalizeAutoRunTaskExecution({
			documentName: 'phase-1',
			toolType: 'codex',
			result: {
				success: false,
				timedOut: true,
				error: 'Timed out after 5000ms',
			},
			previousTaskState: buildAutoRunDocumentTaskState('- [ ] Task 1'),
			nextTaskState: buildAutoRunDocumentTaskState('- [x] Task 1'),
		});

		expect(finalized.success).toBe(true);
		expect(finalized.completedAfterTimeout).toBe(true);
		expect(finalized.tasksCompletedThisRun).toBe(1);
		expect(finalized.countedCompletedTasks).toBe(1);
		expect(finalized.taskRecord.summary).toContain('completed before timeout');
	});

	it('counts completed work when the finished task is removed from the document', () => {
		const finalized = finalizeAutoRunTaskExecution({
			documentName: 'phase-1',
			toolType: 'claude-code',
			result: {
				success: true,
				response: 'Removed the completed task from the checklist.',
			},
			previousTaskState: buildAutoRunDocumentTaskState('- [ ] Task 1'),
			nextTaskState: buildAutoRunDocumentTaskState(''),
		});

		expect(finalized.success).toBe(true);
		expect(finalized.tasksCompletedThisRun).toBe(1);
		expect(finalized.countedCompletedTasks).toBe(1);
	});

	it('reverts newly checked tasks when a task fails after changing the document', () => {
		const finalized = finalizeAutoRunTaskExecution({
			documentName: 'phase-1',
			toolType: 'claude-code',
			result: {
				success: false,
				response: 'Attempted a change.',
				error: 'Verification failed.',
			},
			previousTaskState: buildAutoRunDocumentTaskState('- [ ] Task 1'),
			nextTaskState: buildAutoRunDocumentTaskState('- [x] Task 1'),
			verifierVerdict: 'FAIL',
			verifierNote: 'FAIL\nVerification failed.',
		});

		expect(finalized.success).toBe(false);
		expect(finalized.shouldPersistTaskState).toBe(true);
		expect(finalized.finalTaskState.content).toBe('- [ ] Task 1');
		expect(finalized.tasksCompletedThisRun).toBe(0);
		expect(finalized.countedCompletedTasks).toBe(0);
		expect(finalized.taskRecord.fullResponse).toContain('Verifier:\nFAIL\nVerification failed.');
	});

	it('builds aggregate usage stats only when tokens exist', () => {
		expect(buildAutoRunAggregateUsageStats(0, 0, 0)).toBeUndefined();
		expect(buildAutoRunAggregateUsageStats(10, 5, 0.01)).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			cacheReadInputTokens: 0,
			cacheCreationInputTokens: 0,
			totalCostUsd: 0.01,
			contextWindow: 0,
		});
	});

	it('builds loop summary history entries for looping summaries', () => {
		const entry = buildAutoRunLoopSummaryEntry({
			timestamp: 123,
			loopIteration: 1,
			loopTasksCompleted: 3,
			loopElapsedMs: 65000,
			loopTotalInputTokens: 100,
			loopTotalOutputTokens: 20,
			loopTotalCost: 0.04,
			projectPath: '/repo',
			sessionId: 'session-1',
			isFinal: false,
			tasksDiscoveredForNextLoop: 2,
			playbookId: 'playbook-1',
			playbookName: 'DAG Sweep',
			promptProfile: 'compact-code',
			agentStrategy: 'plan-execute-verify',
			worktreeMode: 'managed',
			schedulerMode: 'dag',
			configuredSchedulerMode: 'sequential',
			schedulerOutcome: 'completed',
		});

		expect(entry.summary).toBe('Loop 2 completed: 3 tasks accomplished');
		expect(entry.fullResponse).toContain('**Loop 2 Summary**');
		expect(entry.fullResponse).toContain('- **Observed Scheduler:** DAG');
		expect(entry.fullResponse).toContain('- **Scheduler Intent:** Sequential');
		expect(entry.fullResponse).toContain('- **Tasks Discovered for Next Loop:** 2');
		expect(entry.usageStats?.inputTokens).toBe(100);
		expect(entry.projectPath).toBe('/repo');
		expect(entry.playbookId).toBe('playbook-1');
		expect(entry.playbookName).toBe('DAG Sweep');
		expect(entry.promptProfile).toBe('compact-code');
		expect(entry.agentStrategy).toBe('plan-execute-verify');
		expect(entry.worktreeMode).toBe('managed');
		expect(entry.schedulerMode).toBe('dag');
		expect(entry.configuredSchedulerMode).toBe('sequential');
		expect(entry.schedulerOutcome).toBe('completed');
	});

	it('builds total summary details with shared formatting', () => {
		const details = buildAutoRunTotalSummaryDetails({
			totalCompletedTasks: 4,
			totalElapsedMs: 125000,
			loopsCompleted: 2,
			totalInputTokens: 120,
			totalOutputTokens: 30,
			totalCost: 0.05,
			statusMessage: 'Completed',
			observedSchedulerMode: 'dag',
			configuredSchedulerMode: 'sequential',
			documentsLine: '- **Documents:** a.md, b.md',
			extraSections: ['**Achievement Progress**', '- Level 1'],
		});

		expect(details).toContain('**Auto Run Summary**');
		expect(details).toContain('- **Status:** Completed');
		expect(details).toContain('- **Total Tasks Completed:** 4');
		expect(details).toContain('- **Loops Completed:** 2');
		expect(details).toContain('- **Observed Scheduler:** DAG');
		expect(details).toContain('- **Scheduler Intent:** Sequential');
		expect(details).toContain('- **Documents:** a.md, b.md');
		expect(details).toContain('**Achievement Progress**');
	});

	it('finalizes plan-execute-verify results with merged usage and verifier response', () => {
		const result = finalizePlanExecuteVerifyResult({
			executorResult: {
				success: true,
				response: 'Executor changed files.',
				usageStats: {
					inputTokens: 100,
					outputTokens: 20,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					totalCostUsd: 0.01,
					contextWindow: 1000,
				},
				agentSessionId: 'executor-session',
			},
			verifierResult: {
				success: true,
				response: 'PASS\nLooks good.',
				usageStats: {
					inputTokens: 40,
					outputTokens: 10,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
					totalCostUsd: 0.005,
					contextWindow: 800,
				},
			},
			mergedUsageStats: {
				inputTokens: 140,
				outputTokens: 30,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
				totalCostUsd: 0.015,
				contextWindow: 1000,
			},
			verifierVerdict: 'PASS',
		});

		expect(result.success).toBe(true);
		expect(result.response).toContain('Executor changed files.');
		expect(result.response).toContain('Verifier:\nPASS');
		expect(result.usageStats?.inputTokens).toBe(140);
		expect(result.agentSessionId).toBe('executor-session');
	});
});
