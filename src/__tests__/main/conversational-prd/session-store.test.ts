/**
 * InMemoryConversationalPrdStore — CRUD tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryConversationalPrdStore } from '../../../main/conversational-prd/session-store';

const PROJECT = '/projects/my-app';
const GIT_PATH = '/projects/my-app/.git';

describe('InMemoryConversationalPrdStore', () => {
	let store: InMemoryConversationalPrdStore;

	beforeEach(() => {
		store = new InMemoryConversationalPrdStore();
	});

	it('create() returns a new session with status active and empty messages/draft', () => {
		const session = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });

		expect(session.status).toBe('active');
		expect(session.messages).toHaveLength(0);
		expect(session.draft).toEqual({});
		expect(session.metadata.projectPath).toBe(PROJECT);
		expect(typeof session.conversationId).toBe('string');
		expect(session.conversationId.length).toBeGreaterThan(0);
	});

	it('get() retrieves the created session by ID', () => {
		const session = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		const retrieved = store.get(session.conversationId);

		expect(retrieved).toBeDefined();
		expect(retrieved?.conversationId).toBe(session.conversationId);
	});

	it('get() returns undefined for an unknown ID', () => {
		expect(store.get('no-such-id')).toBeUndefined();
	});

	it('appendMessage() adds messages in order', () => {
		const session = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });

		store.appendMessage(session.conversationId, { role: 'user', content: 'hello' });
		const updated = store.appendMessage(session.conversationId, {
			role: 'assistant',
			content: 'world',
		});

		expect(updated.messages).toHaveLength(2);
		expect(updated.messages[0].role).toBe('user');
		expect(updated.messages[1].role).toBe('assistant');
		expect(updated.messages[0].content).toBe('hello');
	});

	it('mergeDraft() merges only provided fields without overwriting others', () => {
		const session = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		store.mergeDraft(session.conversationId, { problem: 'Initial problem' });
		const updated = store.mergeDraft(session.conversationId, { users: 'Developers' });

		expect(updated.draft.problem).toBe('Initial problem');
		expect(updated.draft.users).toBe('Developers');
	});

	it('list() filters by projectPath when specified', () => {
		const otherProject = '/projects/other';
		store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		store.create({ projectPath: otherProject, gitPath: otherProject });

		const filtered = store.list({ projectPath: PROJECT });
		expect(filtered).toHaveLength(2);
		expect(filtered.every((s) => s.metadata.projectPath === PROJECT)).toBe(true);
	});

	it('delete() removes the session and returns true; returns false for unknown ID', () => {
		const session = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });

		expect(store.delete(session.conversationId)).toBe(true);
		expect(store.get(session.conversationId)).toBeUndefined();
		expect(store.delete(session.conversationId)).toBe(false);
	});
});
