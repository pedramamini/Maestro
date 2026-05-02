/**
 * pm:resolveGithubProject IPC Handler — legacy compatibility only.
 *
 * Maestro Board / Work Graph is the PM source of truth. This handler must not
 * discover, create, or update GitHub Projects because the Roles panel can call
 * it during normal UI rendering.
 */

import { ipcMain } from 'electron';
import { requireEncoreFeature } from '../../utils/requireEncoreFeature';
import type { SettingsStoreInterface } from '../../stores/types';
import type {
	DiscoveryErrorCode,
	GithubProjectMapping,
	RawProject,
} from '../../delivery-planner/github-project-discovery';

export interface ResolveGithubProjectInput {
	projectPath: string;
	/** Retained for compatibility with older callers. Does not trigger network discovery. */
	forceRefresh?: boolean;
	/** Retained for compatibility with older callers. */
	sshRemoteId?: string | null;
}

export type ResolveGithubProjectResult =
	| { success: true; data: GithubProjectMapping; fromCache: boolean }
	| {
			success: false;
			error: string;
			code: DiscoveryErrorCode | 'UNKNOWN' | 'FEATURE_DISABLED' | 'INVALID_INPUT';
			detail?: string;
			candidates?: RawProject[];
	  };

export interface PmResolveGithubProjectHandlerDependencies {
	settingsStore: SettingsStoreInterface;
}

export function registerPmResolveGithubProjectHandlers(
	deps: PmResolveGithubProjectHandlerDependencies
): void {
	const gate = () => requireEncoreFeature(deps.settingsStore, 'deliveryPlanner');

	ipcMain.handle(
		'pm:resolveGithubProject',
		async (_event, input: ResolveGithubProjectInput): Promise<ResolveGithubProjectResult> => {
			const gateError = gate();
			if (gateError) {
				return { success: false, code: 'FEATURE_DISABLED', error: 'Feature not enabled' };
			}

			const { projectPath, forceRefresh = false } = input ?? {};
			if (!projectPath) {
				return { success: false, code: 'INVALID_INPUT', error: 'projectPath is required' };
			}

			const map = deps.settingsStore.get<Record<string, GithubProjectMapping>>(
				'projectGithubMap',
				{}
			);
			if (!forceRefresh && map[projectPath]) {
				return { success: true, data: map[projectPath], fromCache: true };
			}

			return {
				success: false,
				code: 'UNKNOWN',
				error:
					'GitHub Project discovery is disabled. Maestro Board / Work Graph is the PM source of truth.',
			};
		}
	);
}
