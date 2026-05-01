/**
 * FileConversationalPrdStore — archive flag tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileConversationalPrdStore } from '../../../main/conversational-prd/file-store';
import type { FsAdapter } from '../../../main/conversational-prd/file-store';

const PROJECT = '/projects/archive-test';
const GIT_PATH = '/projects/archive-test/.git';

function makeFsStub(): FsAdapter {
	return {
		stat: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
		readFile: vi.fn().mockResolvedValue(''),
		writeFile: vi.fn().mockResolvedValue(undefined),
		mkdir: vi.fn().mockResolvedValue(undefined),
	};
}

describe('FileConversationalPrdStore — archive', () => {
	let store: FileConversationalPrdStore;

	beforeEach(async () => {
		store = new FileConversationalPrdStore('/tmp/test.json', makeFsStub());
		await store.init();
	});

	it('archive() sets archived flag on the session', () => {
		const session = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		const archived = store.archive(session.conversationId);
		const stored = store.get(session.conversationId) as { archived?: boolean };
		expect(stored.archived).toBe(true);
		expect(archived.conversationId).toBe(session.conversationId);
	});

	it('list() excludes archived sessions by default', () => {
		const s1 = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		const s2 = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		store.archive(s1.conversationId);
		const visible = store.list({ projectPath: PROJECT });
		expect(visible.map((s) => s.conversationId)).not.toContain(s1.conversationId);
		expect(visible.map((s) => s.conversationId)).toContain(s2.conversationId);
	});

	it('list({ includeArchived: true }) includes archived sessions', () => {
		const s1 = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		store.archive(s1.conversationId);
		const all = store.list({ projectPath: PROJECT, includeArchived: true });
		expect(all.map((s) => s.conversationId)).toContain(s1.conversationId);
	});

	it('archive() throws for unknown sessionId', () => {
		expect(() => store.archive('no-such-id')).toThrow('not found');
	});

	it('archived sessions are also excluded from list() without projectPath filter', () => {
		const s1 = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		store.archive(s1.conversationId);
		expect(store.list()).not.toContain(
			expect.objectContaining({ conversationId: s1.conversationId })
		);
	});
});
