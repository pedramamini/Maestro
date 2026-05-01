/**
 * Agent Dispatch Integration Test
 *
 * Exercises the full happy-path of the Symphony agent-dispatch lifecycle:
 *
 *   1. Enroll fleet  — register an agent session for a contribution task
 *   2. Claim         — push a branch and create a draft PR (atomic issue claim)
 *   3. Status renew  — update progress and token-usage while Auto Run executes
 *   4. Release       — finalize the contribution (convert draft PR to ready)
 *
 * Only external services (git CLI, GitHub CLI, fetch) are mocked.
 * State persistence uses an in-memory store pattern via mocked fs operations,
 * which mirrors the MemoryDispatchWorkGraphStore idiom used in similar tests.
 *
 * NOTE: This test targets the `src/main/services/symphony-runner.ts` +
 * `src/main/ipc/handlers/symphony.ts` layer together.  Web/mobile component
 * tests (WebSocket messages, reconnect resync) are deferred — see PR body.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external I/O — real state is held in the in-memory object below
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
	default: {
		mkdir: vi.fn().mockResolvedValue(undefined),
		rm: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		copyFile: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn(),
		access: vi.fn(),
	},
}));

vi.mock('../../../main/utils/execFile', () => ({
	execFileNoThrow: vi.fn(),
}));

vi.mock('../../../main/utils/symphony-fork', () => ({
	ensureForkSetup: vi.fn(),
}));

vi.mock('../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Prevent resolveGhPath from calling isGhInstalled() which invokes
// execFileNoThrow('which', ['gh'], ...) and consumes a mock call slot
// from the carefully ordered sequences in mockStartSuccess / mockFinalizeSuccess.
vi.mock('../../../main/utils/cliDetection', () => ({
	resolveGhPath: vi.fn().mockResolvedValue('gh'),
	isGhInstalled: vi.fn().mockResolvedValue(true),
}));

global.fetch = vi.fn() as typeof global.fetch;

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import fs from 'fs/promises';
import { execFileNoThrow } from '../../../main/utils/execFile';
import { ensureForkSetup } from '../../../main/utils/symphony-fork';
import {
	startContribution,
	finalizeContribution,
	cancelContribution,
} from '../../../main/services/symphony-runner';
import type { SymphonyRunnerOptions } from '../../../main/services/symphony-runner';

// ---------------------------------------------------------------------------
// In-memory dispatch store (mirrors MemoryDispatchWorkGraphStore pattern)
// ---------------------------------------------------------------------------

interface DispatchEntry {
	contributionId: string;
	repoSlug: string;
	issueNumber: number;
	sessionId: string;
	status: 'enrolled' | 'claimed' | 'running' | 'completed' | 'cancelled';
	draftPrNumber?: number;
	draftPrUrl?: string;
	progress: { completedDocuments: number; totalDocuments: number };
	renewCount: number;
}

class MemoryDispatchWorkGraphStore {
	private entries = new Map<string, DispatchEntry>();

	enroll(params: Omit<DispatchEntry, 'status' | 'renewCount'>): void {
		this.entries.set(params.contributionId, {
			...params,
			status: 'enrolled',
			renewCount: 0,
		});
	}

	claim(contributionId: string, prNumber: number, prUrl: string): boolean {
		const entry = this.entries.get(contributionId);
		if (!entry || entry.status !== 'enrolled') return false;
		entry.status = 'claimed';
		entry.draftPrNumber = prNumber;
		entry.draftPrUrl = prUrl;
		return true;
	}

	/** Renew heartbeat / update progress — analogous to heartbeat tick. */
	renew(
		contributionId: string,
		progress: { completedDocuments: number; totalDocuments: number }
	): boolean {
		const entry = this.entries.get(contributionId);
		if (!entry || (entry.status !== 'claimed' && entry.status !== 'running')) return false;
		entry.status = 'running';
		entry.progress = progress;
		entry.renewCount += 1;
		return true;
	}

	release(contributionId: string, outcome: 'completed' | 'cancelled'): boolean {
		const entry = this.entries.get(contributionId);
		if (!entry) return false;
		entry.status = outcome;
		return true;
	}

	get(contributionId: string): DispatchEntry | undefined {
		return this.entries.get(contributionId);
	}

	size(): number {
		return this.entries.size;
	}
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const CONTRIBUTION_ID = 'contrib_test_abc123';
const REPO_SLUG = 'owner/test-repo';
const REPO_URL = 'https://github.com/owner/test-repo';
const ISSUE_NUMBER = 42;
const ISSUE_TITLE = 'Add Agent Dispatch tests';
const LOCAL_PATH = '/tmp/agent-dispatch-test/owner-test-repo';
const BRANCH_NAME = 'symphony/issue-42-abc123';
const DRAFT_PR_URL = 'https://github.com/owner/test-repo/pull/7';
const DRAFT_PR_NUMBER = 7;
const SESSION_ID = 'session-abc123';

/** Mock sequence for a successful startContribution run (no fork). */
function mockStartSuccess(prUrl = DRAFT_PR_URL): void {
	vi.mocked(execFileNoThrow)
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git clone
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout -b
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git config user.name
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git config user.email
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git commit --allow-empty
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git push -u origin
		.mockResolvedValueOnce({ stdout: prUrl, stderr: '', exitCode: 0 }); // gh pr create --draft
}

/** Mock sequence for a successful finalizeContribution run. */
function mockFinalizeSuccess(prUrl = DRAFT_PR_URL): void {
	vi.mocked(execFileNoThrow)
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git config user.name
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git config user.email
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git add -A
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git commit
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git push
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // gh pr ready
		.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // gh pr edit
		.mockResolvedValueOnce({ stdout: prUrl, stderr: '', exitCode: 0 }); // gh pr view
}

const BASE_OPTIONS: SymphonyRunnerOptions = {
	contributionId: CONTRIBUTION_ID,
	repoSlug: REPO_SLUG,
	repoUrl: REPO_URL,
	issueNumber: ISSUE_NUMBER,
	issueTitle: ISSUE_TITLE,
	documentPaths: [],
	localPath: LOCAL_PATH,
	branchName: BRANCH_NAME,
};

// ---------------------------------------------------------------------------
// Integration suite
// ---------------------------------------------------------------------------

describe('Agent Dispatch — full happy-path lifecycle', () => {
	let store: MemoryDispatchWorkGraphStore;

	beforeEach(() => {
		vi.clearAllMocks();
		store = new MemoryDispatchWorkGraphStore();
		vi.mocked(ensureForkSetup).mockResolvedValue({ isFork: false });
		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.rm).mockResolvedValue(undefined);
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);
		vi.mocked(fs.copyFile).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('completes the enroll → claim → renew → release lifecycle', async () => {
		// ── 1. ENROLL ────────────────────────────────────────────────────────
		// Register the agent session in the dispatch store before any git work.
		store.enroll({
			contributionId: CONTRIBUTION_ID,
			repoSlug: REPO_SLUG,
			issueNumber: ISSUE_NUMBER,
			sessionId: SESSION_ID,
			progress: { completedDocuments: 0, totalDocuments: 3 },
		});

		expect(store.get(CONTRIBUTION_ID)?.status).toBe('enrolled');
		expect(store.size()).toBe(1);

		// ── 2. CLAIM ─────────────────────────────────────────────────────────
		// Start the contribution: clone → branch → empty commit → push → draft PR.
		// The draft PR creation is the atomic claim operation.
		mockStartSuccess(DRAFT_PR_URL);
		const startResult = await startContribution(BASE_OPTIONS);

		expect(startResult.success).toBe(true);
		expect(startResult.draftPrUrl).toBe(DRAFT_PR_URL);
		expect(startResult.draftPrNumber).toBe(DRAFT_PR_NUMBER);

		// Record the claim in the store.
		const claimed = store.claim(
			CONTRIBUTION_ID,
			startResult.draftPrNumber!,
			startResult.draftPrUrl!
		);
		expect(claimed).toBe(true);
		expect(store.get(CONTRIBUTION_ID)?.status).toBe('claimed');
		expect(store.get(CONTRIBUTION_ID)?.draftPrNumber).toBe(DRAFT_PR_NUMBER);

		// ── 3. STATUS RENEW (heartbeat equivalent) ────────────────────────────
		// Simulate Auto Run progressing through documents.
		const renewed1 = store.renew(CONTRIBUTION_ID, { completedDocuments: 1, totalDocuments: 3 });
		expect(renewed1).toBe(true);
		expect(store.get(CONTRIBUTION_ID)?.status).toBe('running');
		expect(store.get(CONTRIBUTION_ID)?.renewCount).toBe(1);

		const renewed2 = store.renew(CONTRIBUTION_ID, { completedDocuments: 2, totalDocuments: 3 });
		expect(renewed2).toBe(true);
		expect(store.get(CONTRIBUTION_ID)?.renewCount).toBe(2);

		const renewed3 = store.renew(CONTRIBUTION_ID, { completedDocuments: 3, totalDocuments: 3 });
		expect(renewed3).toBe(true);
		expect(store.get(CONTRIBUTION_ID)?.progress.completedDocuments).toBe(3);

		// ── 4. RELEASE ────────────────────────────────────────────────────────
		// Finalize: push final changes, convert draft PR to ready for review.
		mockFinalizeSuccess(DRAFT_PR_URL);
		const finalizeResult = await finalizeContribution(
			LOCAL_PATH,
			DRAFT_PR_NUMBER,
			ISSUE_NUMBER,
			ISSUE_TITLE
		);

		expect(finalizeResult.success).toBe(true);
		expect(finalizeResult.prUrl).toBe(DRAFT_PR_URL);

		// Mark as released in the store.
		const released = store.release(CONTRIBUTION_ID, 'completed');
		expect(released).toBe(true);
		expect(store.get(CONTRIBUTION_ID)?.status).toBe('completed');
	});

	it('enroll → claim → cancel releases the claim and cleans up', async () => {
		// Enroll
		store.enroll({
			contributionId: CONTRIBUTION_ID,
			repoSlug: REPO_SLUG,
			issueNumber: ISSUE_NUMBER,
			sessionId: SESSION_ID,
			progress: { completedDocuments: 0, totalDocuments: 1 },
		});

		// Claim
		mockStartSuccess();
		const startResult = await startContribution(BASE_OPTIONS);
		expect(startResult.success).toBe(true);
		store.claim(CONTRIBUTION_ID, startResult.draftPrNumber!, startResult.draftPrUrl!);
		expect(store.get(CONTRIBUTION_ID)?.status).toBe('claimed');

		// Cancel — closes the draft PR and cleans up the local repo
		vi.mocked(execFileNoThrow).mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // gh pr close
		const cancelResult = await cancelContribution(LOCAL_PATH, DRAFT_PR_NUMBER, true);
		expect(cancelResult.success).toBe(true);
		expect(fs.rm).toHaveBeenCalledWith(LOCAL_PATH, { recursive: true, force: true });

		// Release in store
		store.release(CONTRIBUTION_ID, 'cancelled');
		expect(store.get(CONTRIBUTION_ID)?.status).toBe('cancelled');
	});

	it('renew is rejected for a contribution that was never claimed', () => {
		store.enroll({
			contributionId: CONTRIBUTION_ID,
			repoSlug: REPO_SLUG,
			issueNumber: ISSUE_NUMBER,
			sessionId: SESSION_ID,
			progress: { completedDocuments: 0, totalDocuments: 2 },
		});

		// No claim step — renew should be refused
		const renewed = store.renew(CONTRIBUTION_ID, { completedDocuments: 1, totalDocuments: 2 });
		expect(renewed).toBe(false);
		// Status unchanged — still enrolled
		expect(store.get(CONTRIBUTION_ID)?.status).toBe('enrolled');
	});

	it('renew is rejected for an unknown contribution ID (stale broadcast guard)', () => {
		const renewed = store.renew('unknown-id-xyz', { completedDocuments: 1, totalDocuments: 1 });
		expect(renewed).toBe(false);
	});

	it('release is idempotent — returns false for unknown IDs', () => {
		const released = store.release('ghost-id', 'completed');
		expect(released).toBe(false);
	});

	it('start failure (clone error) prevents claim and triggers cleanup', async () => {
		store.enroll({
			contributionId: CONTRIBUTION_ID,
			repoSlug: REPO_SLUG,
			issueNumber: ISSUE_NUMBER,
			sessionId: SESSION_ID,
			progress: { completedDocuments: 0, totalDocuments: 1 },
		});

		// Simulate clone failure
		vi.mocked(execFileNoThrow).mockResolvedValueOnce({
			stdout: '',
			stderr: 'fatal: repository not found',
			exitCode: 128,
		});

		const startResult = await startContribution(BASE_OPTIONS);
		expect(startResult.success).toBe(false);
		expect(startResult.error).toBe('Clone failed');

		// Claim must NOT be called on the store
		expect(store.get(CONTRIBUTION_ID)?.status).toBe('enrolled');
		// No cleanup because clone produced nothing
		expect(fs.rm).not.toHaveBeenCalled();
	});

	it('fork-based contribution: claim uses cross-fork PR args', async () => {
		vi.mocked(ensureForkSetup).mockResolvedValue({
			isFork: true,
			forkSlug: 'myuser/test-repo',
		});

		store.enroll({
			contributionId: CONTRIBUTION_ID,
			repoSlug: REPO_SLUG,
			issueNumber: ISSUE_NUMBER,
			sessionId: SESSION_ID,
			progress: { completedDocuments: 0, totalDocuments: 1 },
		});

		// Fork workflow adds an extra git rev-parse call before gh pr create
		vi.mocked(execFileNoThrow)
			.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git clone
			.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout -b
			.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git config user.name
			.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git config user.email
			.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git commit --allow-empty
			.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git push -u origin
			.mockResolvedValueOnce({ stdout: BRANCH_NAME, stderr: '', exitCode: 0 }) // git rev-parse HEAD
			.mockResolvedValueOnce({ stdout: DRAFT_PR_URL, stderr: '', exitCode: 0 }); // gh pr create

		const startResult = await startContribution(BASE_OPTIONS);
		expect(startResult.success).toBe(true);
		expect(startResult.isFork).toBe(true);
		expect(startResult.forkSlug).toBe('myuser/test-repo');

		// Verify cross-fork PR args (--repo upstream + --head fork:branch)
		const prCreateCall = vi
			.mocked(execFileNoThrow)
			.mock.calls.find((call) => call[0] === 'gh' && call[1]?.includes('create'));
		expect(prCreateCall).toBeDefined();
		expect(prCreateCall![1]).toContain('--repo');
		expect(prCreateCall![1]).toContain(REPO_SLUG);
		expect(prCreateCall![1]).toContain('--head');
		expect(prCreateCall![1]).toContain('myuser:' + BRANCH_NAME);

		store.claim(CONTRIBUTION_ID, startResult.draftPrNumber!, startResult.draftPrUrl!);
		expect(store.get(CONTRIBUTION_ID)?.status).toBe('claimed');
	});
});
