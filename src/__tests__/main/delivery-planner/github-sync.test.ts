/**
 * GitHub sync fork-safety tests for Delivery Planner.
 *
 * These tests verify the repository-safety guarantees in
 * `src/main/delivery-planner/github-sync.ts` and
 * `src/main/delivery-planner/github-safety.ts`:
 *   - `DeliveryPlannerGithubSync` only targets the configured repository (see `DELIVERY_PLANNER_GITHUB_REPOSITORY`).
 *   - Attempts to reference `RunMaestro/Maestro` are rejected before any
 *     `gh` CLI call.
 *   - Any repository other than `DELIVERY_PLANNER_GITHUB_REPOSITORY` is rejected.
 *   - `assertDeliveryPlannerGithubRepository` enforces the fork target directly.
 *   - `DeliveryPlannerGithubSafetyError` is the canonical safety error class.
 *
 * Note: full happy-path sync flows are covered by the canonical inline tests
 * in `src/main/delivery-planner/__tests__/github-sync.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecResult } from '../../../main/utils/execFile';
import type { WorkItem } from '../../../shared/work-graph-types';
import {
	DELIVERY_PLANNER_GITHUB_REPOSITORY,
	DELIVERY_PLANNER_UPSTREAM_REPOSITORY,
	DeliveryPlannerGithubSafetyError,
	assertDeliveryPlannerGithubRepository,
} from '../../../main/delivery-planner/github-safety';
import { DeliveryPlannerGithubSync } from '../../../main/delivery-planner/github-sync';

const ok = (stdout: string): ExecResult => ({ stdout, stderr: '', exitCode: 0 });

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
	const timestamp = '2026-04-30T00:00:00.000Z';
	return {
		id: 'item-1',
		type: 'task',
		status: 'ready',
		title: 'Sync GitHub progress',
		description: 'Test item.',
		projectPath: '/project',
		gitPath: '/project',
		source: 'delivery-planner',
		readonly: false,
		tags: ['delivery-planner'],
		createdAt: timestamp,
		updatedAt: timestamp,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// assertDeliveryPlannerGithubRepository — direct guard
// ---------------------------------------------------------------------------

describe('assertDeliveryPlannerGithubRepository', () => {
	it('does not throw for the canonical fork repository', () => {
		expect(() =>
			assertDeliveryPlannerGithubRepository(DELIVERY_PLANNER_GITHUB_REPOSITORY)
		).not.toThrow();
	});

	it('throws DeliveryPlannerGithubSafetyError for RunMaestro/Maestro', () => {
		expect(() =>
			assertDeliveryPlannerGithubRepository(DELIVERY_PLANNER_UPSTREAM_REPOSITORY)
		).toThrow(DeliveryPlannerGithubSafetyError);
	});

	it('throws DeliveryPlannerGithubSafetyError for an arbitrary third-party repo', () => {
		expect(() => assertDeliveryPlannerGithubRepository('SomeOrg/SomeRepo')).toThrow(
			DeliveryPlannerGithubSafetyError
		);
	});

	it('error message mentions RunMaestro/Maestro when that is the blocked target', () => {
		expect(() =>
			assertDeliveryPlannerGithubRepository(DELIVERY_PLANNER_UPSTREAM_REPOSITORY)
		).toThrowError(/RunMaestro\/Maestro/);
	});

	it('error message mentions the allowed fork target', () => {
		expect(() => assertDeliveryPlannerGithubRepository('SomeOrg/SomeRepo')).toThrowError(
			new RegExp(DELIVERY_PLANNER_GITHUB_REPOSITORY)
		);
	});
});

// ---------------------------------------------------------------------------
// DeliveryPlannerGithubSync — fork-safety on syncIssue
// ---------------------------------------------------------------------------

describe('DeliveryPlannerGithubSync — fork-safety', () => {
	let exec: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		exec = vi.fn().mockResolvedValue(ok('{}'));
	});

	it('rejects an upstream GitHub reference before calling gh', async () => {
		const sync = new DeliveryPlannerGithubSync({ exec });

		await expect(
			sync.syncIssue(
				makeWorkItem({
					github: {
						owner: DELIVERY_PLANNER_GITHUB_OWNER,
						repo: 'Maestro',
						// TypeScript normally prevents this; JS callers or type-cast code could pass it.
						repository: 'RunMaestro/Maestro' as typeof DELIVERY_PLANNER_GITHUB_REPOSITORY,
						issueNumber: 1,
					},
				})
			)
		).rejects.toBeInstanceOf(DeliveryPlannerGithubSafetyError);

		expect(exec).not.toHaveBeenCalled();
	});

	it('does not call gh for RunMaestro/Maestro on syncIssue', async () => {
		const sync = new DeliveryPlannerGithubSync({ exec });

		await sync
			.syncIssue(
				makeWorkItem({
					github: {
						owner: DELIVERY_PLANNER_GITHUB_OWNER,
						repo: 'Maestro',
						repository: 'RunMaestro/Maestro' as typeof DELIVERY_PLANNER_GITHUB_REPOSITORY,
						issueNumber: 1,
					},
				})
			)
			.catch(() => {});

		expect(exec).not.toHaveBeenCalled();
	});

	it('does not call gh for a third-party repository on syncIssue', async () => {
		const sync = new DeliveryPlannerGithubSync({ exec });

		await sync
			.syncIssue(
				makeWorkItem({
					github: {
						owner: 'SomeOrg',
						repo: 'SomeRepo',
						repository: 'SomeOrg/SomeRepo' as typeof DELIVERY_PLANNER_GITHUB_REPOSITORY,
						issueNumber: 99,
					},
				})
			)
			.catch(() => {});

		expect(exec).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// DeliveryPlannerGithubSync — successful sync against fork
// ---------------------------------------------------------------------------

describe('DeliveryPlannerGithubSync — successful fork sync', () => {
	function makeSuccessExec() {
		return vi.fn(async (_command: string, args: string[]) => {
			if (args[0] === 'issue' && args[1] === 'create') {
				return ok(`https://github.com/${DELIVERY_PLANNER_GITHUB_OWNER}/${DELIVERY_PLANNER_GITHUB_REPO}/issues/99\n`);
			}
			if (args[0] === 'project' && args[1] === 'view') {
				return ok(JSON.stringify({ id: 'proj-7', title: 'Humpf Tech Maestro Features' }));
			}
			if (args[0] === 'project' && args[1] === 'item-add') {
				return ok(JSON.stringify({ id: 'item-99' }));
			}
			if (args[0] === 'project' && args[1] === 'field-list') {
				return ok(
					JSON.stringify({
						fields: [
							{ name: 'Maestro Major', id: 'f1', dataType: 'TEXT' },
							{ name: 'Work Item Type', id: 'f2', dataType: 'TEXT' },
							{ name: 'Parent Work Item', id: 'f3', dataType: 'TEXT' },
							{ name: 'CCPM ID', id: 'f4', dataType: 'TEXT' },
							{ name: 'Agent Pickup', id: 'f5', dataType: 'TEXT' },
						],
					})
				);
			}
			return ok('{}');
		});
	}

	it('only targets the configured repository', async () => {
		const exec = makeSuccessExec();
		const sync = new DeliveryPlannerGithubSync({ exec });

		await sync.syncIssue(makeWorkItem());

		for (const call of exec.mock.calls) {
			const args: string[] = call[1] ?? [];
			const rIndex = args.indexOf('-R');
			if (rIndex !== -1) {
				expect(args[rIndex + 1]).toBe(DELIVERY_PLANNER_GITHUB_REPOSITORY);
			}
		}
	});

	it('result contains a fork-local github reference', async () => {
		const exec = makeSuccessExec();
		const sync = new DeliveryPlannerGithubSync({ exec });

		const result = await sync.syncIssue(makeWorkItem());

		expect(result.github).toMatchObject({
			owner: DELIVERY_PLANNER_GITHUB_OWNER,
			repo: 'Maestro',
			repository: DELIVERY_PLANNER_GITHUB_REPOSITORY,
			issueNumber: 99,
		});
	});

	it('result.created is true when a new issue is created', async () => {
		const exec = makeSuccessExec();
		const sync = new DeliveryPlannerGithubSync({ exec });

		const result = await sync.syncIssue(makeWorkItem());

		expect(result.created).toBe(true);
	});
});
