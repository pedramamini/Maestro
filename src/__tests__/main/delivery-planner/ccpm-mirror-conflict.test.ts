/**
 * CCPM mirror conflict-detection tests for Delivery Planner.
 *
 * These tests verify that `writeCcpmMirror` in
 * `src/main/delivery-planner/ccpm-mirror.ts` detects on-disk conflicts and
 * returns the canonical `PlannerMirrorConflictError` via the result object.
 *
 * Key invariants:
 *   - `markdownMirrorHash` (from frontmatter.ts) is deterministic for identical input.
 *   - A write with no `expectedMirrorHash`/`item.mirrorHash` (first write) always succeeds.
 *   - A write where the on-disk hash matches the Work Graph `mirrorHash` succeeds.
 *   - A write where on-disk content has diverged returns status "conflict" and
 *     exposes a `PlannerMirrorConflictError` with the file path and both hashes.
 *   - `allowOverwrite: true` bypasses conflict detection.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, it, expect } from 'vitest';
import { markdownMirrorHash } from '../../../main/delivery-planner/frontmatter';
import {
	writeCcpmMirror,
	PlannerMirrorConflictError,
} from '../../../main/delivery-planner/ccpm-mirror';
import type { WorkItem } from '../../../shared/work-graph-types';

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTempProject(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-conflict-'));
	tempDirs.push(dir);
	return dir;
}

function makeWorkItem(projectPath: string, overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		id: 'item-1',
		type: 'task',
		status: 'planned',
		title: 'Test Item',
		description: 'Test body.',
		projectPath,
		gitPath: '.',
		source: 'delivery-planner',
		readonly: false,
		tags: [],
		createdAt: '2026-04-30T00:00:00.000Z',
		updatedAt: '2026-04-30T00:00:00.000Z',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// markdownMirrorHash
// ---------------------------------------------------------------------------

describe('markdownMirrorHash', () => {
	it('returns a 64-character hex string (SHA-256)', () => {
		const hash = markdownMirrorHash('hello');
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('is deterministic for identical inputs', () => {
		const content = '---\nname: test\n---\n# body\n';
		expect(markdownMirrorHash(content)).toBe(markdownMirrorHash(content));
	});

	it('produces different hashes for different inputs', () => {
		const a = markdownMirrorHash('content A');
		const b = markdownMirrorHash('content B');
		expect(a).not.toBe(b);
	});

	it('normalises CRLF to LF before hashing (platform-stable)', () => {
		const lf = markdownMirrorHash('line\n');
		const crlf = markdownMirrorHash('line\r\n');
		// After normalisation both have the same content — hashes must match.
		expect(lf).toBe(crlf);
	});
});

// ---------------------------------------------------------------------------
// writeCcpmMirror — no conflict (first write and clean updates)
// ---------------------------------------------------------------------------

describe('writeCcpmMirror — no conflict', () => {
	it('succeeds on first write (no item.mirrorHash)', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, {
			id: 'prd-1',
			title: 'Delivery Planner',
			type: 'feature',
			status: 'planned',
			description: 'Build Delivery Planner.',
		});

		const result = await writeCcpmMirror({
			item,
			kind: 'prd',
			slug: 'delivery-planner',
		});

		expect(result.status).toBe('created');
		expect(result.mirrorHash).toBeDefined();
		expect(typeof result.mirrorHash).toBe('string');
		expect(result.error).toBeUndefined();
	});

	it('returns the hash of the written content', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Work Graph', status: 'planned' });

		const result = await writeCcpmMirror({ item, kind: 'epic', slug: 'work-graph' });

		// Re-reading and hashing the file should match the returned mirrorHash.
		const written = await fs.readFile(result.filePath, 'utf8');
		expect(markdownMirrorHash(written)).toBe(result.mirrorHash);
	});

	it('returns status "unchanged" when on-disk matches and Work Graph stores the mirrorHash', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Work Graph', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'epic', slug: 'work-graph' });

		// Simulate Work Graph storing the mirrorHash from the first write.
		const second = await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'epic',
			slug: 'work-graph',
		});

		expect(second.status).toBe('unchanged');
	});

	it('returns status "updated" when Work Graph hash matches disk and content changes', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, {
			title: 'Delivery Planner',
			status: 'planned',
			description: 'Original description.',
		});

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'delivery-planner' });

		const second = await writeCcpmMirror({
			item: {
				...item,
				status: 'in_progress',
				description: 'Updated description.',
				mirrorHash: first.mirrorHash,
			},
			kind: 'prd',
			slug: 'delivery-planner',
		});

		expect(second.status).toBe('updated');
		expect(second.mirrorHash).not.toBe(first.mirrorHash);
		expect(second.error).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// writeCcpmMirror — conflict detected
// ---------------------------------------------------------------------------

describe('writeCcpmMirror — conflict detected', () => {
	it('returns status "conflict" when disk content has diverged from the Work Graph hash', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Delivery Planner', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'delivery-planner' });

		// Simulate a human editing the file on disk.
		await fs.appendFile(first.filePath, '\n<!-- Human edit -->\n', 'utf8');

		const conflict = await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'prd',
			slug: 'delivery-planner',
		});

		expect(conflict.status).toBe('conflict');
	});

	it('does not overwrite the file on conflict', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Delivery Planner', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'delivery-planner' });
		const humanEdit = '\n<!-- Protected human edit -->\n';
		await fs.appendFile(first.filePath, humanEdit, 'utf8');

		await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'prd',
			slug: 'delivery-planner',
		});

		const onDisk = await fs.readFile(first.filePath, 'utf8');
		expect(onDisk).toContain('Protected human edit');
	});

	it('result.error is a PlannerMirrorConflictError on conflict', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Living Wiki', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'living-wiki' });
		await fs.appendFile(first.filePath, '\n<!-- Edit -->\n', 'utf8');

		const conflict = await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'prd',
			slug: 'living-wiki',
		});

		expect(conflict.error).toBeInstanceOf(PlannerMirrorConflictError);
	});

	it('conflict error carries the file path', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Work Graph', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'work-graph' });
		await fs.appendFile(first.filePath, '\n<!-- Edit -->\n', 'utf8');

		const conflict = await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'prd',
			slug: 'work-graph',
		});

		expect(conflict.error?.filePath).toBe(first.filePath);
	});

	it('conflict error carries expectedMirrorHash and actualMirrorHash', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Work Graph', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'work-graph' });
		await fs.appendFile(first.filePath, '\n<!-- Edit -->\n', 'utf8');

		const conflict = await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'prd',
			slug: 'work-graph',
		});

		const err = conflict.error as PlannerMirrorConflictError;
		expect(err.expectedMirrorHash).toBe(first.mirrorHash);

		const onDisk = await fs.readFile(first.filePath, 'utf8');
		expect(err.actualMirrorHash).toBe(markdownMirrorHash(onDisk));
	});

	it('error message includes the file path', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Delivery Planner', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'delivery-planner' });
		await fs.appendFile(first.filePath, '\n<!-- Edit -->\n', 'utf8');

		const conflict = await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'prd',
			slug: 'delivery-planner',
		});

		expect(conflict.error?.message).toContain(first.filePath);
	});

	it('conflict error is recoverable', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Delivery Planner', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'delivery-planner' });
		await fs.appendFile(first.filePath, '\n<!-- Edit -->\n', 'utf8');

		const conflict = await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'prd',
			slug: 'delivery-planner',
		});

		expect(conflict.error?.recoverable).toBe(true);
	});

	it('allowOverwrite: true bypasses conflict detection and updates the file', async () => {
		const projectPath = await makeTempProject();
		const item = makeWorkItem(projectPath, { title: 'Delivery Planner', status: 'planned' });

		const first = await writeCcpmMirror({ item, kind: 'prd', slug: 'delivery-planner' });
		await fs.appendFile(first.filePath, '\n<!-- Edit -->\n', 'utf8');

		const forced = await writeCcpmMirror({
			item: { ...item, mirrorHash: first.mirrorHash },
			kind: 'prd',
			slug: 'delivery-planner',
			allowOverwrite: true,
		});

		expect(forced.status).toBe('updated');
		expect(forced.error).toBeUndefined();
	});
});
