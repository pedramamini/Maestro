/**
 * Agent error listener.
 * Handles agent errors (auth expired, token exhaustion, rate limits, etc.).
 * When account multiplexing is active:
 * - rate_limited errors → throttle handler (account switching)
 * - auth_expired errors → auth recovery (re-login + respawn)
 */

import type { ProcessManager } from '../process-manager';
import type { AgentError } from '../../shared/types';
import type { ProcessListenerDependencies } from './types';
import type { AccountThrottleHandler } from '../accounts/account-throttle-handler';
import type { AccountAuthRecovery } from '../accounts/account-auth-recovery';
import type { AccountRegistry } from '../accounts/account-registry';

/**
 * Sets up the agent-error listener.
 * Handles logging and forwarding of agent errors to renderer.
 * Optionally triggers throttle handling or auth recovery for account multiplexing.
 */
export function setupErrorListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend' | 'logger'>,
	accountDeps?: {
		getAccountRegistry: () => AccountRegistry | null;
		getThrottleHandler: () => AccountThrottleHandler | null;
		getAuthRecovery: () => AccountAuthRecovery | null;
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

		if (!accountDeps) return;

		const accountRegistry = accountDeps.getAccountRegistry();
		if (!accountRegistry) return;

		const assignment = accountRegistry.getAssignment(sessionId);
		if (!assignment) return;

		if (agentError.type === 'auth_expired') {
			// Auth expired → attempt automatic re-login
			const authRecovery = accountDeps.getAuthRecovery();
			if (authRecovery) {
				authRecovery.recoverAuth(sessionId, assignment.accountId).catch((err) => {
					logger.error('Auth recovery failed', 'AgentError', {
						error: String(err), sessionId,
					});
				});
			}
		} else if (agentError.type === 'rate_limited') {
			// Rate limited → throttle handler (account switching)
			const throttleHandler = accountDeps.getThrottleHandler();
			if (throttleHandler) {
				throttleHandler.handleThrottle({
					sessionId,
					accountId: assignment.accountId,
					errorType: agentError.type,
					errorMessage: agentError.message,
				});
			}
		}
	});
}
