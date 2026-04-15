import { ipcRenderer } from 'electron';

export interface MaestroCliApi {
	checkStatus: () => Promise<{
		expectedVersion: string;
		installed: boolean;
		inPath: boolean;
		commandPath: string | null;
		installedVersion: string | null;
		versionMatch: boolean;
		needsInstallOrUpdate: boolean;
		installDir: string;
		bundledCliPath: string | null;
	}>;
	installOrUpdate: () => Promise<{
		success: boolean;
		status: {
			expectedVersion: string;
			installed: boolean;
			inPath: boolean;
			commandPath: string | null;
			installedVersion: string | null;
			versionMatch: boolean;
			needsInstallOrUpdate: boolean;
			installDir: string;
			bundledCliPath: string | null;
		};
		pathUpdated: boolean;
		restartRequired: boolean;
		shellFilesUpdated: string[];
	}>;
}

export function createMaestroCliApi(): MaestroCliApi {
	return {
		checkStatus: () => ipcRenderer.invoke('maestroCli:checkStatus'),
		installOrUpdate: () => ipcRenderer.invoke('maestroCli:installOrUpdate'),
	};
}
