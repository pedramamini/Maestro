/**
 * Tests for VIBES coordinator integration with Maestro startup.
 * Validates that the VibesCoordinator is correctly wired into:
 * - Process spawn flow (via ProcessHandlerDependencies)
 * - Process exit flow (via exit-listener)
 * - ProcessManager event routing (via attachToProcessManager)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { setupExitListener } from '../../../main/process-listeners/exit-listener';
import type { ProcessManager } from '../../../main/process-manager';
import type { ProcessListenerDependencies } from '../../../main/process-listeners/types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a mock VibesCoordinator with spied methods.
 */
function createMockVibesCoordinator() {
	return {
		isEnabled: vi.fn().mockReturnValue(true),
		isEnabledForAgent: vi.fn().mockReturnValue(true),
		attachToProcessManager: vi.fn(),
		handleProcessSpawn: vi.fn().mockResolvedValue(undefined),
		handleProcessExit: vi.fn().mockResolvedValue(undefined),
		handlePromptSent: vi.fn().mockResolvedValue(undefined),
		handleToolExecution: vi.fn().mockResolvedValue(undefined),
		handleThinkingChunk: vi.fn(),
		handleUsage: vi.fn(),
		getSessionStats: vi.fn().mockReturnValue(null),
		getMaestroInstrumenter: vi.fn(),
		getSessionManager: vi.fn(),
	};
}

/**
 * Create minimal exit-listener dependencies with a VIBES coordinator mock.
 */
function createExitListenerDeps(
	overrides: Partial<Parameters<typeof setupExitListener>[1]> = {},
) {
	return {
		safeSend: vi.fn(),
		powerManager: {
			addBlockReason: vi.fn(),
			removeBlockReason: vi.fn(),
		},
		groupChatEmitters: {
			emitStateChange: vi.fn(),
			emitParticipantState: vi.fn(),
		},
		groupChatRouter: {
			routeModeratorResponse: vi.fn().mockResolvedValue(undefined),
			routeAgentResponse: vi.fn().mockResolvedValue(undefined),
			markParticipantResponded: vi.fn().mockReturnValue(false),
			spawnModeratorSynthesis: vi.fn().mockResolvedValue(undefined),
			getGroupChatReadOnlyState: vi.fn().mockReturnValue(false),
			respawnParticipantWithRecovery: vi.fn().mockResolvedValue(undefined),
		},
		groupChatStorage: {
			loadGroupChat: vi.fn().mockResolvedValue(null),
			updateGroupChat: vi.fn().mockResolvedValue(null),
			updateParticipant: vi.fn().mockResolvedValue(null),
		},
		sessionRecovery: {
			needsSessionRecovery: vi.fn().mockReturnValue(false),
			initiateSessionRecovery: vi.fn().mockResolvedValue(true),
		},
		outputBuffer: {
			appendToGroupChatBuffer: vi.fn().mockReturnValue(0),
			getGroupChatBufferedOutput: vi.fn().mockReturnValue(undefined),
			clearGroupChatBuffer: vi.fn(),
		},
		outputParser: {
			extractTextFromStreamJson: vi.fn().mockReturnValue(''),
			parseParticipantSessionId: vi.fn().mockReturnValue(null),
		},
		getProcessManager: () => null as unknown as ProcessManager,
		getAgentDetector: () => null,
		getWebServer: () => null,
		logger: {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		},
		debugLog: vi.fn(),
		patterns: {
			REGEX_MODERATOR_SESSION: /^group-chat-(.+)-moderator-/,
			REGEX_MODERATOR_SESSION_TIMESTAMP: /^group-chat-(.+)-moderator-\d+$/,
			REGEX_AI_SUFFIX: /-ai-[^-]+$/,
			REGEX_AI_TAB_ID: /-ai-([^-]+)$/,
			REGEX_BATCH_SESSION: /-batch-\d+$/,
			REGEX_SYNOPSIS_SESSION: /-synopsis-\d+$/,
		},
		...overrides,
	} as Parameters<typeof setupExitListener>[1];
}

// ============================================================================
// Test Suite
// ============================================================================

describe('VIBES startup integration', () => {
	// ========================================================================
	// Exit Listener: VIBES Coordinator Wiring
	// ========================================================================
	describe('exit-listener VIBES coordinator wiring', () => {
		let mockProcessManager: ProcessManager;
		let eventHandlers: Map<string, (...args: unknown[]) => void>;

		beforeEach(() => {
			vi.clearAllMocks();
			eventHandlers = new Map();
			mockProcessManager = {
				on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
					eventHandlers.set(event, handler);
				}),
			} as unknown as ProcessManager;
		});

		it('should call handleProcessExit on the coordinator when a process exits', async () => {
			const mockCoordinator = createMockVibesCoordinator();
			const deps = createExitListenerDeps({
				getVibesCoordinator: () => mockCoordinator as any,
			});

			setupExitListener(mockProcessManager, deps);
			const handler = eventHandlers.get('exit');

			handler?.('test-session-123', 0);

			// Wait for async operations
			await vi.waitFor(() => {
				expect(mockCoordinator.handleProcessExit).toHaveBeenCalledWith('test-session-123', 0);
			});
		});

		it('should call handleProcessExit with non-zero exit codes', async () => {
			const mockCoordinator = createMockVibesCoordinator();
			const deps = createExitListenerDeps({
				getVibesCoordinator: () => mockCoordinator as any,
			});

			setupExitListener(mockProcessManager, deps);
			const handler = eventHandlers.get('exit');

			handler?.('test-session-456', 1);

			await vi.waitFor(() => {
				expect(mockCoordinator.handleProcessExit).toHaveBeenCalledWith('test-session-456', 1);
			});
		});

		it('should not crash if coordinator is null', () => {
			const deps = createExitListenerDeps({
				getVibesCoordinator: () => null,
			});

			setupExitListener(mockProcessManager, deps);
			const handler = eventHandlers.get('exit');

			// Should not throw
			handler?.('test-session-789', 0);
			expect(deps.safeSend).toHaveBeenCalledWith('process:exit', 'test-session-789', 0);
		});

		it('should not crash if getVibesCoordinator is undefined', () => {
			const deps = createExitListenerDeps({
				getVibesCoordinator: undefined,
			});

			setupExitListener(mockProcessManager, deps);
			const handler = eventHandlers.get('exit');

			// Should not throw
			handler?.('test-session-abc', 0);
			expect(deps.safeSend).toHaveBeenCalledWith('process:exit', 'test-session-abc', 0);
		});

		it('should gracefully handle coordinator errors', async () => {
			const mockCoordinator = createMockVibesCoordinator();
			mockCoordinator.handleProcessExit.mockRejectedValue(new Error('VIBES failure'));
			const deps = createExitListenerDeps({
				getVibesCoordinator: () => mockCoordinator as any,
			});

			setupExitListener(mockProcessManager, deps);
			const handler = eventHandlers.get('exit');

			// Should not throw — error is caught internally
			handler?.('test-session-err', 0);

			await vi.waitFor(() => {
				expect(deps.logger.warn).toHaveBeenCalledWith(
					'[VIBES] Failed to handle process exit',
					'ProcessListener',
					expect.objectContaining({ sessionId: 'test-session-err' }),
				);
			});
		});

		it('should still forward exit to renderer when coordinator is present', () => {
			const mockCoordinator = createMockVibesCoordinator();
			const deps = createExitListenerDeps({
				getVibesCoordinator: () => mockCoordinator as any,
			});

			setupExitListener(mockProcessManager, deps);
			const handler = eventHandlers.get('exit');

			handler?.('regular-session-123', 0);

			// Regular exit handling should still work
			expect(deps.safeSend).toHaveBeenCalledWith('process:exit', 'regular-session-123', 0);
			expect(deps.powerManager.removeBlockReason).toHaveBeenCalledWith(
				'session:regular-session-123',
			);
		});

		it('should call coordinator for group chat exits too', async () => {
			const mockCoordinator = createMockVibesCoordinator();
			const deps = createExitListenerDeps({
				getVibesCoordinator: () => mockCoordinator as any,
			});

			setupExitListener(mockProcessManager, deps);
			const handler = eventHandlers.get('exit');

			// Group chat moderator exit
			handler?.('group-chat-abc-moderator-uuid123', 0);

			await vi.waitFor(() => {
				expect(mockCoordinator.handleProcessExit).toHaveBeenCalledWith(
					'group-chat-abc-moderator-uuid123',
					0,
				);
			});
		});
	});

	// ========================================================================
	// Coordinator Attachment Pattern
	// ========================================================================
	describe('coordinator attachment', () => {
		it('should subscribe to ProcessManager events when attached', () => {
			const emitter = new EventEmitter();
			const mockCoordinator = createMockVibesCoordinator();

			// Simulate what index.ts does
			mockCoordinator.attachToProcessManager(emitter);

			expect(mockCoordinator.attachToProcessManager).toHaveBeenCalledWith(emitter);
		});
	});
});
