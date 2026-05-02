/**
 * Preload API for the legacy pm:resolveGithubProject IPC channel (#447).
 *
 * Exposes window.maestro.pmResolveGithubProject.resolve() for compatibility.
 * This is cache-only now; it must not discover, create, or update GitHub
 * Projects during normal PM/dispatch UI rendering.
 */

import { ipcRenderer } from 'electron';
import type {
	ResolveGithubProjectInput,
	ResolveGithubProjectResult,
} from '../ipc/handlers/pm-resolve-github-project';

export function createPmResolveGithubProjectApi() {
	return {
		/**
		 * Resolve a cached external GitHub Project mapping for a project path.
		 * Returns a compatibility error when no cache entry exists.
		 *
		 * Pass `sshRemoteId` when the session's project lives on an SSH remote so
		 * older callers can keep their input shape; no remote GitHub discovery runs.
		 */
		resolve: (input: ResolveGithubProjectInput): Promise<ResolveGithubProjectResult> =>
			ipcRenderer.invoke('pm:resolveGithubProject', input),
	};
}

export type PmResolveGithubProjectApi = ReturnType<typeof createPmResolveGithubProjectApi>;
