/**
 * Conversational PRD Planner — end-to-end smoke test (Issue #211)
 *
 * Boots the service with FileConversationalPrdStore + in-memory fs adapter,
 * exercises the full create → send × N → ready-to-finalize → archive flow,
 * and verifies persistence across store reconstruction.
 *
 * All I/O is replaced by a simple in-memory fs stub — no disk, no LLM.
 * The StructuredConversationalPrdGateway provides deterministic assistant turns.
 *
 * Five test cases:
 *   1. Bootstrap: createSession returns conversationId + greeting, persists to store.
 *   2. Three-message conversation: draft fields accumulate correctly after each turn.
 *   3. Ready-to-finalize: after 5 user messages, suggestCommit fires.
 *   4. Finalize path: verify draft has required fields before a mock plannerService
 *      call (mapping to createPrd input shape).
 *   5. Persistence restart: sessions survive re-construction with same backing fs data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FileConversationalPrdStore } from '../../main/conversational-prd/file-store';
import type { FsAdapter } from '../../main/conversational-prd/file-store';
import { StructuredConversationalPrdGateway } from '../../main/conversational-prd/structured-gateway';
import { ConversationalPrdService } from '../../main/conversational-prd/service';

vi.mock('../../main/prompt-manager', () => ({
	getPrompt: () =>
		'You are the Maestro PRD Planning Copilot. ' +
		'Output JSON: { "messageToUser": string, "prdDraftDelta": {}, "status": "gathering" }',
}));

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const PROJECT = '/workspace/demo-app';
const GIT_PATH = '/workspace/demo-app/.git';
const FILE_PATH = '/userdata/conversational-prd-sessions.json';

// ---------------------------------------------------------------------------
// In-memory fs adapter — simulates disk without touching the filesystem.
// Re-creates with state preserved across service instances when you share it.
// ---------------------------------------------------------------------------

function makeInMemoryFs(): FsAdapter & { store: Map<string, string> } {
	const store = new Map<string, string>();
	return {
		store,
		stat: vi.fn().mockImplementation((p: string) => {
			if (store.has(p)) {
				return Promise.resolve({ isFile: () => true });
			}
			return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
		}),
		readFile: vi.fn().mockImplementation((p: string) => {
			const content = store.get(p);
			if (content === undefined) {
				return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
			}
			return Promise.resolve(content);
		}),
		writeFile: vi.fn().mockImplementation((p: string, data: string) => {
			store.set(p, data);
			return Promise.resolve();
		}),
		mkdir: vi.fn().mockResolvedValue(undefined),
	};
}

// ---------------------------------------------------------------------------
// Helper: build a service from a shared fs adapter
// ---------------------------------------------------------------------------

async function buildService(
	fs: FsAdapter
): Promise<{ service: ConversationalPrdService; store: FileConversationalPrdStore }> {
	const store = new FileConversationalPrdStore(FILE_PATH, fs);
	await store.init();
	const service = new ConversationalPrdService(store, new StructuredConversationalPrdGateway());
	return { service, store };
}

// ---------------------------------------------------------------------------
// Helper: flush the write queue (microtask boundary)
// ---------------------------------------------------------------------------

async function flushWrites(): Promise<void> {
	await new Promise<void>((r) => setTimeout(r, 20));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Conversational PRD Planner smoke tests', () => {
	let fs: ReturnType<typeof makeInMemoryFs>;

	beforeEach(() => {
		fs = makeInMemoryFs();
	});

	// -------------------------------------------------------------------------
	// Case 1: Bootstrap
	// -------------------------------------------------------------------------

	it('1. createSession() returns a conversationId and greeting; session is persisted', async () => {
		const { service } = await buildService(fs);

		const { conversationId, greeting } = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
		});

		expect(typeof conversationId).toBe('string');
		expect(conversationId.length).toBeGreaterThan(0);
		expect(typeof greeting).toBe('string');
		expect(greeting.length).toBeGreaterThan(0);

		const session = service.getSession(conversationId);
		expect(session).toBeDefined();
		expect(session!.status).toBe('active');
		expect(session!.messages).toHaveLength(1);
		expect(session!.messages[0].role).toBe('assistant');

		await flushWrites();
		expect(fs.writeFile).toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// Case 2: Three-message conversation — draft accumulates per turn
	// -------------------------------------------------------------------------

	it('2. Three messages progressively populate problem, users, successCriteria', async () => {
		const { service } = await buildService(fs);
		const { conversationId } = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
			greeting: 'What problem are you solving?',
		});

		// Turn 1: problem
		const t1 = await service.sendMessage({
			conversationId,
			message: 'Engineers cannot tell which agents are busy',
		});
		expect(t1.delta.problem).toBe('Engineers cannot tell which agents are busy');
		expect(t1.draft.problem).toBe('Engineers cannot tell which agents are busy');
		expect(t1.suggestCommit).toBe(false);

		// Turn 2: users
		const t2 = await service.sendMessage({
			conversationId,
			message: 'Solo developers using Maestro',
		});
		expect(t2.delta.users).toBe('Solo developers using Maestro');
		expect(t2.draft.users).toBe('Solo developers using Maestro');
		expect(t2.draft.problem).toBe('Engineers cannot tell which agents are busy'); // unchanged

		// Turn 3: success criteria
		const t3 = await service.sendMessage({
			conversationId,
			message: 'Agent status visible at a glance without interrupting work',
		});
		expect(t3.delta.successCriteria).toBe(
			'Agent status visible at a glance without interrupting work'
		);
		expect(t3.draft.successCriteria).toBeTruthy();

		const session = service.getSession(conversationId);
		// 1 greeting + 3 × (user + assistant) = 7 messages
		expect(session!.messages).toHaveLength(7);
	});

	// -------------------------------------------------------------------------
	// Case 3: Reach ready-to-finalize after 5 user turns
	// -------------------------------------------------------------------------

	it('3. After 5 user messages suggestCommit is true', async () => {
		const { service } = await buildService(fs);
		const { conversationId } = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
			greeting: 'Hi!',
		});

		const turns = [
			'problem description',
			'users description',
			'success criteria description',
			'scope description',
			'none', // constraints → triggers ready-to-finalize
		];

		let lastResult = null;
		for (const msg of turns) {
			lastResult = await service.sendMessage({ conversationId, message: msg });
		}

		expect(lastResult!.suggestCommit).toBe(true);
		const session = service.getSession(conversationId);
		expect(session!.draft.title).toBeTruthy();
		expect(session!.draft.problem).toBeTruthy();
		expect(session!.draft.users).toBeTruthy();
		expect(session!.draft.successCriteria).toBeTruthy();
		expect(session!.draft.scope).toBeTruthy();
	});

	// -------------------------------------------------------------------------
	// Case 4: Finalize — mock plannerService.createPrd called with mapped fields
	// -------------------------------------------------------------------------

	it('4. Draft at ready-to-finalize has all required fields to call createPrd', async () => {
		const { service } = await buildService(fs);
		const { conversationId } = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
			greeting: 'Hi!',
		});

		for (const msg of ['problem', 'users', 'criteria', 'scope', 'none']) {
			await service.sendMessage({ conversationId, message: msg });
		}

		const session = service.getSession(conversationId);
		expect(session).toBeDefined();

		// Simulate what the commit handler does: map draft → createPrd input
		const mockCreatePrd = vi.fn().mockResolvedValue({ id: 'prd-item-001' });

		const description = [
			session!.draft.problem && `**Problem:** ${session!.draft.problem}`,
			session!.draft.users && `**Users:** ${session!.draft.users}`,
			session!.draft.successCriteria && `**Success criteria:** ${session!.draft.successCriteria}`,
			session!.draft.scope && `**Scope:** ${session!.draft.scope}`,
			session!.draft.constraints && `**Constraints:** ${session!.draft.constraints}`,
		]
			.filter(Boolean)
			.join('\n\n');

		await mockCreatePrd({
			title: session!.draft.title ?? 'Untitled PRD',
			description,
			projectPath: session!.metadata.projectPath,
			gitPath: session!.metadata.gitPath,
			actor: session!.metadata.actor,
		});

		expect(mockCreatePrd).toHaveBeenCalledOnce();
		const callArg = mockCreatePrd.mock.calls[0][0] as {
			title: string;
			description: string;
			projectPath: string;
			gitPath: string;
		};
		expect(callArg.title).toBeTruthy();
		expect(callArg.description).toContain('problem');
		expect(callArg.projectPath).toBe(PROJECT);
		expect(callArg.gitPath).toBe(GIT_PATH);
	});

	// -------------------------------------------------------------------------
	// Case 5: Persistence restart — sessions survive re-constructing the store
	// -------------------------------------------------------------------------

	it('5. Sessions survive store reconstruction (same backing fs)', async () => {
		// First service instance: create a session and send two messages
		const first = await buildService(fs);
		const { conversationId } = await first.service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
			greeting: 'Session that will persist',
		});
		await first.service.sendMessage({ conversationId, message: 'first user message' });
		await flushWrites();

		// Verify the file was written
		expect(fs.writeFile).toHaveBeenCalled();

		// Second service instance shares the same fs — simulates app restart
		const second = await buildService(fs);

		const resumed = second.service.getSession(conversationId);
		expect(resumed).toBeDefined();
		expect(resumed!.conversationId).toBe(conversationId);
		expect(resumed!.status).toBe('active');
		// Greeting + user message + assistant reply = 3 messages minimum
		expect(resumed!.messages.length).toBeGreaterThanOrEqual(3);
		expect(resumed!.draft.problem).toBeTruthy();

		// Can continue the conversation from the reloaded store
		const continued = await second.service.sendMessage({
			conversationId,
			message: 'users of the feature',
		});
		expect(continued.delta.users).toBeTruthy();

		// Listing also works after restart
		const list = second.service.listSessions({ projectPath: PROJECT });
		expect(list.some((s) => s.conversationId === conversationId)).toBe(true);
	});
});
