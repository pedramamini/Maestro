import { describe, expect, it } from 'vitest';

import { buildWorkItemCreateInput } from '../../cli/commands/pm-work';

describe('pm work create input builder', () => {
	it('maps PM PRD kind to a Work Graph document item', () => {
		const input = buildWorkItemCreateInput({
			title: 'OAuth2 Login',
			kind: 'prd',
			project: '/repo',
			json: true,
		});

		expect(input).toMatchObject({
			title: 'OAuth2 Login',
			type: 'document',
			status: 'planned',
			source: 'manual',
			projectPath: '/repo',
			gitPath: '/repo',
			tags: ['maestro-pm', 'prd'],
			metadata: {
				localPm: {
					fields: {
						'AI Stage': 'prd',
					},
				},
			},
		});
	});

	it('maps PM task kind to a ready dispatchable Work Graph task', () => {
		const input = buildWorkItemCreateInput({
			title: 'Configure Passport strategies',
			kind: 'task',
			project: '/repo',
			tag: ['runner,security'],
			parent: 'epic-1',
			priority: '5',
			json: true,
		});

		expect(input).toMatchObject({
			type: 'task',
			status: 'ready',
			parentWorkItemId: 'epic-1',
			priority: 5,
			tags: ['maestro-pm', 'task', 'runner', 'security', 'agent-ready'],
			metadata: {
				localPm: {
					fields: {
						'AI Stage': 'task',
					},
				},
			},
		});
	});

	it('keeps legacy create defaults when no PM kind is provided', () => {
		const input = buildWorkItemCreateInput({
			title: 'Loose work item',
			project: '/repo',
			json: true,
		});

		expect(input.type).toBe('task');
		expect(input.status).toBeUndefined();
		expect(input.tags).toBeUndefined();
		expect(input.metadata).toBeUndefined();
	});
});
