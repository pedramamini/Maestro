/**
 * VibesSettings - Settings section for VIBES metadata tracking configuration
 *
 * This component provides the UI for configuring VIBES (Verified Integrity
 * for Builds and Edits Standard) metadata capture in Maestro. It includes:
 * - Master enable/disable toggle
 * - Assurance level selector (Low / Medium / High)
 * - Tracked file extensions (tag/chip list with add/remove)
 * - Exclude patterns (glob patterns with add/remove)
 * - Per-agent enable/disable toggles
 * - Maestro orchestration toggle
 * - Auto-init toggle
 * - VibesCheck binary path
 * - Advanced: compression and blob thresholds
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
	Shield,
	Plus,
	X,
	Check,
	ChevronDown,
	ChevronRight,
	FileCode,
	FolderX,
	Bot,
	Workflow,
	Zap,
	Terminal,
	Settings2,
	CheckCircle2,
	AlertCircle,
	Loader2,
} from 'lucide-react';
import type { Theme } from '../../types';
import type { VibesAssuranceLevel } from '../../../shared/vibes-types';
import { VIBES_SETTINGS_DEFAULTS } from '../../../shared/vibes-settings';

export interface VibesSettingsProps {
	theme: Theme;
	vibesEnabled: boolean;
	setVibesEnabled: (value: boolean) => void;
	vibesAssuranceLevel: VibesAssuranceLevel;
	setVibesAssuranceLevel: (value: VibesAssuranceLevel) => void;
	vibesTrackedExtensions: string[];
	setVibesTrackedExtensions: (value: string[]) => void;
	vibesExcludePatterns: string[];
	setVibesExcludePatterns: (value: string[]) => void;
	vibesPerAgentConfig: Record<string, { enabled: boolean }>;
	setVibesPerAgentConfig: (value: Record<string, { enabled: boolean }>) => void;
	vibesMaestroOrchestrationEnabled: boolean;
	setVibesMaestroOrchestrationEnabled: (value: boolean) => void;
	vibesAutoInit: boolean;
	setVibesAutoInit: (value: boolean) => void;
	vibesCheckBinaryPath: string;
	setVibesCheckBinaryPath: (value: string) => void;
	vibesCompressReasoningThreshold: number;
	setVibesCompressReasoningThreshold: (value: number) => void;
	vibesExternalBlobThreshold: number;
	setVibesExternalBlobThreshold: (value: number) => void;
}

const ASSURANCE_LEVELS: { value: VibesAssuranceLevel; label: string; description: string }[] = [
	{ value: 'low', label: 'Low', description: 'Environment context only (~200 bytes/annotation)' },
	{ value: 'medium', label: 'Medium', description: 'Adds prompt context (~2-10 KB/annotation)' },
	{ value: 'high', label: 'High', description: 'Adds reasoning/chain-of-thought (~10-500 KB/annotation)' },
];

const AGENT_LABELS: Record<string, string> = {
	'claude-code': 'Claude Code',
	'codex': 'Codex',
};

export function VibesSettings({
	theme,
	vibesEnabled,
	setVibesEnabled,
	vibesAssuranceLevel,
	setVibesAssuranceLevel,
	vibesTrackedExtensions,
	setVibesTrackedExtensions,
	vibesExcludePatterns,
	setVibesExcludePatterns,
	vibesPerAgentConfig,
	setVibesPerAgentConfig,
	vibesAutoInit,
	setVibesAutoInit,
	vibesMaestroOrchestrationEnabled,
	setVibesMaestroOrchestrationEnabled,
	vibesCheckBinaryPath,
	setVibesCheckBinaryPath,
	vibesCompressReasoningThreshold,
	setVibesCompressReasoningThreshold,
	vibesExternalBlobThreshold,
	setVibesExternalBlobThreshold,
}: VibesSettingsProps) {
	const [newExtension, setNewExtension] = useState('');
	const [extensionError, setExtensionError] = useState<string | null>(null);
	const [newPattern, setNewPattern] = useState('');
	const [patternError, setPatternError] = useState<string | null>(null);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [binaryDetectStatus, setBinaryDetectStatus] = useState<'idle' | 'checking' | 'found' | 'not-found'>('idle');
	const [binaryDetectedPath, setBinaryDetectedPath] = useState<string | null>(null);
	const [binaryVersion, setBinaryVersion] = useState<string | null>(null);
	const prevBinaryPath = useRef(vibesCheckBinaryPath);

	// Detect binary when VIBES is enabled or binary path changes
	useEffect(() => {
		if (!vibesEnabled) {
			setBinaryDetectStatus('idle');
			return;
		}

		// Clear cache if path changed
		const pathChanged = prevBinaryPath.current !== vibesCheckBinaryPath;
		prevBinaryPath.current = vibesCheckBinaryPath;

		let cancelled = false;
		setBinaryDetectStatus('checking');

		(async () => {
			try {
				if (pathChanged && window.maestro?.vibes?.clearBinaryCache) {
					await window.maestro.vibes.clearBinaryCache();
				}
				const result = await window.maestro.vibes.findBinary(
					vibesCheckBinaryPath || undefined,
				);
				if (!cancelled) {
					if (result.path) {
						setBinaryDetectStatus('found');
						setBinaryDetectedPath(result.path);
						setBinaryVersion(result.version);
					} else {
						setBinaryDetectStatus('not-found');
						setBinaryDetectedPath(null);
						setBinaryVersion(null);
					}
				}
			} catch {
				if (!cancelled) {
					setBinaryDetectStatus('not-found');
					setBinaryDetectedPath(null);
					setBinaryVersion(null);
				}
			}
		})();

		return () => { cancelled = true; };
	}, [vibesEnabled, vibesCheckBinaryPath]);

	// --- Extension handlers ---
	const handleAddExtension = useCallback(() => {
		let ext = newExtension.trim();
		if (!ext) {
			setExtensionError('Extension cannot be empty');
			return;
		}
		if (!ext.startsWith('.')) {
			ext = '.' + ext;
		}
		if (vibesTrackedExtensions.includes(ext)) {
			setExtensionError('Extension already tracked');
			return;
		}
		setVibesTrackedExtensions([...vibesTrackedExtensions, ext]);
		setNewExtension('');
		setExtensionError(null);
	}, [newExtension, vibesTrackedExtensions, setVibesTrackedExtensions]);

	const handleRemoveExtension = useCallback(
		(ext: string) => {
			setVibesTrackedExtensions(vibesTrackedExtensions.filter((e) => e !== ext));
		},
		[vibesTrackedExtensions, setVibesTrackedExtensions]
	);

	const handleExtensionKeyPress = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleAddExtension();
			}
		},
		[handleAddExtension]
	);

	// --- Pattern handlers ---
	const handleAddPattern = useCallback(() => {
		const trimmed = newPattern.trim();
		if (!trimmed) {
			setPatternError('Pattern cannot be empty');
			return;
		}
		if (vibesExcludePatterns.includes(trimmed)) {
			setPatternError('Pattern already exists');
			return;
		}
		setVibesExcludePatterns([...vibesExcludePatterns, trimmed]);
		setNewPattern('');
		setPatternError(null);
	}, [newPattern, vibesExcludePatterns, setVibesExcludePatterns]);

	const handleRemovePattern = useCallback(
		(pattern: string) => {
			setVibesExcludePatterns(vibesExcludePatterns.filter((p) => p !== pattern));
		},
		[vibesExcludePatterns, setVibesExcludePatterns]
	);

	const handlePatternKeyPress = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleAddPattern();
			}
		},
		[handleAddPattern]
	);

	// --- Agent toggle handler ---
	const handleAgentToggle = useCallback(
		(agentId: string) => {
			const current = vibesPerAgentConfig[agentId]?.enabled ?? true;
			setVibesPerAgentConfig({
				...vibesPerAgentConfig,
				[agentId]: { enabled: !current },
			});
		},
		[vibesPerAgentConfig, setVibesPerAgentConfig]
	);

	// --- Reset handlers ---
	const handleResetExtensions = useCallback(() => {
		setVibesTrackedExtensions(VIBES_SETTINGS_DEFAULTS.vibesTrackedExtensions);
	}, [setVibesTrackedExtensions]);

	const handleResetPatterns = useCallback(() => {
		setVibesExcludePatterns(VIBES_SETTINGS_DEFAULTS.vibesExcludePatterns);
	}, [setVibesExcludePatterns]);

	return (
		<div className="space-y-5">
			{/* Master Toggle */}
			<div
				className="flex items-start gap-3 p-4 rounded-xl border relative"
				style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
			>
				<div
					className="p-2 rounded-lg flex-shrink-0"
					style={{ backgroundColor: theme.colors.accent + '20' }}
				>
					<Shield className="w-5 h-5" style={{ color: theme.colors.accent }} />
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-[10px] uppercase font-bold opacity-50 mb-1">VIBES Metadata</p>
					<div
						className="flex items-center justify-between cursor-pointer"
						onClick={() => setVibesEnabled(!vibesEnabled)}
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								setVibesEnabled(!vibesEnabled);
							}
						}}
					>
						<div className="flex-1 pr-3">
							<p className="font-semibold" style={{ color: theme.colors.textMain }}>
								Enable VIBES Tracking
							</p>
							<p className="text-xs opacity-60 mt-0.5" style={{ color: theme.colors.textDim }}>
								Verified Integrity for Builds and Edits Standard — captures AI code
								provenance metadata in .ai-audit/ directories.
							</p>
						</div>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setVibesEnabled(!vibesEnabled);
							}}
							className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
							style={{
								backgroundColor: vibesEnabled ? theme.colors.accent : theme.colors.bgActivity,
							}}
							role="switch"
							aria-checked={vibesEnabled}
						>
							<span
								className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
									vibesEnabled ? 'translate-x-5' : 'translate-x-0.5'
								}`}
							/>
						</button>
					</div>
				</div>
			</div>

			{vibesEnabled && (
				<>
					{/* Assurance Level Selector */}
					<div
						className="flex items-start gap-3 p-4 rounded-xl border relative"
						style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
					>
						<div
							className="p-2 rounded-lg flex-shrink-0"
							style={{ backgroundColor: theme.colors.accent + '20' }}
						>
							<Settings2 className="w-5 h-5" style={{ color: theme.colors.accent }} />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[10px] uppercase font-bold opacity-50 mb-1">Assurance Level</p>
							<p className="font-semibold mb-2" style={{ color: theme.colors.textMain }}>
								Metadata Detail Level
							</p>
							<div className="space-y-2">
								{ASSURANCE_LEVELS.map((level) => (
									<label
										key={level.value}
										className="flex items-center gap-3 p-2 rounded cursor-pointer transition-colors"
										style={{
											backgroundColor:
												vibesAssuranceLevel === level.value
													? theme.colors.accent + '15'
													: 'transparent',
											border: '1px solid',
											borderColor:
												vibesAssuranceLevel === level.value
													? theme.colors.accent + '40'
													: theme.colors.border,
										}}
									>
										<button
											type="button"
											onClick={() => setVibesAssuranceLevel(level.value)}
											className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
											style={{
												borderColor:
													vibesAssuranceLevel === level.value
														? theme.colors.accent
														: theme.colors.border,
											}}
										>
											{vibesAssuranceLevel === level.value && (
												<div
													className="w-2 h-2 rounded-full"
													style={{ backgroundColor: theme.colors.accent }}
												/>
											)}
										</button>
										<div className="flex-1">
											<span
												className="text-sm font-medium"
												style={{ color: theme.colors.textMain }}
											>
												{level.label}
											</span>
											<p
												className="text-xs mt-0.5"
												style={{ color: theme.colors.textDim }}
											>
												{level.description}
											</p>
										</div>
									</label>
								))}
							</div>
						</div>
					</div>

					{/* Tracked File Extensions */}
					<div
						className="flex items-start gap-3 p-4 rounded-xl border relative"
						style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
					>
						<div
							className="p-2 rounded-lg flex-shrink-0"
							style={{ backgroundColor: theme.colors.accent + '20' }}
						>
							<FileCode className="w-5 h-5" style={{ color: theme.colors.accent }} />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[10px] uppercase font-bold opacity-50 mb-1">File Tracking</p>
							<p className="font-semibold mb-1" style={{ color: theme.colors.textMain }}>
								Tracked Extensions
							</p>
							<p className="text-xs opacity-60 mb-3" style={{ color: theme.colors.textDim }}>
								File extensions that will be tracked for VIBES annotations.
							</p>

							{vibesTrackedExtensions.length > 0 && (
								<div className="space-y-1.5 mb-3">
									<p className="text-xs font-medium" style={{ color: theme.colors.textDim }}>
										Active extensions:
									</p>
									<div className="flex flex-wrap gap-2">
										{vibesTrackedExtensions.map((ext) => (
											<div
												key={ext}
												className="flex items-center gap-1 px-2 py-1 rounded text-sm font-mono"
												style={{
													backgroundColor: theme.colors.bgActivity,
													borderColor: theme.colors.border,
													border: '1px solid',
												}}
											>
												<span style={{ color: theme.colors.textMain }}>{ext}</span>
												<button
													type="button"
													onClick={() => handleRemoveExtension(ext)}
													className="p-0.5 rounded hover:bg-white/10 transition-colors ml-1"
													style={{ color: theme.colors.error }}
													title="Remove extension"
												>
													<X className="w-3 h-3" />
												</button>
											</div>
										))}
									</div>
								</div>
							)}

							<div className="flex items-center gap-2 mb-3">
								<div className="flex-1 relative">
									<input
										type="text"
										value={newExtension}
										onChange={(e) => {
											setNewExtension(e.target.value);
											setExtensionError(null);
										}}
										onKeyPress={handleExtensionKeyPress}
										placeholder="e.g. .vue, .svelte"
										className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
										style={{
											backgroundColor: theme.colors.bgActivity,
											borderColor: extensionError ? theme.colors.error : theme.colors.border,
											border: '1px solid',
											color: theme.colors.textMain,
										}}
									/>
									{extensionError && (
										<p
											className="absolute -bottom-4 left-0 text-[10px]"
											style={{ color: theme.colors.error }}
										>
											{extensionError}
										</p>
									)}
								</div>
								<button
									type="button"
									onClick={handleAddExtension}
									disabled={!newExtension.trim()}
									className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
									style={{
										backgroundColor: theme.colors.accent,
										color: theme.colors.bgMain,
									}}
								>
									<Plus className="w-4 h-4" />
									Add
								</button>
							</div>

							<button
								type="button"
								onClick={handleResetExtensions}
								className="text-xs hover:underline"
								style={{ color: theme.colors.textDim }}
							>
								Reset to defaults
							</button>
						</div>
					</div>

					{/* Exclude Patterns */}
					<div
						className="flex items-start gap-3 p-4 rounded-xl border relative"
						style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
					>
						<div
							className="p-2 rounded-lg flex-shrink-0"
							style={{ backgroundColor: theme.colors.accent + '20' }}
						>
							<FolderX className="w-5 h-5" style={{ color: theme.colors.accent }} />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[10px] uppercase font-bold opacity-50 mb-1">Exclusions</p>
							<p className="font-semibold mb-1" style={{ color: theme.colors.textMain }}>
								Exclude Patterns
							</p>
							<p className="text-xs opacity-60 mb-3" style={{ color: theme.colors.textDim }}>
								Glob patterns for directories and files to exclude from VIBES tracking.
							</p>

							{vibesExcludePatterns.length > 0 && (
								<div className="space-y-1.5 mb-3">
									<p className="text-xs font-medium" style={{ color: theme.colors.textDim }}>
										Active patterns:
									</p>
									<div className="flex flex-wrap gap-2">
										{vibesExcludePatterns.map((pattern) => (
											<div
												key={pattern}
												className="flex items-center gap-1 px-2 py-1 rounded text-sm font-mono"
												style={{
													backgroundColor: theme.colors.bgActivity,
													borderColor: theme.colors.border,
													border: '1px solid',
												}}
											>
												<span style={{ color: theme.colors.textMain }}>{pattern}</span>
												<button
													type="button"
													onClick={() => handleRemovePattern(pattern)}
													className="p-0.5 rounded hover:bg-white/10 transition-colors ml-1"
													style={{ color: theme.colors.error }}
													title="Remove pattern"
												>
													<X className="w-3 h-3" />
												</button>
											</div>
										))}
									</div>
								</div>
							)}

							{vibesExcludePatterns.length === 0 && (
								<div
									className="p-3 rounded border border-dashed text-center mb-3"
									style={{ borderColor: theme.colors.border }}
								>
									<p className="text-xs" style={{ color: theme.colors.textDim }}>
										No exclude patterns configured. All directories will be tracked.
									</p>
								</div>
							)}

							<div className="flex items-center gap-2 mb-3">
								<div className="flex-1 relative">
									<input
										type="text"
										value={newPattern}
										onChange={(e) => {
											setNewPattern(e.target.value);
											setPatternError(null);
										}}
										onKeyPress={handlePatternKeyPress}
										placeholder="e.g. **/vendor/**, *.min.js"
										className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
										style={{
											backgroundColor: theme.colors.bgActivity,
											borderColor: patternError ? theme.colors.error : theme.colors.border,
											border: '1px solid',
											color: theme.colors.textMain,
										}}
									/>
									{patternError && (
										<p
											className="absolute -bottom-4 left-0 text-[10px]"
											style={{ color: theme.colors.error }}
										>
											{patternError}
										</p>
									)}
								</div>
								<button
									type="button"
									onClick={handleAddPattern}
									disabled={!newPattern.trim()}
									className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
									style={{
										backgroundColor: theme.colors.accent,
										color: theme.colors.bgMain,
									}}
								>
									<Plus className="w-4 h-4" />
									Add
								</button>
							</div>

							<button
								type="button"
								onClick={handleResetPatterns}
								className="text-xs hover:underline"
								style={{ color: theme.colors.textDim }}
							>
								Reset to defaults
							</button>
						</div>
					</div>

					{/* Per-Agent Toggles */}
					<div
						className="flex items-start gap-3 p-4 rounded-xl border relative"
						style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
					>
						<div
							className="p-2 rounded-lg flex-shrink-0"
							style={{ backgroundColor: theme.colors.accent + '20' }}
						>
							<Bot className="w-5 h-5" style={{ color: theme.colors.accent }} />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[10px] uppercase font-bold opacity-50 mb-1">Agent Configuration</p>
							<p className="font-semibold mb-1" style={{ color: theme.colors.textMain }}>
								Per-Agent VIBES Tracking
							</p>
							<p className="text-xs opacity-60 mb-3" style={{ color: theme.colors.textDim }}>
								Enable or disable VIBES metadata capture for individual agents.
							</p>

							<div className="space-y-2">
								{Object.entries(vibesPerAgentConfig).map(([agentId, config]) => (
									<label
										key={agentId}
										className="flex items-center gap-2 cursor-pointer"
									>
										<button
											type="button"
											onClick={() => handleAgentToggle(agentId)}
											className="w-5 h-5 rounded border flex items-center justify-center transition-colors"
											style={{
												borderColor: config.enabled
													? theme.colors.accent
													: theme.colors.border,
												backgroundColor: config.enabled
													? theme.colors.accent
													: 'transparent',
											}}
										>
											{config.enabled && (
												<Check
													className="w-3 h-3"
													style={{ color: theme.colors.bgMain }}
												/>
											)}
										</button>
										<span
											className="text-sm"
											style={{ color: theme.colors.textMain }}
										>
											{AGENT_LABELS[agentId] || agentId}
										</span>
									</label>
								))}
							</div>
						</div>
					</div>

					{/* Maestro Orchestration Toggle */}
					<div
						className="flex items-start gap-3 p-4 rounded-xl border relative"
						style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
					>
						<div
							className="p-2 rounded-lg flex-shrink-0"
							style={{ backgroundColor: theme.colors.accent + '20' }}
						>
							<Workflow className="w-5 h-5" style={{ color: theme.colors.accent }} />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[10px] uppercase font-bold opacity-50 mb-1">Orchestration</p>
							<div
								className="flex items-center justify-between cursor-pointer"
								onClick={() => setVibesMaestroOrchestrationEnabled(!vibesMaestroOrchestrationEnabled)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										setVibesMaestroOrchestrationEnabled(!vibesMaestroOrchestrationEnabled);
									}
								}}
							>
								<div className="flex-1 pr-3">
									<p className="font-semibold" style={{ color: theme.colors.textMain }}>
										Maestro Orchestration Data
									</p>
									<p
										className="text-xs opacity-60 mt-0.5"
										style={{ color: theme.colors.textDim }}
									>
										Capture Maestro-level session management and batch run metadata.
									</p>
								</div>
								<button
									onClick={(e) => {
										e.stopPropagation();
										setVibesMaestroOrchestrationEnabled(!vibesMaestroOrchestrationEnabled);
									}}
									className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
									style={{
										backgroundColor: vibesMaestroOrchestrationEnabled
											? theme.colors.accent
											: theme.colors.bgActivity,
									}}
									role="switch"
									aria-checked={vibesMaestroOrchestrationEnabled}
								>
									<span
										className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
											vibesMaestroOrchestrationEnabled ? 'translate-x-5' : 'translate-x-0.5'
										}`}
									/>
								</button>
							</div>
						</div>
					</div>

					{/* Auto-Init Toggle */}
					<div
						className="flex items-start gap-3 p-4 rounded-xl border relative"
						style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
					>
						<div
							className="p-2 rounded-lg flex-shrink-0"
							style={{ backgroundColor: theme.colors.accent + '20' }}
						>
							<Zap className="w-5 h-5" style={{ color: theme.colors.accent }} />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[10px] uppercase font-bold opacity-50 mb-1">Initialization</p>
							<div
								className="flex items-center justify-between cursor-pointer"
								onClick={() => setVibesAutoInit(!vibesAutoInit)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										setVibesAutoInit(!vibesAutoInit);
									}
								}}
							>
								<div className="flex-1 pr-3">
									<p className="font-semibold" style={{ color: theme.colors.textMain }}>
										Auto-Initialize Projects
									</p>
									<p
										className="text-xs opacity-60 mt-0.5"
										style={{ color: theme.colors.textDim }}
									>
										Automatically run <code className="font-mono">vibescheck init</code> when
										opening projects without an .ai-audit/ directory.
									</p>
								</div>
								<button
									onClick={(e) => {
										e.stopPropagation();
										setVibesAutoInit(!vibesAutoInit);
									}}
									className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
									style={{
										backgroundColor: vibesAutoInit
											? theme.colors.accent
											: theme.colors.bgActivity,
									}}
									role="switch"
									aria-checked={vibesAutoInit}
								>
									<span
										className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
											vibesAutoInit ? 'translate-x-5' : 'translate-x-0.5'
										}`}
									/>
								</button>
							</div>
						</div>
					</div>

					{/* Binary Path */}
					<div
						className="flex items-start gap-3 p-4 rounded-xl border relative"
						style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
					>
						<div
							className="p-2 rounded-lg flex-shrink-0"
							style={{ backgroundColor: theme.colors.accent + '20' }}
						>
							<Terminal className="w-5 h-5" style={{ color: theme.colors.accent }} />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[10px] uppercase font-bold opacity-50 mb-1">Binary</p>
							<p className="font-semibold mb-1" style={{ color: theme.colors.textMain }}>
								VibesCheck Binary Path
							</p>
							<p className="text-xs opacity-60 mb-3" style={{ color: theme.colors.textDim }}>
								Path to the <code className="font-mono">vibescheck</code> binary. Leave
								empty to auto-detect from $PATH.
							</p>
							<div className="flex items-center gap-2">
								<input
									type="text"
									value={vibesCheckBinaryPath}
									onChange={(e) => setVibesCheckBinaryPath(e.target.value)}
									placeholder="Auto-detect from $PATH"
									className="flex-1 px-3 py-2 rounded text-sm font-mono outline-none"
									style={{
										backgroundColor: theme.colors.bgActivity,
										borderColor: theme.colors.border,
										border: '1px solid',
										color: theme.colors.textMain,
									}}
								/>
								{!vibesCheckBinaryPath && (
									<span
										className="text-xs px-2 py-1 rounded"
										style={{
											backgroundColor: theme.colors.success + '20',
											color: theme.colors.success,
										}}
									>
										Auto
									</span>
								)}
							</div>

							{/* Binary Detection Status */}
							<div className="mt-3">
								{binaryDetectStatus === 'checking' && (
									<div className="flex items-center gap-2 text-xs" data-testid="binary-status-checking">
										<Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: theme.colors.textDim }} />
										<span style={{ color: theme.colors.textDim }}>Detecting vibescheck binary...</span>
									</div>
								)}
								{binaryDetectStatus === 'found' && (
									<div className="flex flex-col gap-1" data-testid="binary-status-found">
										<div className="flex items-center gap-2 text-xs">
											<CheckCircle2 className="w-3.5 h-3.5" style={{ color: theme.colors.success }} />
											<span style={{ color: theme.colors.success }}>
												vibescheck found
												{binaryVersion && (
													<span className="font-mono ml-1">({binaryVersion})</span>
												)}
											</span>
										</div>
										{binaryDetectedPath && (
											<span
												className="text-[10px] font-mono ml-5"
												style={{ color: theme.colors.textDim }}
											>
												{binaryDetectedPath}
											</span>
										)}
									</div>
								)}
								{binaryDetectStatus === 'not-found' && (
									<div className="flex flex-col gap-1.5" data-testid="binary-status-not-found">
										<div className="flex items-center gap-2 text-xs">
											<AlertCircle className="w-3.5 h-3.5" style={{ color: theme.colors.error }} />
											<span style={{ color: theme.colors.error }}>vibescheck not found</span>
										</div>
										<div
											className="text-xs ml-5 p-2 rounded"
											style={{
												backgroundColor: theme.colors.bgActivity,
												color: theme.colors.textDim,
											}}
										>
											<p className="mb-1">Install vibescheck using one of these methods:</p>
											<p className="font-mono text-[11px]" style={{ color: theme.colors.textMain }}>
												cargo install vibescheck
											</p>
											<p
												className="text-[10px] mt-1"
												style={{ color: theme.colors.textDim }}
											>
												Or set a manual path override above.
											</p>
										</div>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Advanced Section (Collapsible) */}
					<div
						className="flex items-start gap-3 p-4 rounded-xl border relative"
						style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
					>
						<div
							className="p-2 rounded-lg flex-shrink-0"
							style={{ backgroundColor: theme.colors.accent + '20' }}
						>
							<Settings2 className="w-5 h-5" style={{ color: theme.colors.accent }} />
						</div>
						<div className="flex-1 min-w-0">
							<button
								type="button"
								className="flex items-center gap-2 w-full text-left"
								onClick={() => setAdvancedOpen(!advancedOpen)}
							>
								{advancedOpen ? (
									<ChevronDown className="w-4 h-4" style={{ color: theme.colors.textDim }} />
								) : (
									<ChevronRight className="w-4 h-4" style={{ color: theme.colors.textDim }} />
								)}
								<p className="text-[10px] uppercase font-bold opacity-50">Advanced</p>
							</button>

							{advancedOpen && (
								<div className="mt-3 space-y-4">
									{/* Compression Threshold */}
									<div>
										<label
											className="block text-sm font-medium mb-1"
											style={{ color: theme.colors.textMain }}
										>
											Compression Threshold (bytes)
										</label>
										<p
											className="text-xs mb-2"
											style={{ color: theme.colors.textDim }}
										>
											Reasoning text above this size will be compressed.
										</p>
										<input
											type="number"
											value={vibesCompressReasoningThreshold}
											onChange={(e) => {
												const val = parseInt(e.target.value, 10);
												if (!isNaN(val) && val >= 0) {
													setVibesCompressReasoningThreshold(val);
												}
											}}
											min={0}
											className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
											style={{
												backgroundColor: theme.colors.bgActivity,
												borderColor: theme.colors.border,
												border: '1px solid',
												color: theme.colors.textMain,
											}}
										/>
									</div>

									{/* External Blob Threshold */}
									<div>
										<label
											className="block text-sm font-medium mb-1"
											style={{ color: theme.colors.textMain }}
										>
											External Blob Threshold (bytes)
										</label>
										<p
											className="text-xs mb-2"
											style={{ color: theme.colors.textDim }}
										>
											Data above this size will be stored as external blobs.
										</p>
										<input
											type="number"
											value={vibesExternalBlobThreshold}
											onChange={(e) => {
												const val = parseInt(e.target.value, 10);
												if (!isNaN(val) && val >= 0) {
													setVibesExternalBlobThreshold(val);
												}
											}}
											min={0}
											className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
											style={{
												backgroundColor: theme.colors.bgActivity,
												borderColor: theme.colors.border,
												border: '1px solid',
												color: theme.colors.textMain,
											}}
										/>
									</div>
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}

export default VibesSettings;
