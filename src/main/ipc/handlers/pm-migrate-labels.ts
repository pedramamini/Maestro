/**
 * Legacy pm:migrateLegacyLabels IPC handler.
 *
 * PM/dispatch state is local-first in Maestro Board / Work Graph. GitHub
 * labels and project fields are not runtime state, so this compatibility
 * command intentionally performs no GitHub reads or writes.
 */

import { ipcMain } from 'electron';
import { requireEncoreFeature } from '../../utils/requireEncoreFeature';
import type { SettingsStoreInterface } from '../../stores/types';
import { logger } from '../../utils/logger';

const LOG_CONTEXT = '[PmMigrateLabels]';

export interface MigrateLegacyLabelsInput {
	projectPath: string;
}

export interface MigrateLegacyLabelsResult {
	success: boolean;
	migrated?: number;
	errors?: Array<{ issueNumber: number; label: string; message: string }>;
	error?: string;
}

export interface PmMigrateLabelsHandlerDependencies {
	settingsStore: SettingsStoreInterface;
}

export function registerPmMigrateLabelsHandlers(deps: PmMigrateLabelsHandlerDependencies): void {
	const gate = () => requireEncoreFeature(deps.settingsStore, 'deliveryPlanner');

	ipcMain.handle(
		'pm:migrateLegacyLabels',
		async (_event, input: MigrateLegacyLabelsInput): Promise<MigrateLegacyLabelsResult> => {
			const gateError = gate();
			if (gateError) return { success: false, error: 'Feature not enabled (deliveryPlanner)' };

			const { projectPath } = input ?? {};
			if (!projectPath) {
				return { success: false, error: 'projectPath is required' };
			}

			logger.info(
				`${LOG_CONTEXT} skipped for ${projectPath}; Work Graph is authoritative PM state`
			);
			return {
				success: true,
				migrated: 0,
				errors: [],
				error:
					'Legacy GitHub label migration is obsolete. Maestro Board / Work Graph is now the PM source of truth.',
			};
		}
	);

	logger.debug(`${LOG_CONTEXT} pm:migrateLegacyLabels IPC handler registered`);
}
