import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
	FileCode,
	Search,
	Clock,
	AlertTriangle,
	Database,
	Cpu,
} from 'lucide-react';
import type { Theme } from '../../types';

// ============================================================================
// Types
// ============================================================================

/** A single blame entry from `vibescheck blame --json`. */
interface BlameEntry {
	line_start: number;
	line_end: number;
	model_name: string;
	model_version?: string;
	tool_name?: string;
	action: 'create' | 'modify' | 'delete' | 'review';
	timestamp: string;
	session_id?: string;
}

/** Props for the VibesBlameView component. */
interface VibesBlameViewProps {
	theme: Theme;
	projectPath: string | undefined;
	/** Optional pre-selected file path (e.g. from file explorer context menu). */
	initialFilePath?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Consistent color palette for model assignment (cycles for > 6 models). */
const MODEL_COLORS = [
	'#bd93f9', // purple
	'#50fa7b', // green
	'#ff79c6', // pink
	'#8be9fd', // cyan
	'#f1fa8c', // yellow
	'#ffb86c', // orange
	'#ff5555', // red
	'#6272a4', // blue-gray
];

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
	create: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
	modify: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
	delete: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
	review: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
};

// ============================================================================
// Helpers
// ============================================================================

/** Format a timestamp as relative time (e.g., "3 days ago"). */
function formatRelativeTime(timestamp: string): string {
	const now = Date.now();
	const then = new Date(timestamp).getTime();
	if (isNaN(then)) return timestamp;

	const diffMs = now - then;
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHr = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHr / 24);

	if (diffSec < 60) return 'just now';
	if (diffMin < 60) return `${diffMin} min ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	if (diffDay < 30) return `${diffDay}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

/** Format a tool name for display. */
function formatToolName(toolName?: string): string {
	if (!toolName) return 'Unknown';
	const lower = toolName.toLowerCase();
	if (lower.includes('claude') || lower.includes('claude-code')) return 'Claude Code';
	if (lower.includes('codex')) return 'Codex';
	if (lower.includes('maestro')) return 'Maestro';
	return toolName;
}

/** Parse the JSON output from `vibescheck blame --json`. */
function parseBlameData(raw: string | undefined): BlameEntry[] {
	if (!raw) return [];
	try {
		const data = JSON.parse(raw);
		if (Array.isArray(data)) return data;
		if (data.entries && Array.isArray(data.entries)) return data.entries;
		if (data.blame && Array.isArray(data.blame)) return data.blame;
		return [];
	} catch {
		return [];
	}
}

// ============================================================================
// Component
// ============================================================================

/**
 * VIBES Blame View — shows AI attribution per line for a selected file,
 * similar to `git blame` but for AI involvement.
 *
 * Features:
 * - File selector with type-to-filter
 * - Blame display with line ranges, model info, action types, timestamps
 * - Color-coded gutter by model
 * - Empty state and "Build Required" notice
 */
export const VibesBlameView: React.FC<VibesBlameViewProps> = ({
	theme,
	projectPath,
	initialFilePath,
}) => {
	const [filePath, setFilePath] = useState(initialFilePath ?? '');
	const [fileSearch, setFileSearch] = useState(initialFilePath ?? '');
	const [trackedFiles, setTrackedFiles] = useState<string[]>([]);
	const [blameEntries, setBlameEntries] = useState<BlameEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [needsBuild, setNeedsBuild] = useState(false);
	const [isBuilding, setIsBuilding] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);

	// Build a stable model -> color map
	const modelColorMap = useMemo(() => {
		const map = new Map<string, string>();
		const uniqueModels = [...new Set(blameEntries.map((e) => e.model_name))];
		uniqueModels.forEach((model, idx) => {
			map.set(model, MODEL_COLORS[idx % MODEL_COLORS.length]);
		});
		return map;
	}, [blameEntries]);

	// ========================================================================
	// Fetch tracked files from coverage data
	// ========================================================================

	useEffect(() => {
		if (!projectPath) return;
		let cancelled = false;

		(async () => {
			try {
				const result = await window.maestro.vibes.getCoverage(projectPath);
				if (cancelled) return;
				if (result.success && result.data) {
					try {
						const data = JSON.parse(result.data);
						const files: string[] = [];
						if (Array.isArray(data)) {
							data.forEach((item: { file_path?: string; file?: string }) => {
								if (item.file_path) files.push(item.file_path);
								else if (item.file) files.push(item.file);
							});
						} else if (data.files && Array.isArray(data.files)) {
							data.files.forEach((item: { file_path?: string; file?: string; path?: string }) => {
								if (item.file_path) files.push(item.file_path);
								else if (item.file) files.push(item.file);
								else if (item.path) files.push(item.path);
							});
						}
						setTrackedFiles(files.sort());
					} catch {
						// Coverage data not parseable — not an error, just no file list
					}
				}
			} catch {
				// Coverage fetch failed silently
			}
		})();

		return () => { cancelled = true; };
	}, [projectPath]);

	// ========================================================================
	// Fetch blame data when file is selected
	// ========================================================================

	const fetchBlame = useCallback(async (path: string) => {
		if (!projectPath || !path.trim()) return;

		setIsLoading(true);
		setError(null);
		setNeedsBuild(false);
		setBlameEntries([]);

		try {
			const result = await window.maestro.vibes.getBlame(projectPath, path);
			if (result.success) {
				const entries = parseBlameData(result.data);
				setBlameEntries(entries);
			} else {
				const errMsg = result.error ?? 'Failed to fetch blame data';
				// Detect "build required" errors
				if (
					errMsg.toLowerCase().includes('build') ||
					errMsg.toLowerCase().includes('database') ||
					errMsg.toLowerCase().includes('audit.db')
				) {
					setNeedsBuild(true);
				} else {
					setError(errMsg);
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch blame data');
		} finally {
			setIsLoading(false);
		}
	}, [projectPath]);

	// Fetch blame when filePath changes
	useEffect(() => {
		if (filePath) {
			fetchBlame(filePath);
		}
	}, [filePath, fetchBlame]);

	// Update filePath when initialFilePath prop changes
	useEffect(() => {
		if (initialFilePath) {
			setFilePath(initialFilePath);
			setFileSearch(initialFilePath);
		}
	}, [initialFilePath]);

	// ========================================================================
	// Build Now handler
	// ========================================================================

	const handleBuild = useCallback(async () => {
		if (!projectPath) return;
		setIsBuilding(true);
		try {
			const result = await window.maestro.vibes.build(projectPath);
			if (result.success) {
				setNeedsBuild(false);
				if (filePath) {
					fetchBlame(filePath);
				}
			} else {
				setError(result.error ?? 'Build failed');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Build failed');
		} finally {
			setIsBuilding(false);
		}
	}, [projectPath, filePath, fetchBlame]);

	// ========================================================================
	// File selector — filtered list
	// ========================================================================

	const filteredFiles = useMemo(() => {
		if (!fileSearch.trim()) return trackedFiles;
		const search = fileSearch.toLowerCase();
		return trackedFiles.filter((f) => f.toLowerCase().includes(search));
	}, [trackedFiles, fileSearch]);

	const handleSelectFile = useCallback((path: string) => {
		setFilePath(path);
		setFileSearch(path);
		setShowDropdown(false);
	}, []);

	const handleInputKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				setShowDropdown(false);
				if (fileSearch.trim()) {
					setFilePath(fileSearch.trim());
				}
			} else if (e.key === 'Escape') {
				setShowDropdown(false);
			}
		},
		[fileSearch],
	);

	// ========================================================================
	// Render
	// ========================================================================

	return (
		<div className="flex flex-col h-full">
			{/* File selector */}
			<div
				className="sticky top-0 z-10 flex flex-col gap-2 px-3 py-2"
				style={{ backgroundColor: theme.colors.bgSidebar }}
			>
				<div className="flex items-center gap-2">
					<FileCode className="w-3.5 h-3.5 shrink-0" style={{ color: theme.colors.textDim }} />
					<span className="text-[11px] font-semibold" style={{ color: theme.colors.textDim }}>
						File
					</span>
				</div>
				<div className="relative">
					<div className="flex items-center gap-2">
						<Search className="w-3.5 h-3.5 shrink-0" style={{ color: theme.colors.textDim }} />
						<input
							type="text"
							placeholder="Type to filter files..."
							value={fileSearch}
							onChange={(e) => {
								setFileSearch(e.target.value);
								setShowDropdown(true);
							}}
							onFocus={() => setShowDropdown(true)}
							onKeyDown={handleInputKeyDown}
							className="flex-1 px-2 py-1 rounded text-xs bg-transparent outline-none font-mono"
							style={{
								border: `1px solid ${theme.colors.border}`,
								color: theme.colors.textMain,
							}}
						/>
					</div>

					{/* Dropdown file list */}
					{showDropdown && filteredFiles.length > 0 && (
						<div
							className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded border z-20 scrollbar-thin"
							style={{
								backgroundColor: theme.colors.bgMain,
								borderColor: theme.colors.border,
							}}
						>
							{filteredFiles.slice(0, 50).map((file) => (
								<button
									key={file}
									onClick={() => handleSelectFile(file)}
									className="block w-full text-left px-2 py-1.5 text-[11px] font-mono truncate transition-colors hover:opacity-80"
									style={{
										color: file === filePath ? theme.colors.accent : theme.colors.textMain,
										backgroundColor: file === filePath ? theme.colors.bgActivity : 'transparent',
									}}
								>
									{file}
								</button>
							))}
							{filteredFiles.length > 50 && (
								<div
									className="px-2 py-1 text-[10px]"
									style={{ color: theme.colors.textDim }}
								>
									...and {filteredFiles.length - 50} more
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Content area */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
				{/* No file selected */}
				{!filePath && !isLoading && (
					<EmptyState
						theme={theme}
						icon={<FileCode className="w-6 h-6 opacity-40" />}
						message="Select a file to view AI blame"
						detail="Choose a file from the search above to see per-line AI attribution data."
					/>
				)}

				{/* Loading */}
				{isLoading && (
					<div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
						<Clock className="w-6 h-6 animate-pulse" style={{ color: theme.colors.textDim }} />
						<span className="text-xs" style={{ color: theme.colors.textDim }}>
							Loading blame data...
						</span>
					</div>
				)}

				{/* Build Required notice */}
				{!isLoading && needsBuild && (
					<div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
						<Database className="w-6 h-6 opacity-60" style={{ color: theme.colors.warning }} />
						<span
							className="text-sm font-medium"
							style={{ color: theme.colors.textMain }}
						>
							Build Required
						</span>
						<span
							className="text-xs max-w-xs"
							style={{ color: theme.colors.textDim }}
						>
							Annotations exist but the audit database hasn't been built yet.
							Build it to view blame data.
						</span>
						<button
							onClick={handleBuild}
							disabled={isBuilding}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-opacity hover:opacity-80 mt-1"
							style={{
								backgroundColor: theme.colors.accent,
								color: theme.colors.accentForeground,
								opacity: isBuilding ? 0.6 : 1,
							}}
						>
							<Database className="w-3.5 h-3.5" />
							{isBuilding ? 'Building...' : 'Build Now'}
						</button>
					</div>
				)}

				{/* Error */}
				{!isLoading && error && (
					<div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
						<AlertTriangle className="w-6 h-6 opacity-60" style={{ color: theme.colors.error }} />
						<span className="text-xs" style={{ color: theme.colors.error }}>
							{error}
						</span>
					</div>
				)}

				{/* No blame data for file */}
				{!isLoading && !error && !needsBuild && filePath && blameEntries.length === 0 && (
					<EmptyState
						theme={theme}
						icon={<FileCode className="w-6 h-6 opacity-40" />}
						message="No blame data for this file"
						detail="This file has no AI attribution annotations recorded."
					/>
				)}

				{/* Blame entries */}
				{!isLoading && !error && !needsBuild && blameEntries.length > 0 && (
					<div className="flex flex-col">
						{blameEntries.map((entry, idx) => (
							<BlameRow
								key={`${entry.line_start}-${entry.line_end}-${idx}`}
								theme={theme}
								entry={entry}
								gutterColor={modelColorMap.get(entry.model_name) ?? MODEL_COLORS[0]}
							/>
						))}
					</div>
				)}
			</div>

			{/* Footer */}
			{filePath && !isLoading && blameEntries.length > 0 && (
				<div
					className="flex items-center justify-between px-3 py-1.5 text-[10px] border-t"
					style={{
						borderColor: theme.colors.border,
						color: theme.colors.textDim,
						backgroundColor: theme.colors.bgSidebar,
					}}
				>
					<span>{blameEntries.length} blame entries</span>
					<span>{modelColorMap.size} model{modelColorMap.size !== 1 ? 's' : ''}</span>
				</div>
			)}
		</div>
	);
};

// ============================================================================
// Sub-components
// ============================================================================

interface EmptyStateProps {
	theme: Theme;
	icon: React.ReactNode;
	message: string;
	detail: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ theme, icon, message, detail }) => (
	<div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
		<span style={{ color: theme.colors.textDim }}>{icon}</span>
		<span
			className="text-sm font-medium"
			style={{ color: theme.colors.textMain }}
		>
			{message}
		</span>
		<span
			className="text-xs max-w-xs"
			style={{ color: theme.colors.textDim }}
		>
			{detail}
		</span>
	</div>
);

// ----------------------------------------------------------------------------
// Blame row
// ----------------------------------------------------------------------------

interface BlameRowProps {
	theme: Theme;
	entry: BlameEntry;
	gutterColor: string;
}

const BlameRow: React.FC<BlameRowProps> = ({ theme, entry, gutterColor }) => {
	const actionColor = ACTION_COLORS[entry.action] ?? ACTION_COLORS.modify;
	const lineRange =
		entry.line_start === entry.line_end
			? `L${entry.line_start}`
			: `L${entry.line_start}-${entry.line_end}`;

	return (
		<div
			className="flex items-center gap-0 border-b text-xs"
			style={{ borderColor: theme.colors.border }}
		>
			{/* Color-coded gutter */}
			<div
				className="w-1 self-stretch shrink-0"
				style={{ backgroundColor: gutterColor }}
			/>

			{/* Content */}
			<div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2">
				{/* Line range */}
				<span
					className="shrink-0 w-16 font-mono text-[11px] tabular-nums"
					style={{ color: theme.colors.accent }}
				>
					{lineRange}
				</span>

				{/* Model name + version */}
				<div className="flex items-center gap-1.5 shrink-0 min-w-0 max-w-[140px]">
					<Cpu className="w-3 h-3 shrink-0" style={{ color: gutterColor }} />
					<span
						className="truncate text-[11px] font-medium"
						style={{ color: theme.colors.textMain }}
						title={entry.model_name}
					>
						{entry.model_name}
					</span>
					{entry.model_version && (
						<span
							className="text-[10px] shrink-0"
							style={{ color: theme.colors.textDim }}
						>
							v{entry.model_version}
						</span>
					)}
				</div>

				{/* Agent type badge */}
				<span
					className="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
					style={{
						backgroundColor: theme.colors.bgActivity,
						color: theme.colors.textDim,
					}}
				>
					{formatToolName(entry.tool_name)}
				</span>

				{/* Action badge */}
				<span
					className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0"
					style={{ backgroundColor: actionColor.bg, color: actionColor.text }}
				>
					{entry.action}
				</span>

				{/* Relative timestamp */}
				<span
					className="text-[10px] shrink-0 ml-auto tabular-nums"
					style={{ color: theme.colors.textDim }}
				>
					{formatRelativeTime(entry.timestamp)}
				</span>

				{/* Session ID (shortened) */}
				{entry.session_id && (
					<span
						className="text-[10px] font-mono shrink-0 cursor-pointer hover:underline"
						style={{ color: theme.colors.accent }}
						title={`Session: ${entry.session_id}`}
					>
						{entry.session_id.slice(0, 8)}
					</span>
				)}
			</div>
		</div>
	);
};
