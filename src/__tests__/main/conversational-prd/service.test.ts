/**
 * ConversationalPrdService — service flow tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { InMemoryConversationalPrdStore } from '../../../main/conversational-prd/session-store';
import { StructuredConversationalPrdGateway } from '../../../main/conversational-prd/structured-gateway';
import { ConversationalPrdService } from '../../../main/conversational-prd/service';

vi.mock('../../../main/prompt-manager', () => ({
	getPrompt: () =>
		'You are the Maestro PRD Planning Copilot. ' +
		'Output JSON: { "messageToUser": string, "prdDraftDelta": {}, "status": "gathering" }',
}));

const PROJECT = '/projects/test-app';
const GIT_PATH = '/projects/test-app/.git';

describe('ConversationalPrdService', () => {
	let store: InMemoryConversationalPrdStore;
	let service: ConversationalPrdService;

	beforeEach(() => {
		store = new InMemoryConversationalPrdStore();
		service = new ConversationalPrdService(store, new StructuredConversationalPrdGateway());
	});

	it('createSession() returns a conversationId and greeting', async () => {
		const result = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
		});

		expect(typeof result.conversationId).toBe('string');
		expect(result.conversationId.length).toBeGreaterThan(0);
		expect(typeof result.greeting).toBe('string');
		expect(result.greeting.length).toBeGreaterThan(0);
	});

	it('createSession() with explicit greeting uses that greeting verbatim', async () => {
		const greeting = 'Welcome! What problem are you solving today?';
		const result = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
			greeting,
		});

		expect(result.greeting).toBe(greeting);
	});

	it('createSession() persists an assistant greeting message in the session', async () => {
		const result = await service.createSession({ projectPath: PROJECT, gitPath: GIT_PATH });

		const session = service.getSession(result.conversationId);
		expect(session).toBeDefined();
		expect(session!.messages).toHaveLength(1);
		expect(session!.messages[0].role).toBe('assistant');
		expect(session!.messages[0].content).toBe(result.greeting);
	});

	it('sendMessage() appends user and assistant messages and merges the delta', async () => {
		const { conversationId } = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
		});

		const userMessage = 'Engineers cannot tell which agents are busy';
		const result = await service.sendMessage({ conversationId, message: userMessage });

		expect(result.conversationId).toBe(conversationId);
		expect(typeof result.assistantMessage).toBe('string');
		expect(result.assistantMessage.length).toBeGreaterThan(0);
		expect(result.delta.problem).toBe(userMessage);
		expect(result.draft.problem).toBe(userMessage);

		const session = service.getSession(conversationId);
		expect(session!.draft.problem).toBe(userMessage);
		expect(session!.messages).toHaveLength(3);
	});

	it('sendMessage() sets suggestCommit when gateway returns ready-to-finalize', async () => {
		const { conversationId } = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
			greeting: 'Hi!',
		});

		const turns = ['problem text', 'users text', 'success criteria text', 'scope text'];
		for (const msg of turns) {
			await service.sendMessage({ conversationId, message: msg });
		}

		const finalResult = await service.sendMessage({ conversationId, message: 'none' });
		expect(finalResult.suggestCommit).toBe(true);
	});

	it('sendMessage() throws for an unknown conversationId', async () => {
		await expect(
			service.sendMessage({ conversationId: 'no-such-id', message: 'hello' })
		).rejects.toThrow('not found');
	});

	it('getSession() returns undefined for an unknown ID', () => {
		expect(service.getSession('unknown')).toBeUndefined();
	});

	it('getSession() returns the session after createSession', async () => {
		const { conversationId } = await service.createSession({
			projectPath: PROJECT,
			gitPath: GIT_PATH,
		});

		const session = service.getSession(conversationId);
		expect(session).toBeDefined();
		expect(session!.conversationId).toBe(conversationId);
	});

	it('listSessions() filters by projectPath', async () => {
		const other = '/projects/other';
		await service.createSession({ projectPath: PROJECT, gitPath: GIT_PATH });
		await service.createSession({ projectPath: PROJECT, gitPath: GIT_PATH });
		await service.createSession({ projectPath: other, gitPath: other });

		const projectSessions = service.listSessions({ projectPath: PROJECT });
		expect(projectSessions).toHaveLength(2);
		expect(projectSessions.every((s) => s.metadata.projectPath === PROJECT)).toBe(true);

		const otherSessions = service.listSessions({ projectPath: other });
		expect(otherSessions).toHaveLength(1);
	});

	it('listSessions() with no filter returns all sessions', async () => {
		await service.createSession({ projectPath: PROJECT, gitPath: GIT_PATH });
		await service.createSession({ projectPath: '/other', gitPath: '/other' });

		const all = service.listSessions();
		expect(all).toHaveLength(2);
	});
});
