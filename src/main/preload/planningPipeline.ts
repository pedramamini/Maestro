/**
 * Preload API for the Planning Pipeline
 *
 * Exposes `window.maestro.pipeline.*` to the renderer.
 * Read-only for v1 — no write operations here.
 */

import { ipcRenderer } from 'electron';
import type { PipelineDashboardResult } from '../ipc/handlers/planning-pipeline';

export function createPlanningPipelineApi() {
	return {
		/**
		 * Fetch the full pipeline dashboard snapshot.
		 * Returns items grouped by stage, plus an `unstaged` bucket for items
		 * that have no pipeline label yet.
		 */
		getDashboard: (): Promise<
			{ success: true; data: PipelineDashboardResult } | { success: false; error: string }
		> => ipcRenderer.invoke('pipeline:getDashboard'),
	};
}

export type PlanningPipelineApi = ReturnType<typeof createPlanningPipelineApi>;
