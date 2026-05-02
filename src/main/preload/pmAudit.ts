/**
 * Preload API for the pm-audit IPC channel (#434).
 *
 * Exposes `window.maestro.pmAudit.run()` so the renderer can trigger a full
 * audit sweep of in-flight work items without touching ipcRenderer directly.
 */

import { ipcRenderer } from 'electron';
import type { PmAuditRunOptions, PmAuditRunResult } from '../ipc/handlers/pm-audit';

export function createPmAuditApi() {
	return {
		/**
		 * Run the local PM audit sweep over active Work Graph claims.
		 *
		 * @param opts - Optional overrides (staleClaimMs, projectRoleSlots).
		 * @returns A structured report with autoFixed and needsAttention findings.
		 */
		run: (
			opts?: PmAuditRunOptions
		): Promise<PmAuditRunResult | { success: false; error: string }> =>
			ipcRenderer.invoke('pmAudit:run', opts ?? {}),
	};
}

export type PmAuditApi = ReturnType<typeof createPmAuditApi>;
