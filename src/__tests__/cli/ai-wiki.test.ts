import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../shared/cli-server-discovery', () => ({
	readCliServerInfo: vi.fn(),
	isCliServerRunning: vi.fn(),
}));

import { buildAiWikiProjectRequest, getAiWikiBaseUrl } from '../../cli/commands/ai-wiki';
import { readCliServerInfo, isCliServerRunning } from '../../shared/cli-server-discovery';

describe('ai-wiki CLI helpers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.MAESTRO_CLI_BASE_URL;
	});

	it('builds the app API base URL from MAESTRO_CLI_BASE_URL', () => {
		process.env.MAESTRO_CLI_BASE_URL = 'https://maestro.example.test/token/';

		expect(getAiWikiBaseUrl()).toBe('https://maestro.example.test/token/api/ai-wiki');
	});

	it('builds the app API base URL from CLI server discovery', () => {
		vi.mocked(readCliServerInfo).mockReturnValue({
			port: 3210,
			token: 'test-token',
			pid: 12345,
			startedAt: Date.now(),
		});
		vi.mocked(isCliServerRunning).mockReturnValue(true);

		expect(getAiWikiBaseUrl()).toBe('http://127.0.0.1:3210/test-token/api/ai-wiki');
	});

	it('builds the request body with resolved project root and optional ids', () => {
		const request = buildAiWikiProjectRequest({
			project: '.',
			sshRemote: 'remote-a',
			projectId: 'custom-project',
		});

		expect(request).toMatchObject({
			projectRoot: process.cwd(),
			sshRemoteId: 'remote-a',
			projectId: 'custom-project',
		});
	});

	it('requires an explicit project path', () => {
		expect(() => buildAiWikiProjectRequest({})).toThrow('--project is required');
	});
});
