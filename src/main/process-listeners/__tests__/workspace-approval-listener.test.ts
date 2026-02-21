/**
 * Tests for workspace approval listener.
 * Handles Gemini CLI sandbox violations and forwards approval requests to the renderer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupWorkspaceApprovalListener } from '../workspace-approval-listener';
import type { ProcessManager } from '../../process-manager';
import type { SafeSendFn } from '../../utils/safe-send';
import type { ProcessListenerDependencies } from '../types';

describe('Workspace Approval Listener', () => {
	let mockProcessManager: ProcessManager;
	let mockSafeSend: SafeSendFn;
	let mockLogger: ProcessListenerDependencies['logger'];
	let eventHandlers: Map<string, (...args: unknown[]) => void>;

	beforeEach(() => {
		vi.clearAllMocks();
		eventHandlers = new Map();

		mockSafeSend = vi.fn();
		mockLogger = {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		};

		mockProcessManager = {
			on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				eventHandlers.set(event, handler);
			}),
		} as unknown as ProcessManager;
	});

	it('should register the workspace-approval-request event listener', () => {
		setupWorkspaceApprovalListener(mockProcessManager, { safeSend: mockSafeSend, logger: mockLogger });

		expect(mockProcessManager.on).toHaveBeenCalledWith('workspace-approval-request', expect.any(Function));
	});

	it('should log and forward workspace approval requests to renderer', () => {
		setupWorkspaceApprovalListener(mockProcessManager, { safeSend: mockSafeSend, logger: mockLogger });

		const handler = eventHandlers.get('workspace-approval-request');
		const testSessionId = 'test-session-123';
		const testRequest = {
			deniedPath: '/home/user/outside-workspace',
			errorMessage: "path '/home/user/outside-workspace' not in workspace",
			timestamp: Date.now(),
		};

		handler?.(testSessionId, testRequest);

		expect(mockLogger.info).toHaveBeenCalledWith(
			'Workspace approval requested for Gemini sandbox violation',
			'WorkspaceApproval',
			expect.objectContaining({
				sessionId: testSessionId,
				deniedPath: '/home/user/outside-workspace',
			})
		);

		expect(mockSafeSend).toHaveBeenCalledWith('process:workspace-approval', testSessionId, testRequest);
	});

	it('should forward the complete request object including timestamp', () => {
		setupWorkspaceApprovalListener(mockProcessManager, { safeSend: mockSafeSend, logger: mockLogger });

		const handler = eventHandlers.get('workspace-approval-request');
		const testSessionId = 'gemini-session-456';
		const timestamp = 1708473600000;
		const testRequest = {
			deniedPath: '/etc/config',
			errorMessage: "'/etc/config.json' permission denied sandbox",
			timestamp,
		};

		handler?.(testSessionId, testRequest);

		expect(mockSafeSend).toHaveBeenCalledWith(
			'process:workspace-approval',
			testSessionId,
			expect.objectContaining({
				deniedPath: '/etc/config',
				errorMessage: "'/etc/config.json' permission denied sandbox",
				timestamp,
			})
		);
	});
});
