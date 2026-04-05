/**
 * Spec Kit Service - thin wrapper over shared spec command service.
 */

import { createSpecCommandService } from './specCommands';

const service = createSpecCommandService({
	logPrefix: '[SpecKit]',
	getIPC: () => window.maestro?.speckit,
});

export const getSpeckitCommands = service.getCommands;
export const getSpeckitMetadata = service.getMetadata;
export const getSpeckitCommand = service.getCommand;
