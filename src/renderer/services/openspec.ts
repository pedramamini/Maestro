/**
 * OpenSpec Service - thin wrapper over shared spec command service.
 */

import { createSpecCommandService } from './specCommands';

const service = createSpecCommandService({
	logPrefix: '[OpenSpec]',
	getIPC: () => window.maestro?.openspec,
});

export const getOpenSpecCommands = service.getCommands;
export const getOpenSpecMetadata = service.getMetadata;
export const getOpenSpecCommand = service.getCommand;
