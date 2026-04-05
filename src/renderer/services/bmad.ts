/**
 * BMAD Service - thin wrapper over shared spec command service.
 */

import { createSpecCommandService } from './specCommands';

const service = createSpecCommandService({
	logPrefix: '[BMAD]',
	getIPC: () => window.maestro?.bmad,
});

export const getBmadCommands = service.getCommands;
export const getBmadMetadata = service.getMetadata;
export const getBmadCommand = service.getCommand;
