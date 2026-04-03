import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
	createOpenClawSessionJsonl,
	OPENCLAW_FIXTURE_AGENT_NAME,
	OPENCLAW_FIXTURE_ASSISTANT_MESSAGE,
	OPENCLAW_FIXTURE_CANONICAL_SESSION_ID,
	OPENCLAW_FIXTURE_PROJECT_PATH,
	OPENCLAW_FIXTURE_RAW_SESSION_ID,
	OPENCLAW_FIXTURE_USER_MESSAGE,
} from '../../fixtures/openclaw';

type OpenClawSessionStorageModule = typeof import('../../../main/storage/openclaw-session-storage');

const RAW_SESSION_ID = OPENCLAW_FIXTURE_RAW_SESSION_ID;
const CANONICAL_SESSION_ID = OPENCLAW_FIXTURE_CANONICAL_SESSION_ID;
const PROJECT_PATH = OPENCLAW_FIXTURE_PROJECT_PATH;
const SESSION_MESSAGE_FILE_CONTENT = createOpenClawSessionJsonl();

describe('OpenClawSessionStorage', () => {
	let StorageCtor: OpenClawSessionStorageModule['OpenClawSessionStorage'];
	let tempHome: string;
	const originalHome = process.env.HOME;

	beforeEach(async () => {
		tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-openclaw-storage-'));
		process.env.HOME = tempHome;

		vi.resetModules();
		({ OpenClawSessionStorage: StorageCtor } =
			await import('../../../main/storage/openclaw-session-storage'));

		await fs.mkdir(path.join(tempHome, '.openclaw', '.openclaw', 'agents', 'main', 'sessions'), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(
				tempHome,
				'.openclaw',
				'.openclaw',
				'agents',
				'main',
				'sessions',
				`${RAW_SESSION_ID}.jsonl`
			),
			SESSION_MESSAGE_FILE_CONTENT
		);
	});

	afterEach(async () => {
		if (originalHome !== undefined) {
			process.env.HOME = originalHome;
		} else {
			delete process.env.HOME;
		}

		await fs.rm(tempHome, { recursive: true, force: true });
		vi.resetModules();
	});

	it('resolves canonical composite IDs to a local session path', () => {
		const storage = new StorageCtor();
		const sessionPath = storage.getSessionPath(PROJECT_PATH, CANONICAL_SESSION_ID);

		expect(sessionPath).toContain(
			path.join(
				tempHome,
				'.openclaw',
				'.openclaw',
				'agents',
				'main',
				'sessions',
				`${RAW_SESSION_ID}.jsonl`
			)
		);
	});

	it('rejects raw non-canonical IDs for filesystem lookup', () => {
		const storage = new StorageCtor();
		const sessionPath = storage.getSessionPath(PROJECT_PATH, RAW_SESSION_ID);

		expect(sessionPath).toBeNull();
	});

	it('lists OpenClaw sessions using canonical session IDs', async () => {
		const storage = new StorageCtor();
		const sessions = await storage.listSessions(PROJECT_PATH);

		expect(sessions).toHaveLength(1);
		expect(sessions[0]).toMatchObject({
			sessionId: CANONICAL_SESSION_ID,
			projectPath: PROJECT_PATH,
			messageCount: 2,
			firstMessage: 'First message for OpenClaw',
		});
	});

	it('reads OpenClaw session messages from canonical session IDs', async () => {
		const storage = new StorageCtor();
		const result = await storage.readSessionMessages(PROJECT_PATH, CANONICAL_SESSION_ID);

		expect(result.total).toBe(2);
		expect(result.messages).toHaveLength(2);
		expect(result.messages[0]).toMatchObject({
			type: 'user',
			role: 'user',
			content: OPENCLAW_FIXTURE_USER_MESSAGE,
		});
		expect(result.messages[1]).toMatchObject({
			type: 'assistant',
			role: 'assistant',
			content: OPENCLAW_FIXTURE_ASSISTANT_MESSAGE,
		});
	});

	it('supports alternate agent names through the shared fixture builder', async () => {
		const agentName = 'planner';
		const rawSessionId = 'planner-uuid';
		await fs.mkdir(path.join(tempHome, '.openclaw', '.openclaw', 'agents', agentName, 'sessions'), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				tempHome,
				'.openclaw',
				'.openclaw',
				'agents',
				agentName,
				'sessions',
				`${rawSessionId}.jsonl`
			),
			createOpenClawSessionJsonl({
				agentName,
				rawSessionId,
				initSessionId: rawSessionId,
			})
		);

		const storage = new StorageCtor();
		const sessions = await storage.listSessions(PROJECT_PATH);

		expect(sessions.some((session) => session.sessionId === `${agentName}:${rawSessionId}`)).toBe(
			true
		);
		expect(OPENCLAW_FIXTURE_AGENT_NAME).toBe('main');
	});
});
