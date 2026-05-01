import { describe, expect, it } from 'vitest';
import {
	selectAutoPickupAssignments,
	type AgentDispatchAssignmentPolicyInput,
} from '../../../main/agent-dispatch';
import type { AgentDispatchFleetEntry } from '../../../shared/agent-dispatch-types';
import type { WorkItem } from '../../../shared/work-graph-types';

const baseAgent: AgentDispatchFleetEntry = {
	id: 'agent-a',
	agentId: 'codex',
	sessionId: 'agent-a',
	displayName: 'Agent A',
	providerType: 'codex',
	host: 'local',
	locality: 'local',
	readiness: 'idle',
	currentClaims: [],
	currentLoad: 0,
	dispatchCapabilities: ['typescript', 'tests'],
	dispatchProfile: {
		autoPickupEnabled: true,
		capabilityTags: ['typescript', 'tests'],
		maxConcurrentClaims: 2,
	},
	pickupEnabled: true,
	updatedAt: '2026-04-30T10:00:00.000Z',
};

function agent(overrides: Partial<AgentDispatchFleetEntry>): AgentDispatchFleetEntry {
	return {
		...baseAgent,
		...overrides,
		dispatchProfile: {
			...baseAgent.dispatchProfile,
			...overrides.dispatchProfile,
		},
	};
}

function workItem(overrides: Partial<WorkItem>): WorkItem {
	return {
		id: 'work-1',
		type: 'task',
		status: 'ready',
		title: 'Work item',
		projectPath: '/repo',
		gitPath: '/repo',
		source: 'manual',
		readonly: false,
		tags: ['agent-ready', 'typescript'],
		createdAt: '2026-04-30T10:00:00.000Z',
		updatedAt: '2026-04-30T10:00:00.000Z',
		...overrides,
	};
}

describe('selectAutoPickupAssignments', () => {
	it('selects deterministic, load-aware agent assignments with capability overlap', () => {
		const input: AgentDispatchAssignmentPolicyInput = {
			fleet: [
				agent({
					id: 'agent-b',
					displayName: 'Agent B',
					currentLoad: 1,
					updatedAt: '2026-04-30T09:00:00.000Z',
				}),
				agent({
					id: 'agent-a',
					displayName: 'Agent A',
					currentLoad: 0,
					updatedAt: '2026-04-30T11:00:00.000Z',
				}),
			],
			workItems: [
				workItem({
					id: 'work-low',
					priority: 1,
					createdAt: '2026-04-30T09:00:00.000Z',
				}),
				workItem({
					id: 'work-high',
					priority: 5,
					createdAt: '2026-04-30T11:00:00.000Z',
					tags: ['agent-ready', 'tests'],
				}),
			],
		};

		const decisions = selectAutoPickupAssignments(input);

		expect(decisions.map((decision) => [decision.workItem.id, decision.agent.id])).toEqual([
			['work-high', 'agent-a'],
			['work-low', 'agent-b'],
		]);
		expect(decisions[0].capabilityOverlap).toEqual(['tests']);
	});

	it('ignores busy, saturated, disabled, claimed, untagged, and non-overlapping work', () => {
		const decisions = selectAutoPickupAssignments({
			fleet: [
				agent({ id: 'busy', readiness: 'busy' }),
				agent({ id: 'disabled', pickupEnabled: false }),
				agent({ id: 'saturated', currentLoad: 2 }),
				agent({ id: 'eligible', dispatchCapabilities: ['typescript'] }),
			],
			workItems: [
				workItem({
					id: 'claimed',
					claim: {
						id: 'c1',
						workItemId: 'claimed',
						owner: { type: 'agent', id: 'other' },
						status: 'active',
						source: 'auto-pickup',
						claimedAt: '2026-04-30T00:00:00.000Z',
					},
				}),
				workItem({ id: 'untagged', tags: ['typescript'] }),
				workItem({ id: 'wrong-capability', tags: ['agent-ready', 'docs'] }),
				workItem({ id: 'eligible', tags: ['agent-ready', 'typescript'] }),
			],
		});

		expect(decisions.map((decision) => decision.workItem.id)).toEqual(['eligible']);
		expect(decisions[0].agent.id).toBe('eligible');
	});
});
