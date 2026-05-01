import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
	appendStageTransition,
	appendRetryEvent,
} from '../../../../main/planning-pipeline/ccpm-mirror/stage-mirror';
import type {
	StageMirrorDeps,
	AppendResult,
} from '../../../../main/planning-pipeline/ccpm-mirror/stage-mirror';
import type { StageTransitionEntry } from '../../../../main/planning-pipeline/ccpm-mirror/stage-mirror-types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const FIXED_PATH = '/project/.claude/epics/my-epic/tasks/task-001.md';
const FIXED_TIME = '2026-04-30T18:42:01Z';

/** Minimal well-formed mirror document (no stage-transitions section). */
const BASE_MIRROR = `---
id: item-001
title: My Task
status: active
---

This is the task body.
`;

/** Mirror that already has a Stage transitions section. */
const MIRROR_WITH_SECTION = `---
id: item-001
title: My Task
status: active
---

This is the task body.

## Stage transitions

- 2026-04-30T10:00:00Z — system:planning-pipeline moved from none to agent-ready
`;

/** Build a minimal StageTransitionEntry. */
function makeEntry(overrides: Partial<StageTransitionEntry> = {}): StageTransitionEntry {
	return {
		workItemId: 'item-001',
		fromStage: 'agent-ready',
		toStage: 'runner-active',
		occurredAt: FIXED_TIME,
		actor: { type: 'agent', id: 'session-abc' },
		...overrides,
	};
}

/** Build a StageMirrorDeps stub backed by a mutable in-memory store. */
function makeDeps(initialContent: string | null = BASE_MIRROR): {
	deps: StageMirrorDeps;
	capturedWrites: { path: string; content: string }[];
} {
	const capturedWrites: { path: string; content: string }[] = [];
	let currentContent: string | null = initialContent;

	const deps: StageMirrorDeps = {
		readMirrorFile: vi.fn().mockImplementation(async (_filePath: string) => currentContent),
		writeMirrorFile: vi.fn().mockImplementation(async (filePath: string, content: string) => {
			currentContent = content;
			capturedWrites.push({ path: filePath, content });
		}),
		mirrorPathFor: vi.fn().mockResolvedValue(FIXED_PATH),
	};

	return { deps, capturedWrites };
}

// ---------------------------------------------------------------------------
// appendStageTransition
// ---------------------------------------------------------------------------

describe('appendStageTransition', () => {
	describe('when the mirror file does not exist (null)', () => {
		it('returns { appended: false } without writing', async () => {
			const { deps, capturedWrites } = makeDeps(null);
			const entry = makeEntry();

			const result: AppendResult = await appendStageTransition(deps, entry);

			expect(result.appended).toBe(false);
			expect(result.path).toBe(FIXED_PATH);
			expect(capturedWrites).toHaveLength(0);
			expect(deps.writeMirrorFile).not.toHaveBeenCalled();
		});
	});

	describe('when the mirror has no Stage transitions section', () => {
		it('creates the section and appends the entry', async () => {
			const { deps, capturedWrites } = makeDeps(BASE_MIRROR);
			const entry = makeEntry();

			const result = await appendStageTransition(deps, entry);

			expect(result.appended).toBe(true);
			expect(capturedWrites).toHaveLength(1);

			const written = capturedWrites[0].content;
			expect(written).toContain('## Stage transitions');
			expect(written).toContain(
				`- ${FIXED_TIME} — agent:session-abc moved from agent-ready to runner-active`
			);
		});

		it('preserves the existing body content before the new section', async () => {
			const { deps, capturedWrites } = makeDeps(BASE_MIRROR);
			const entry = makeEntry();

			await appendStageTransition(deps, entry);

			const written = capturedWrites[0].content;
			expect(written).toContain('This is the task body.');
			// Section must come after the body
			const bodyIdx = written.indexOf('This is the task body.');
			const sectionIdx = written.indexOf('## Stage transitions');
			expect(sectionIdx).toBeGreaterThan(bodyIdx);
		});
	});

	describe('when the mirror already has a Stage transitions section', () => {
		it('appends the new line at the end of the section without duplicating the header', async () => {
			const { deps, capturedWrites } = makeDeps(MIRROR_WITH_SECTION);
			const entry = makeEntry({
				fromStage: 'agent-ready',
				toStage: 'runner-active',
				occurredAt: '2026-04-30T19:00:00Z',
			});

			await appendStageTransition(deps, entry);

			const written = capturedWrites[0].content;
			// Only one section header
			const headerCount = (written.match(/## Stage transitions/g) ?? []).length;
			expect(headerCount).toBe(1);

			// New line must appear after the existing one
			const existingIdx = written.indexOf('2026-04-30T10:00:00Z');
			const newIdx = written.indexOf('2026-04-30T19:00:00Z');
			expect(newIdx).toBeGreaterThan(existingIdx);
		});

		it('preserves all prior entries in chronological order after multiple appends', async () => {
			const { deps, capturedWrites } = makeDeps(MIRROR_WITH_SECTION);

			const timestamps = [
				'2026-04-30T19:00:00Z',
				'2026-04-30T20:00:00Z',
				'2026-04-30T21:00:00Z',
			];

			for (const ts of timestamps) {
				await appendStageTransition(deps, makeEntry({ occurredAt: ts }));
			}

			const finalContent = capturedWrites[capturedWrites.length - 1].content;

			// The original entry must still be present
			expect(finalContent).toContain('2026-04-30T10:00:00Z');

			// All three appended timestamps must appear in order
			const idxs = timestamps.map((ts) => finalContent.indexOf(ts));
			expect(idxs[0]).toBeLessThan(idxs[1]);
			expect(idxs[1]).toBeLessThan(idxs[2]);
		});
	});

	describe('optional fields: attempt and reason', () => {
		it('includes [attempt N] when attempt is provided', async () => {
			const { deps, capturedWrites } = makeDeps(BASE_MIRROR);
			const entry = makeEntry({ attempt: 2 });

			await appendStageTransition(deps, entry);

			expect(capturedWrites[0].content).toContain('[attempt 2]');
		});

		it('includes [reason: "..."] when reason is provided', async () => {
			const { deps, capturedWrites } = makeDeps(BASE_MIRROR);
			const entry = makeEntry({ reason: 'pr-opened' });

			await appendStageTransition(deps, entry);

			expect(capturedWrites[0].content).toContain('[reason: "pr-opened"]');
		});

		it('includes both attempt and reason when both are provided', async () => {
			const { deps, capturedWrites } = makeDeps(BASE_MIRROR);
			const entry = makeEntry({ attempt: 1, reason: 'claim-expired' });

			await appendStageTransition(deps, entry);

			const line = capturedWrites[0].content;
			expect(line).toContain('[attempt 1]');
			expect(line).toContain('[reason: "claim-expired"]');
		});

		it('omits attempt and reason fields when neither is provided', async () => {
			const { deps, capturedWrites } = makeDeps(BASE_MIRROR);
			// No attempt or reason
			const entry = makeEntry();

			await appendStageTransition(deps, entry);

			const line = capturedWrites[0].content;
			expect(line).not.toContain('[attempt');
			expect(line).not.toContain('[reason:');
		});

		it('renders fromStage as "none" when fromStage is null', async () => {
			const { deps, capturedWrites } = makeDeps(BASE_MIRROR);
			const entry = makeEntry({ fromStage: null });

			await appendStageTransition(deps, entry);

			expect(capturedWrites[0].content).toContain('moved from none to runner-active');
		});
	});

	describe('path resolution', () => {
		it('uses the path returned by mirrorPathFor', async () => {
			const { deps } = makeDeps(BASE_MIRROR);
			const entry = makeEntry();

			const result = await appendStageTransition(deps, entry);

			expect(deps.mirrorPathFor).toHaveBeenCalledWith('item-001');
			expect(result.path).toBe(FIXED_PATH);
		});
	});
});

// ---------------------------------------------------------------------------
// appendRetryEvent
// ---------------------------------------------------------------------------

describe('appendRetryEvent', () => {
	it('returns { appended: false } when the mirror file is null', async () => {
		const { deps, capturedWrites } = makeDeps(null);

		const result = await appendRetryEvent(deps, {
			workItemId: 'item-001',
			attempt: 1,
			reason: 'claim expired',
			occurredAt: FIXED_TIME,
		});

		expect(result.appended).toBe(false);
		expect(capturedWrites).toHaveLength(0);
	});

	it('produces a RETRY line with a distinct format from a stage-transition line', async () => {
		const { deps, capturedWrites } = makeDeps(BASE_MIRROR);

		await appendRetryEvent(deps, {
			workItemId: 'item-001',
			attempt: 2,
			reason: 'claim expired',
			occurredAt: FIXED_TIME,
		});

		const written = capturedWrites[0].content;
		expect(written).toContain(
			`- ${FIXED_TIME} — system:planning-pipeline RETRY attempt=2 reason: "claim expired"`
		);
		// Must NOT look like a stage-transition line (no "moved from")
		const retryLine = written
			.split('\n')
			.find((l) => l.includes('RETRY'));
		expect(retryLine).toBeDefined();
		expect(retryLine).not.toContain('moved from');
	});

	it('creates the Stage transitions section when absent', async () => {
		const { deps, capturedWrites } = makeDeps(BASE_MIRROR);

		await appendRetryEvent(deps, {
			workItemId: 'item-001',
			attempt: 0,
			reason: 'initial claim timed out',
			occurredAt: FIXED_TIME,
		});

		expect(capturedWrites[0].content).toContain('## Stage transitions');
	});

	it('appends the retry line after existing transition entries', async () => {
		const { deps, capturedWrites } = makeDeps(MIRROR_WITH_SECTION);

		await appendRetryEvent(deps, {
			workItemId: 'item-001',
			attempt: 1,
			reason: 'timed out',
			occurredAt: '2026-04-30T20:00:00Z',
		});

		const written = capturedWrites[0].content;
		const existingIdx = written.indexOf('2026-04-30T10:00:00Z');
		const retryIdx = written.indexOf('RETRY attempt=1');
		expect(retryIdx).toBeGreaterThan(existingIdx);
	});

	it('interleaves correctly with stage-transition appends', async () => {
		const { deps, capturedWrites } = makeDeps(MIRROR_WITH_SECTION);

		await appendStageTransition(
			deps,
			makeEntry({ occurredAt: '2026-04-30T19:00:00Z', toStage: 'needs-review' })
		);
		await appendRetryEvent(deps, {
			workItemId: 'item-001',
			attempt: 1,
			reason: 'timed out',
			occurredAt: '2026-04-30T20:00:00Z',
		});

		const finalContent = capturedWrites[capturedWrites.length - 1].content;
		const headerCount = (finalContent.match(/## Stage transitions/g) ?? []).length;
		expect(headerCount).toBe(1);

		const transitionIdx = finalContent.indexOf('moved from agent-ready to needs-review');
		const retryIdx = finalContent.indexOf('RETRY attempt=1');
		expect(transitionIdx).toBeGreaterThan(0);
		expect(retryIdx).toBeGreaterThan(transitionIdx);
	});
});
