/**
 * PluginManager - Browse, enable, configure, and read about plugins.
 *
 * Shows all discovered plugins with their state, permissions, and toggle controls.
 * Click a plugin to expand its detail view with README and settings.
 */

import { useState, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
	Puzzle,
	RefreshCw,
	FolderOpen,
	ToggleLeft,
	ToggleRight,
	AlertCircle,
	Loader2,
	ChevronLeft,
	ChevronRight,
} from 'lucide-react';
import type { Theme } from '../types';
import type { LoadedPlugin, PluginPermission, PluginSettingDefinition } from '../../shared/plugin-types';
import { Modal } from './ui/Modal';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

interface PluginManagerProps {
	theme: Theme;
	plugins: LoadedPlugin[];
	loading: boolean;
	onClose: () => void;
	onEnablePlugin: (id: string) => Promise<void>;
	onDisablePlugin: (id: string) => Promise<void>;
	onRefresh: () => Promise<void>;
	/** When true, renders content directly without Modal wrapper (for embedding in Settings tab) */
	embedded?: boolean;
}

/** Returns a color for a permission badge based on its risk level */
function getPermissionColor(
	permission: PluginPermission,
	theme: Theme
): { bg: string; text: string } {
	if (permission === 'middleware') {
		return { bg: `${theme.colors.error}20`, text: theme.colors.error };
	}
	if (permission.endsWith(':write') || permission === 'process:write' || permission === 'settings:write') {
		return { bg: `${theme.colors.warning}20`, text: theme.colors.warning };
	}
	return { bg: `${theme.colors.success}20`, text: theme.colors.success };
}

/** Validates a setting value. Returns an error message or null if valid. */
function validateSetting(key: string, value: unknown): string | null {
	if (typeof value !== 'string') return null;
	// Path-like settings: validate absolute path if non-empty
	const isPathKey = key.toLowerCase().includes('path') || key.toLowerCase().includes('dir');
	if (isPathKey && value.trim() !== '') {
		if (!value.startsWith('/') && !value.match(/^[a-zA-Z]:\\/)) {
			return 'Must be an absolute path (e.g., /tmp/status.json)';
		}
	}
	// URL-like settings: validate URL format if non-empty
	const isUrlKey = key.toLowerCase().includes('url') || key.toLowerCase().includes('endpoint');
	if (isUrlKey && value.trim() !== '') {
		try {
			new URL(value);
		} catch {
			return 'Must be a valid URL (e.g., https://example.com/webhook)';
		}
	}
	return null;
}

/** Plugin settings editor for plugins that declare settings in their manifest */
function PluginSettings({
	plugin,
	theme,
}: {
	plugin: LoadedPlugin;
	theme: Theme;
}) {
	const settings = plugin.manifest.settings;
	if (!settings || settings.length === 0) return null;

	const [values, setValues] = useState<Record<string, unknown>>({});
	const [localValues, setLocalValues] = useState<Record<string, string>>({});
	const [loaded, setLoaded] = useState(false);
	const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
	const [errors, setErrors] = useState<Record<string, string | null>>({});

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const result = await window.maestro.plugins.settings.get(plugin.manifest.id);
				if (!cancelled && result?.success && result.settings) {
					setValues(result.settings);
				}
			} catch {
				// Ignore load errors
			} finally {
				if (!cancelled) setLoaded(true);
			}
		})();
		return () => { cancelled = true; };
	}, [plugin.manifest.id]);

	/** Save a setting immediately (for toggles, selects, numbers) */
	const handleSave = useCallback(async (key: string, value: unknown) => {
		const error = validateSetting(key, value);
		setErrors((prev) => ({ ...prev, [key]: error }));
		if (error) return;

		setValues((prev) => ({ ...prev, [key]: value }));
		try {
			await window.maestro.plugins.settings.set(plugin.manifest.id, key, value);
			setSavedKeys((prev) => new Set(prev).add(key));
			setTimeout(() => {
				setSavedKeys((prev) => {
					const next = new Set(prev);
					next.delete(key);
					return next;
				});
			}, 1500);
		} catch {
			// Ignore save errors
		}
	}, [plugin.manifest.id]);

	/** Save a text setting on blur */
	const handleBlurSave = useCallback((key: string, value: string) => {
		handleSave(key, value);
	}, [handleSave]);

	if (!loaded) return null;

	return (
		<div className="space-y-3">
			<h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: theme.colors.textDim }}>
				Settings
			</h4>
			{settings.map((setting: PluginSettingDefinition) => {
				const savedValue = values[setting.key] ?? setting.default;
				const error = errors[setting.key];
				const saved = savedKeys.has(setting.key);

				if (setting.type === 'boolean') {
					return (
						<div
							key={setting.key}
							className="flex items-center justify-between gap-2 cursor-pointer"
							onClick={() => handleSave(setting.key, !savedValue)}
						>
							<span className="text-xs" style={{ color: theme.colors.textMain }}>
								{setting.label}
							</span>
							<div className="flex items-center gap-1.5">
								{saved && (
									<span className="text-[10px]" style={{ color: theme.colors.success }}>
										Saved
									</span>
								)}
								<span style={{ color: savedValue ? theme.colors.success : theme.colors.textDim }}>
									{savedValue ? (
										<ToggleRight className="w-5 h-5" />
									) : (
										<ToggleLeft className="w-5 h-5" />
									)}
								</span>
							</div>
						</div>
					);
				}

				if (setting.type === 'string') {
					const localKey = setting.key;
					const displayValue = localValues[localKey] ?? (typeof savedValue === 'string' ? savedValue : '');
					return (
						<div key={setting.key} className="space-y-1">
							<div className="flex items-center justify-between">
								<label className="text-xs" style={{ color: theme.colors.textMain }}>
									{setting.label}
								</label>
								{saved && (
									<span className="text-[10px]" style={{ color: theme.colors.success }}>
										Saved
									</span>
								)}
							</div>
							<input
								type="text"
								value={displayValue}
								onChange={(e) => {
									setLocalValues((prev) => ({ ...prev, [localKey]: e.target.value }));
									// Clear error while typing
									if (errors[setting.key]) {
										setErrors((prev) => ({ ...prev, [setting.key]: null }));
									}
								}}
								onBlur={(e) => {
									handleBlurSave(setting.key, e.target.value);
									// Clear local override after save
									setLocalValues((prev) => {
										const next = { ...prev };
										delete next[localKey];
										return next;
									});
								}}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										(e.target as HTMLInputElement).blur();
									}
								}}
								placeholder={(() => {
								if (typeof setting.default === 'string' && setting.default) return setting.default;
								// For path settings with empty default, show the plugin's default data dir as hint
								const isPathKey = setting.key.toLowerCase().includes('path') || setting.key.toLowerCase().includes('dir');
								if (isPathKey && plugin.path) return `Default: ${plugin.path}/data/status.json`;
								return 'Not set';
							})()}
								className="w-full px-2 py-1.5 rounded text-xs border bg-transparent outline-none"
								style={{
									borderColor: error ? theme.colors.error : theme.colors.border,
									color: theme.colors.textMain,
								}}
							/>
							{error && (
								<p className="text-[10px]" style={{ color: theme.colors.error }}>
									{error}
								</p>
							)}
						</div>
					);
				}

				if (setting.type === 'number') {
					return (
						<div key={setting.key} className="space-y-1">
							<div className="flex items-center justify-between">
								<label className="text-xs" style={{ color: theme.colors.textMain }}>
									{setting.label}
								</label>
								{saved && (
									<span className="text-[10px]" style={{ color: theme.colors.success }}>
										Saved
									</span>
								)}
							</div>
							<input
								type="number"
								value={typeof savedValue === 'number' ? savedValue : ''}
								onChange={(e) => handleSave(setting.key, Number(e.target.value))}
								className="w-full px-2 py-1.5 rounded text-xs border bg-transparent outline-none"
								style={{
									borderColor: theme.colors.border,
									color: theme.colors.textMain,
								}}
							/>
						</div>
					);
				}

				if (setting.type === 'select' && setting.options) {
					return (
						<div key={setting.key} className="space-y-1">
							<div className="flex items-center justify-between">
								<label className="text-xs" style={{ color: theme.colors.textMain }}>
									{setting.label}
								</label>
								{saved && (
									<span className="text-[10px]" style={{ color: theme.colors.success }}>
										Saved
									</span>
								)}
							</div>
							<select
								value={String(savedValue ?? '')}
								onChange={(e) => handleSave(setting.key, e.target.value)}
								className="w-full px-2 py-1.5 rounded text-xs border bg-transparent outline-none"
								style={{
									borderColor: theme.colors.border,
									color: theme.colors.textMain,
								}}
							>
								{setting.options.map((opt) => (
									<option key={String(opt.value)} value={String(opt.value)}>
										{opt.label}
									</option>
								))}
							</select>
						</div>
					);
				}

				return null;
			})}
		</div>
	);
}

export function PluginManager({
	theme,
	plugins,
	loading,
	onClose,
	onEnablePlugin,
	onDisablePlugin,
	onRefresh,
	embedded,
}: PluginManagerProps) {
	const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
	const [refreshing, setRefreshing] = useState(false);
	const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);

	const handleToggle = useCallback(
		async (plugin: LoadedPlugin, e?: React.MouseEvent) => {
			if (e) e.stopPropagation();
			const id = plugin.manifest.id;
			setTogglingIds((prev) => new Set(prev).add(id));
			try {
				if (plugin.state === 'active' || plugin.state === 'loaded') {
					await onDisablePlugin(id);
				} else {
					await onEnablePlugin(id);
				}
			} finally {
				setTogglingIds((prev) => {
					const next = new Set(prev);
					next.delete(id);
					return next;
				});
			}
		},
		[onEnablePlugin, onDisablePlugin]
	);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await onRefresh();
		} finally {
			setRefreshing(false);
		}
	}, [onRefresh]);

	const handleOpenFolder = useCallback(async () => {
		try {
			const result = await window.maestro.plugins.getDir();
			// IPC handler returns { success: true, dir: '...' } via createIpcHandler
			const dir = result?.success ? result.dir : null;
			if (dir) {
				await window.maestro.shell.showItemInFolder(dir);
			}
		} catch (err) {
			console.error('Failed to open plugins folder:', err);
		}
	}, []);

	const isEnabled = (plugin: LoadedPlugin) =>
		plugin.state === 'active' || plugin.state === 'loaded';

	const selectedPlugin = selectedPluginId
		? plugins.find((p) => p.manifest.id === selectedPluginId)
		: null;

	// Detail view for a selected plugin
	const detailView = selectedPlugin && (
		<div className="space-y-4">
			{/* Back button */}
			<button
				onClick={() => setSelectedPluginId(null)}
				className="flex items-center gap-1 text-xs hover:underline"
				style={{ color: theme.colors.textDim }}
			>
				<ChevronLeft className="w-3.5 h-3.5" />
				Back to plugins
			</button>

			{/* Plugin header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-bold" style={{ color: theme.colors.textMain }}>
							{selectedPlugin.manifest.name}
						</span>
						<span className="text-xs font-mono" style={{ color: theme.colors.textDim }}>
							v{selectedPlugin.manifest.version}
						</span>
					</div>
					<div className="text-xs mt-0.5" style={{ color: theme.colors.textDim }}>
						by {selectedPlugin.manifest.author}
					</div>
				</div>

				{/* Toggle */}
				<button
					onClick={(e) => handleToggle(selectedPlugin, e)}
					disabled={togglingIds.has(selectedPlugin.manifest.id) || selectedPlugin.state === 'error'}
					className="transition-colors"
					title={isEnabled(selectedPlugin) ? 'Disable plugin' : 'Enable plugin'}
					style={{
						color: isEnabled(selectedPlugin) ? theme.colors.success : theme.colors.textDim,
					}}
				>
					{togglingIds.has(selectedPlugin.manifest.id) ? (
						<Loader2 className="w-5 h-5 animate-spin" />
					) : isEnabled(selectedPlugin) ? (
						<ToggleRight className="w-5 h-5" />
					) : (
						<ToggleLeft className="w-5 h-5" />
					)}
				</button>
			</div>

			{/* Permissions */}
			{selectedPlugin.manifest.permissions.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{selectedPlugin.manifest.permissions.map((perm) => {
						const colors = getPermissionColor(perm, theme);
						return (
							<span
								key={perm}
								className="text-[10px] px-1.5 py-0.5 rounded font-mono"
								style={{ backgroundColor: colors.bg, color: colors.text }}
							>
								{perm}
							</span>
						);
					})}
				</div>
			)}

			{/* Error */}
			{selectedPlugin.state === 'error' && selectedPlugin.error && (
				<div className="flex items-start gap-1.5 text-xs" style={{ color: theme.colors.error }}>
					<AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
					<span>{selectedPlugin.error}</span>
				</div>
			)}

			{/* Settings */}
			<PluginSettings plugin={selectedPlugin} theme={theme} />

			{/* README */}
			{selectedPlugin.readme ? (
				<div
					className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed"
					style={{ color: theme.colors.textMain }}
				>
					<ReactMarkdown
						components={{
							h1: ({ children }) => (
								<h1 className="text-base font-bold mt-4 mb-2" style={{ color: theme.colors.textMain }}>
									{children}
								</h1>
							),
							h2: ({ children }) => (
								<h2 className="text-sm font-bold mt-3 mb-1.5" style={{ color: theme.colors.textMain }}>
									{children}
								</h2>
							),
							h3: ({ children }) => (
								<h3 className="text-xs font-bold mt-2 mb-1" style={{ color: theme.colors.textMain }}>
									{children}
								</h3>
							),
							p: ({ children }) => (
								<p className="text-xs mb-2 leading-relaxed" style={{ color: theme.colors.textMain }}>
									{children}
								</p>
							),
							code: ({ children, className }) => {
								const isBlock = className?.includes('language-');
								if (isBlock) {
									return (
										<pre
											className="text-[11px] p-2 rounded overflow-x-auto my-2"
											style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textMain }}
										>
											<code>{children}</code>
										</pre>
									);
								}
								return (
									<code
										className="text-[11px] px-1 py-0.5 rounded"
										style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textMain }}
									>
										{children}
									</code>
								);
							},
							pre: ({ children }) => <>{children}</>,
							ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
							ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
							li: ({ children }) => (
								<li className="text-xs" style={{ color: theme.colors.textMain }}>
									{children}
								</li>
							),
							table: ({ children }) => (
								<table className="w-full text-xs border-collapse my-2" style={{ borderColor: theme.colors.border }}>
									{children}
								</table>
							),
							th: ({ children }) => (
								<th
									className="text-left px-2 py-1 border-b text-xs font-bold"
									style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
								>
									{children}
								</th>
							),
							td: ({ children }) => (
								<td
									className="px-2 py-1 border-b text-xs"
									style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
								>
									{children}
								</td>
							),
							strong: ({ children }) => (
								<strong style={{ color: theme.colors.textMain }}>{children}</strong>
							),
						}}
					>
						{selectedPlugin.readme}
					</ReactMarkdown>
				</div>
			) : (
				<div className="text-xs py-4 text-center" style={{ color: theme.colors.textDim }}>
					No README available for this plugin.
				</div>
			)}
		</div>
	);

	// List view
	const listView = (
		<div className="space-y-3">
			{/* Toolbar */}
			<div className="flex items-center justify-between">
				<span className="text-xs" style={{ color: theme.colors.textDim }}>
					{plugins.length} plugin{plugins.length !== 1 ? 's' : ''} discovered
				</span>
				<div className="flex items-center gap-2">
					<button
						onClick={handleOpenFolder}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs border hover:bg-white/5 transition-colors"
						style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
						title="Open plugins folder"
					>
						<FolderOpen className="w-3.5 h-3.5" />
						Open Folder
					</button>
					<button
						onClick={handleRefresh}
						disabled={refreshing}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs border hover:bg-white/5 transition-colors"
						style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
						title="Refresh plugin list"
					>
						<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
						Refresh
					</button>
				</div>
			</div>

			{/* Plugin List */}
			{loading ? (
				<div className="flex items-center justify-center py-8 gap-2">
					<Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.colors.textDim }} />
					<span className="text-xs" style={{ color: theme.colors.textDim }}>
						Loading plugins...
					</span>
				</div>
			) : plugins.length === 0 ? (
				<div
					className="text-center py-8 space-y-2"
					style={{ color: theme.colors.textDim }}
				>
					<Puzzle className="w-8 h-8 mx-auto opacity-50" />
					<p className="text-sm">No plugins installed</p>
					<p className="text-xs">
						Place plugin folders in the plugins directory to get started.
					</p>
				</div>
			) : (
				<div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
					{plugins.map((plugin) => {
						const toggling = togglingIds.has(plugin.manifest.id);
						const enabled = isEnabled(plugin);

						return (
							<div
								key={plugin.manifest.id}
								className="p-3 rounded border cursor-pointer hover:brightness-110 transition-all"
								style={{
									borderColor:
										plugin.state === 'error'
											? theme.colors.error
											: theme.colors.border,
									backgroundColor: theme.colors.bgActivity,
								}}
								onClick={() => setSelectedPluginId(plugin.manifest.id)}
							>
								{/* Header row */}
								<div className="flex items-center justify-between mb-1">
									<div className="flex items-center gap-2">
										<span
											className="text-sm font-bold"
											style={{ color: theme.colors.textMain }}
										>
											{plugin.manifest.name}
										</span>
										<span
											className="text-xs font-mono"
											style={{ color: theme.colors.textDim }}
										>
											v{plugin.manifest.version}
										</span>
									</div>

									<div className="flex items-center gap-1.5">
										{/* Toggle */}
										<button
											onClick={(e) => handleToggle(plugin, e)}
											disabled={toggling || plugin.state === 'error'}
											className="transition-colors"
											title={enabled ? 'Disable plugin' : 'Enable plugin'}
											style={{
												color: enabled
													? theme.colors.success
													: theme.colors.textDim,
											}}
										>
											{toggling ? (
												<Loader2 className="w-5 h-5 animate-spin" />
											) : enabled ? (
												<ToggleRight className="w-5 h-5" />
											) : (
												<ToggleLeft className="w-5 h-5" />
											)}
										</button>
										{/* Expand arrow */}
										<ChevronRight className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
									</div>
								</div>

								{/* Author */}
								<div className="text-xs mb-1" style={{ color: theme.colors.textDim }}>
									by {plugin.manifest.author}
								</div>

								{/* Description */}
								<div
									className="text-xs mb-2"
									style={{ color: theme.colors.textMain }}
								>
									{plugin.manifest.description}
								</div>

								{/* Permissions */}
								{plugin.manifest.permissions.length > 0 && (
									<div className="flex flex-wrap gap-1 mb-1">
										{plugin.manifest.permissions.map((perm) => {
											const colors = getPermissionColor(perm, theme);
											return (
												<span
													key={perm}
													className="text-[10px] px-1.5 py-0.5 rounded font-mono"
													style={{
														backgroundColor: colors.bg,
														color: colors.text,
													}}
												>
													{perm}
												</span>
											);
										})}
									</div>
								)}

								{/* Error message */}
								{plugin.state === 'error' && plugin.error && (
									<div
										className="flex items-start gap-1.5 mt-2 text-xs"
										style={{ color: theme.colors.error }}
									>
										<AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
										<span>{plugin.error}</span>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);

	const content = selectedPlugin ? detailView : listView;

	if (embedded) {
		return content;
	}

	return (
		<Modal
			theme={theme}
			title="Plugin Manager"
			priority={MODAL_PRIORITIES.PLUGIN_MANAGER}
			onClose={onClose}
			width={520}
			headerIcon={<Puzzle className="w-4 h-4" />}
		>
			{content}
		</Modal>
	);
}
