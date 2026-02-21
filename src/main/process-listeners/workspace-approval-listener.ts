/**
 * Workspace approval listener.
 * Handles Gemini CLI sandbox violations and forwards approval requests to the renderer.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies } from './types';

/**
 * Sets up the workspace-approval-request listener.
 * Handles logging and forwarding of Gemini sandbox violations to renderer.
 */
export function setupWorkspaceApprovalListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend' | 'logger'>
): void {
	const { safeSend, logger } = deps;

	processManager.on('workspace-approval-request', (sessionId: string, request: { deniedPath: string; errorMessage: string; timestamp: number }) => {
		logger.info('Workspace approval requested for Gemini sandbox violation', 'WorkspaceApproval', {
			sessionId,
			deniedPath: request.deniedPath,
		});
		safeSend('process:workspace-approval', sessionId, request);
	});
}
