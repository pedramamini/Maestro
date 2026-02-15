/**
 * Agent error listener.
 * Handles agent errors (auth expired, token exhaustion, rate limits, etc.).
 * When account multiplexing is active, triggers throttle handling for
 * rate_limited and auth_expired errors on sessions with account assignments.
 */

import type { ProcessManager } from '../process-manager';
import type { AgentError } from '../../shared/types';
import type { ProcessListenerDependencies } from './types';
import type { AccountThrottleHandler } from '../accounts/account-throttle-handler';
import type { AccountRegistry } from '../accounts/account-registry';

/**
 * Sets up the agent-error listener.
 * Handles logging and forwarding of agent errors to renderer.
 * Optionally triggers throttle handling for account multiplexing.
 */
export function setupErrorListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend' | 'logger'>,
	accountDeps?: {
		getAccountRegistry: () => AccountRegistry | null;
		getThrottleHandler: () => AccountThrottleHandler | null;
	}
): void {
	const { safeSend, logger } = deps;

	// Handle agent errors (auth expired, token exhaustion, rate limits, etc.)
	processManager.on('agent-error', (sessionId: string, agentError: AgentError) => {
		logger.info(`Agent error detected: ${agentError.type}`, 'AgentError', {
			sessionId,
			agentId: agentError.agentId,
			errorType: agentError.type,
			message: agentError.message,
			recoverable: agentError.recoverable,
		});
		safeSend('agent:error', sessionId, agentError);

		// Trigger throttle handling for rate-limited/auth-expired errors on sessions with accounts
		if (accountDeps && (agentError.type === 'rate_limited' || agentError.type === 'auth_expired')) {
			const accountRegistry = accountDeps.getAccountRegistry();
			const throttleHandler = accountDeps.getThrottleHandler();
			if (accountRegistry && throttleHandler) {
				const assignment = accountRegistry.getAssignment(sessionId);
				if (assignment) {
					throttleHandler.handleThrottle({
						sessionId,
						accountId: assignment.accountId,
						errorType: agentError.type,
						errorMessage: agentError.message,
					});
				}
			}
		}
	});
}
