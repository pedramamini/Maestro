import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

export interface RegisteredWindow {
	browserWindow: BrowserWindow;
	sessionIds: string[];
	isMain: boolean;
}

export interface CreateWindowOptions {
	windowId?: string;
	browserWindowOptions: BrowserWindowConstructorOptions;
	isMain?: boolean;
	sessionIds?: string[];
}

export class WindowRegistry {
	private readonly windows = new Map<string, RegisteredWindow>();

	private primaryWindowId: string | null = null;

	create(options: CreateWindowOptions): BrowserWindow {
		const {
			windowId,
			browserWindowOptions,
			isMain = false,
			sessionIds = [],
		} = options;

		const browserWindow = new BrowserWindow(browserWindowOptions);
		const resolvedWindowId = windowId ?? browserWindow.id.toString();

		if (this.windows.has(resolvedWindowId)) {
			throw new Error(`Window with id ${resolvedWindowId} already exists`);
		}

		const windowEntry: RegisteredWindow = {
			browserWindow,
			sessionIds: [...new Set(sessionIds)],
			isMain,
		};

		this.windows.set(resolvedWindowId, windowEntry);

		if (isMain) {
			this.primaryWindowId = resolvedWindowId;
		} else if (!this.primaryWindowId) {
			this.primaryWindowId = resolvedWindowId;
			windowEntry.isMain = true;
		}

		browserWindow.on('closed', () => {
			this.remove(resolvedWindowId);
		});

		return browserWindow;
	}

	get(windowId: string): RegisteredWindow | undefined {
		return this.windows.get(windowId);
	}

	getAll(): Array<{ windowId: string } & RegisteredWindow> {
		return Array.from(this.windows.entries()).map(([id, entry]) => ({
			windowId: id,
			...entry,
		}));
	}

	getPrimary(): ({ windowId: string } & RegisteredWindow) | undefined {
		if (!this.primaryWindowId) {
			return undefined;
		}

		const entry = this.windows.get(this.primaryWindowId);

		if (!entry) {
			return undefined;
		}

		return {
			windowId: this.primaryWindowId,
			...entry,
		};
	}

	remove(windowId: string): void {
		const removed = this.windows.get(windowId);

		if (!removed) {
			return;
		}

		this.windows.delete(windowId);

		if (this.primaryWindowId === windowId) {
			this.primaryWindowId = null;
		}
	}

	getWindowForSession(sessionId: string): string | undefined {
		for (const [windowId, entry] of this.windows.entries()) {
			if (entry.sessionIds.includes(sessionId)) {
				return windowId;
			}
		}

		return undefined;
	}

	setSessionsForWindow(windowId: string, sessionIds: string[]): void {
		const entry = this.windows.get(windowId);

		if (!entry) {
			throw new Error(`Window with id ${windowId} not found`);
		}

		entry.sessionIds = [...new Set(sessionIds)];
	}

	moveSession(sessionId: string, fromWindowId: string, toWindowId: string): void {
		if (fromWindowId === toWindowId) {
			return;
		}

		const fromWindow = this.windows.get(fromWindowId);
		const toWindow = this.windows.get(toWindowId);

		if (!fromWindow || !toWindow) {
			throw new Error('Invalid window id provided for moving session');
		}

		fromWindow.sessionIds = fromWindow.sessionIds.filter((id) => id !== sessionId);

		if (!toWindow.sessionIds.includes(sessionId)) {
			toWindow.sessionIds = [...toWindow.sessionIds, sessionId];
		}
	}
}
