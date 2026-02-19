/**
 * Preload API for Plugin operations
 *
 * Provides the window.maestro.plugins namespace for:
 * - Listing all discovered plugins
 * - Enabling/disabling plugins
 * - Getting the plugins directory path
 * - Refreshing the plugin list
 */

import { ipcRenderer } from 'electron';

export interface PluginsApi {
	getAll: () => Promise<unknown>;
	enable: (id: string) => Promise<unknown>;
	disable: (id: string) => Promise<unknown>;
	getDir: () => Promise<unknown>;
	refresh: () => Promise<unknown>;
}

/**
 * Creates the Plugins API object for preload exposure
 */
export function createPluginsApi(): PluginsApi {
	return {
		getAll: () => ipcRenderer.invoke('plugins:getAll'),

		enable: (id: string) => ipcRenderer.invoke('plugins:enable', id),

		disable: (id: string) => ipcRenderer.invoke('plugins:disable', id),

		getDir: () => ipcRenderer.invoke('plugins:getDir'),

		refresh: () => ipcRenderer.invoke('plugins:refresh'),
	};
}
