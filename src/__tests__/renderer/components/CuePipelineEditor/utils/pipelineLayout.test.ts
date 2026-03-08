/**
 * Tests for pipeline layout merge/restore utilities.
 *
 * Verifies that saved layout state is correctly merged with live pipeline
 * data, including the critical case where selectedPipelineId is null
 * ("All Pipelines" mode).
 */

import { describe, it, expect } from 'vitest';
import { mergePipelinesWithSavedLayout } from '../../../../../renderer/components/CuePipelineEditor/utils/pipelineLayout';
import type { CuePipeline, PipelineLayoutState } from '../../../../../shared/cue-pipeline-types';

function makePipeline(overrides: Partial<CuePipeline> = {}): CuePipeline {
	return {
		id: 'p1',
		name: 'test-pipeline',
		color: '#06b6d4',
		nodes: [
			{
				id: 'trigger-1',
				type: 'trigger',
				position: { x: 0, y: 0 },
				data: {
					eventType: 'time.heartbeat',
					label: 'Timer',
					config: { interval_minutes: 5 },
				},
			},
			{
				id: 'agent-1',
				type: 'agent',
				position: { x: 300, y: 0 },
				data: {
					sessionId: 's1',
					sessionName: 'worker',
					toolType: 'claude-code',
					inputPrompt: 'Do work',
				},
			},
		],
		edges: [{ id: 'e1', source: 'trigger-1', target: 'agent-1', mode: 'pass' }],
		...overrides,
	};
}

describe('mergePipelinesWithSavedLayout', () => {
	it('preserves null selectedPipelineId (All Pipelines mode)', () => {
		const livePipelines = [makePipeline()];
		const savedLayout: PipelineLayoutState = {
			pipelines: [makePipeline()],
			selectedPipelineId: null,
		};

		const result = mergePipelinesWithSavedLayout(livePipelines, savedLayout);
		expect(result.selectedPipelineId).toBeNull();
	});

	it('preserves a specific selectedPipelineId from saved layout', () => {
		const livePipelines = [makePipeline(), makePipeline({ id: 'p2', name: 'second' })];
		const savedLayout: PipelineLayoutState = {
			pipelines: livePipelines,
			selectedPipelineId: 'p2',
		};

		const result = mergePipelinesWithSavedLayout(livePipelines, savedLayout);
		expect(result.selectedPipelineId).toBe('p2');
	});

	it('defaults to first pipeline id when selectedPipelineId is missing from layout', () => {
		const livePipelines = [makePipeline()];
		// Simulate a legacy saved layout that doesn't have selectedPipelineId at all
		const savedLayout = {
			pipelines: [makePipeline()],
		} as PipelineLayoutState;

		// Delete the property so `in` check fails
		delete (savedLayout as unknown as Record<string, unknown>).selectedPipelineId;

		const result = mergePipelinesWithSavedLayout(livePipelines, savedLayout);
		expect(result.selectedPipelineId).toBe('p1');
	});

	it('merges saved node positions with live pipeline data', () => {
		const livePipelines = [makePipeline()];
		const savedLayout: PipelineLayoutState = {
			pipelines: [
				makePipeline({
					nodes: [
						{
							id: 'trigger-1',
							type: 'trigger',
							position: { x: 100, y: 200 },
							data: {
								eventType: 'time.heartbeat',
								label: 'Timer',
								config: { interval_minutes: 5 },
							},
						},
						{
							id: 'agent-1',
							type: 'agent',
							position: { x: 500, y: 300 },
							data: {
								sessionId: 's1',
								sessionName: 'worker',
								toolType: 'claude-code',
								inputPrompt: 'Do work',
							},
						},
					],
				}),
			],
			selectedPipelineId: 'p1',
		};

		const result = mergePipelinesWithSavedLayout(livePipelines, savedLayout);

		// Positions from saved layout should override live defaults
		const triggerNode = result.pipelines[0].nodes.find((n) => n.id === 'trigger-1');
		const agentNode = result.pipelines[0].nodes.find((n) => n.id === 'agent-1');
		expect(triggerNode?.position).toEqual({ x: 100, y: 200 });
		expect(agentNode?.position).toEqual({ x: 500, y: 300 });
	});

	it('keeps live node positions when saved layout has no matching nodes', () => {
		const livePipelines = [makePipeline()];
		const savedLayout: PipelineLayoutState = {
			pipelines: [makePipeline({ nodes: [] })],
			selectedPipelineId: 'p1',
		};

		const result = mergePipelinesWithSavedLayout(livePipelines, savedLayout);

		// Original positions preserved
		const triggerNode = result.pipelines[0].nodes.find((n) => n.id === 'trigger-1');
		expect(triggerNode?.position).toEqual({ x: 0, y: 0 });
	});

	it('returns all live pipelines even when saved layout has fewer', () => {
		const livePipelines = [
			makePipeline({ id: 'p1', name: 'first' }),
			makePipeline({ id: 'p2', name: 'second' }),
		];
		const savedLayout: PipelineLayoutState = {
			pipelines: [makePipeline({ id: 'p1', name: 'first' })],
			selectedPipelineId: null,
		};

		const result = mergePipelinesWithSavedLayout(livePipelines, savedLayout);
		expect(result.pipelines).toHaveLength(2);
		expect(result.selectedPipelineId).toBeNull();
	});
});
