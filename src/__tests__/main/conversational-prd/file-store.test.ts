/**
 * FileConversationalPrdStore — persistence + queue tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileConversationalPrdStore } from '../../../main/conversational-prd/file-store';
import type { FsAdapter } from '../../../main/conversational-prd/file-store';

const PROJECT = '/projects/my-app';
const GIT_PATH = '/projects/my-app/.git';
const FILE_PATH = '/data/conv-prd-sessions.json';

// ---------------------------------------------------------------------------
// Stub fs factory
// ---------------------------------------------------------------------------

function makeFsStub(opts: {
	fileExists?: boolean;
	readContent?: string;
} = {}): FsAdapter & {
	writes: string[];
	mkdirCalls: string[];
} {
	const writes: string[] = [];
	const mkdirCalls: string[] = [];

	return {
		writes,
		mkdirCalls,
		stat: vi.fn().mockImplementation(() => {
			if (opts.fileExists === false) {
				return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
			}
			return Promise.resolve({ isFile: () => true });
		}),
		readFile: vi.fn().mockResolvedValue(opts.readContent ?? ''),
		writeFile: vi.fn().mockImplementation((_p: string, data: string) => {
			writes.push(data);
			return Promise.resolve();
		}),
		mkdir: vi.fn().mockImplementation((p: string) => {
			mkdirCalls.push(p);
			return Promise.resolve(undefined);
		}),
	};
}

// ---------------------------------------------------------------------------
// Tests: init
// ---------------------------------------------------------------------------

describe('FileConversationalPrdStore — init()', () => {
	it('starts empty when file does not exist', async () => {
		const fs = makeFsStub({ fileExists: false });
		const store = new FileConversationalPrdStore(FILE_PATH, fs);
		await store.init();

		expect(store.list()).toHaveLength(0);
	});

	it('loads sessions from a valid file', async () => {
		const session = {
			conversationId: 'abc-123',
			status: 'active',
			messages: [],
			draft: { title: 'My PRD' },
			archived: false,
			metadata: {
				projectPath: PROJECT,
				gitPath: GIT_PATH,
				startedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		};
		const content = JSON.stringify({ version: 1, sessions: [session] });
		const fs = makeFsStub({ fileExists: true, readContent: content });
		const store = new FileConversationalPrdStore(FILE_PATH, fs);
		await store.init();

		expect(store.list()).toHaveLength(1);
		expect(store.get('abc-123')?.draft.title).toBe('My PRD');
	});

	it('starts empty and warns on malformed JSON', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fs = makeFsStub({ fileExists: true, readContent: '{ broken json' });
		const store = new FileConversationalPrdStore(FILE_PATH, fs);
		await store.init();

		expect(store.list()).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('Malformed sessions file'),
			expect.anything()
		);
		warnSpy.mockRestore();
	});

	it('starts empty and warns on wrong schema version', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const content = JSON.stringify({ version: 99, sessions: [] });
		const fs = makeFsStub({ fileExists: true, readContent: content });
		const store = new FileConversationalPrdStore(FILE_PATH, fs);
		await store.init();

		expect(store.list()).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected sessions file schema'));
		warnSpy.mockRestore();
	});

	it('starts empty and warns when sessions is not an array', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const content = JSON.stringify({ version: 1, sessions: 'oops' });
		const fs = makeFsStub({ fileExists: true, readContent: content });
		const store = new FileConversationalPrdStore(FILE_PATH, fs);
		await store.init();

		expect(store.list()).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// Tests: mutations trigger writes
// ---------------------------------------------------------------------------

describe('FileConversationalPrdStore — mutations', () => {
	let store: FileConversationalPrdStore;
	let fs: ReturnType<typeof makeFsStub>;

	beforeEach(async () => {
		fs = makeFsStub({ fileExists: false });
		store = new FileConversationalPrdStore(FILE_PATH, fs);
		await store.init();
	});

	it('create() persists the new session', async () => {
		store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		// allow micro-task write queue to flush
		await new Promise<void>((r) => setTimeout(r, 10));
		expect(fs.writes.length).toBeGreaterThan(0);
		const written = JSON.parse(fs.writes[fs.writes.length - 1]);
		expect(written.sessions).toHaveLength(1);
	});

	it('appendMessage() increments message count in persisted data', async () => {
		const session = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		store.appendMessage(session.conversationId, { role: 'user', content: 'hello' });
		await new Promise<void>((r) => setTimeout(r, 10));
		const written = JSON.parse(fs.writes[fs.writes.length - 1]);
		expect(written.sessions[0].messages).toHaveLength(1);
	});

	it('delete() removes session from persisted data', async () => {
		const session = store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		await new Promise<void>((r) => setTimeout(r, 10));
		store.delete(session.conversationId);
		await new Promise<void>((r) => setTimeout(r, 10));
		const written = JSON.parse(fs.writes[fs.writes.length - 1]);
		expect(written.sessions).toHaveLength(0);
	});

	it('persists via mkdir + writeFile (creates directory if needed)', async () => {
		store.create({ projectPath: PROJECT, gitPath: GIT_PATH });
		await new Promise<void>((r) => setTimeout(r, 10));
		expect(fs.mkdirCalls.length).toBeGreaterThan(0);
		expect(fs.writes.length).toBeGreaterThan(0);
	});
});
