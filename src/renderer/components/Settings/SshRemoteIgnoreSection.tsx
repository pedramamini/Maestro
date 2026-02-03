/**
 * SshRemoteIgnoreSection - Settings section for SSH remote file indexing ignore patterns
 *
 * This component provides a UI for:
 * - Managing glob patterns to exclude from remote file indexing
 * - Enabling/disabling honor .gitignore setting
 *
 * Usage:
 * ```tsx
 * <SshRemoteIgnoreSection
 *   theme={theme}
 *   ignorePatterns={sshRemoteIgnorePatterns}
 *   onIgnorePatternsChange={setSshRemoteIgnorePatterns}
 *   honorGitignore={sshRemoteHonorGitignore}
 *   onHonorGitignoreChange={setSshRemoteHonorGitignore}
 * />
 * ```
 */

import React, { useState, useCallback } from 'react';
import { FolderX, Plus, X, Check, FileText } from 'lucide-react';
import type { Theme } from '../../types';

export interface SshRemoteIgnoreSectionProps {
	/** Theme object for styling */
	theme: Theme;
	/** Current list of ignore patterns (glob patterns) */
	ignorePatterns: string[];
	/** Callback when ignore patterns change */
	onIgnorePatternsChange: (patterns: string[]) => void;
	/** Whether to honor .gitignore files on remote hosts */
	honorGitignore: boolean;
	/** Callback when honor gitignore setting changes */
	onHonorGitignoreChange: (value: boolean) => void;
}

export function SshRemoteIgnoreSection({
	theme,
	ignorePatterns,
	onIgnorePatternsChange,
	honorGitignore,
	onHonorGitignoreChange,
}: SshRemoteIgnoreSectionProps) {
	// Local state for the new pattern input
	const [newPattern, setNewPattern] = useState('');
	const [inputError, setInputError] = useState<string | null>(null);

	// Handle adding a new pattern
	const handleAddPattern = useCallback(() => {
		const trimmedPattern = newPattern.trim();
		if (!trimmedPattern) {
			setInputError('Pattern cannot be empty');
			return;
		}
		if (ignorePatterns.includes(trimmedPattern)) {
			setInputError('Pattern already exists');
			return;
		}
		onIgnorePatternsChange([...ignorePatterns, trimmedPattern]);
		setNewPattern('');
		setInputError(null);
	}, [newPattern, ignorePatterns, onIgnorePatternsChange]);

	// Handle removing a pattern
	const handleRemovePattern = useCallback(
		(patternToRemove: string) => {
			onIgnorePatternsChange(ignorePatterns.filter((p) => p !== patternToRemove));
		},
		[ignorePatterns, onIgnorePatternsChange]
	);

	// Handle key press in input (Enter to add)
	const handleKeyPress = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleAddPattern();
			}
		},
		[handleAddPattern]
	);

	// Handle reset to defaults
	const handleResetToDefaults = useCallback(() => {
		onIgnorePatternsChange(['.git', '*cache*']);
		onHonorGitignoreChange(true);
	}, [onIgnorePatternsChange, onHonorGitignoreChange]);

	return (
		<div
			className="flex items-start gap-3 p-4 rounded-xl border relative"
			style={{ backgroundColor: theme.colors.bgMain, borderColor: theme.colors.border }}
		>
			{/* Icon */}
			<div
				className="p-2 rounded-lg flex-shrink-0"
				style={{ backgroundColor: theme.colors.accent + '20' }}
			>
				<FolderX className="w-5 h-5" style={{ color: theme.colors.accent }} />
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<p className="text-[10px] uppercase font-bold opacity-50 mb-1">File Indexing</p>
				<p className="font-semibold mb-1">Remote Ignore Patterns</p>
				<p className="text-xs opacity-60 mb-3">
					Configure glob patterns for folders to exclude when indexing remote files via SSH. These
					patterns apply to all SSH connections.
				</p>

				{/* Honor .gitignore checkbox */}
				<div className="mb-4">
					<label className="flex items-center gap-2 cursor-pointer">
						<button
							type="button"
							onClick={() => onHonorGitignoreChange(!honorGitignore)}
							className="w-5 h-5 rounded border flex items-center justify-center transition-colors"
							style={{
								borderColor: honorGitignore ? theme.colors.accent : theme.colors.border,
								backgroundColor: honorGitignore ? theme.colors.accent : 'transparent',
							}}
						>
							{honorGitignore && (
								<Check className="w-3 h-3" style={{ color: theme.colors.bgMain }} />
							)}
						</button>
						<div className="flex items-center gap-1.5">
							<FileText className="w-4 h-4" style={{ color: theme.colors.textDim }} />
							<span className="text-sm" style={{ color: theme.colors.textMain }}>
								Honor .gitignore
							</span>
						</div>
					</label>
					<p className="text-xs mt-1 ml-7" style={{ color: theme.colors.textDim }}>
						When enabled, patterns from remote .gitignore files will also be excluded from indexing.
					</p>
				</div>

				{/* Current patterns list */}
				{ignorePatterns.length > 0 && (
					<div className="space-y-1.5 mb-3">
						<p className="text-xs font-medium" style={{ color: theme.colors.textDim }}>
							Active patterns:
						</p>
						<div className="flex flex-wrap gap-2">
							{ignorePatterns.map((pattern) => (
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

				{/* Empty state */}
				{ignorePatterns.length === 0 && (
					<div
						className="p-3 rounded border border-dashed text-center mb-3"
						style={{ borderColor: theme.colors.border }}
					>
						<p className="text-xs" style={{ color: theme.colors.textDim }}>
							No ignore patterns configured. All folders will be indexed.
						</p>
					</div>
				)}

				{/* Add new pattern input */}
				<div className="flex items-center gap-2 mb-3">
					<div className="flex-1 relative">
						<input
							type="text"
							value={newPattern}
							onChange={(e) => {
								setNewPattern(e.target.value);
								setInputError(null);
							}}
							onKeyPress={handleKeyPress}
							placeholder="Enter glob pattern (e.g., node_modules, *.log)"
							className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
							style={{
								backgroundColor: theme.colors.bgActivity,
								borderColor: inputError ? theme.colors.error : theme.colors.border,
								border: '1px solid',
								color: theme.colors.textMain,
							}}
						/>
						{inputError && (
							<p
								className="absolute -bottom-4 left-0 text-[10px]"
								style={{ color: theme.colors.error }}
							>
								{inputError}
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

				{/* Reset to defaults link */}
				<button
					type="button"
					onClick={handleResetToDefaults}
					className="text-xs hover:underline"
					style={{ color: theme.colors.textDim }}
				>
					Reset to defaults (.git, *cache*)
				</button>
			</div>
		</div>
	);
}

export default SshRemoteIgnoreSection;
