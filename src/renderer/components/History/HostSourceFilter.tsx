import { memo, useMemo, useRef, useState, useCallback } from 'react';
import { ChevronUp, Server } from 'lucide-react';
import type { Theme } from '../../types';
import { useClickOutside } from '../../hooks/ui/useClickOutside';

/** Synthetic key used to represent entries with no `hostname` (i.e. local). */
export const LOCAL_HOST_KEY = '__local__';

export interface HostSourceFilterProps {
	/**
	 * Counts of entries by host key. Use `LOCAL_HOST_KEY` for entries
	 * without a `hostname`. Order is preserved when rendering — pass an
	 * already-sorted Map for stable display.
	 */
	hostCounts: Map<string, number>;
	/** Currently selected host key, or `null` for "all sources". */
	selectedHost: string | null;
	onSelect: (host: string | null) => void;
	theme: Theme;
}

function labelForHost(host: string): string {
	return host === LOCAL_HOST_KEY ? 'Local' : host;
}

/**
 * Source picker rendered at the bottom of the History panel. Defaults
 * to "All Sources"; click to expand a popover anchored above the
 * button. Only rendered by the parent when more than one host is
 * present in the loaded window — see `HistoryPanel`.
 */
export const HostSourceFilter = memo(function HostSourceFilter({
	hostCounts,
	selectedHost,
	onSelect,
	theme,
}: HostSourceFilterProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useClickOutside(containerRef, () => setOpen(false), open);

	const handleSelect = useCallback(
		(host: string | null) => {
			onSelect(host);
			setOpen(false);
		},
		[onSelect]
	);

	// Trigger label: host name with parenthesized count when a specific
	// host is selected; just "All Sources" (no count) when not. Counts
	// reflect the renderer's active lookback window because they come
	// from the server-side aggregate keyed by lookback.
	const triggerLabel = useMemo(() => {
		if (!selectedHost) return 'All Sources';
		const count = hostCounts.get(selectedHost) ?? 0;
		return `${labelForHost(selectedHost)} (${count})`;
	}, [selectedHost, hostCounts]);

	return (
		<div ref={containerRef} className="relative">
			{open && (
				<div
					className="absolute left-0 right-0 bottom-full mb-1 rounded border shadow-lg overflow-hidden z-30"
					style={{
						backgroundColor: theme.colors.bgSidebar,
						borderColor: theme.colors.border,
					}}
				>
					<button
						className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-white/10 transition-colors"
						style={{
							color: selectedHost === null ? theme.colors.accent : theme.colors.textMain,
						}}
						onClick={() => handleSelect(null)}
					>
						<Server className="w-3 h-3 flex-shrink-0" />
						<span className="font-mono">All Sources</span>
					</button>
					<div className="h-px" style={{ backgroundColor: theme.colors.border }} />
					{[...hostCounts.entries()].map(([host, count]) => {
						const isSelected = host === selectedHost;
						return (
							<button
								key={host}
								className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-white/10 transition-colors"
								style={{
									color: isSelected ? theme.colors.accent : theme.colors.textMain,
								}}
								onClick={() => handleSelect(host)}
							>
								<Server className="w-3 h-3 flex-shrink-0" />
								<span className="font-mono truncate min-w-0">
									{labelForHost(host)} ({count})
								</span>
							</button>
						);
					})}
				</div>
			)}

			<button
				onClick={() => setOpen((v) => !v)}
				className="w-full px-3 py-1.5 rounded border flex items-center justify-between text-xs transition-colors hover:bg-white/5"
				style={{
					backgroundColor: theme.colors.bgActivity,
					borderColor: open ? theme.colors.accent : theme.colors.border,
					color: selectedHost ? theme.colors.accent : theme.colors.textMain,
				}}
				title="Filter by host source"
			>
				<span className="flex items-center gap-2 min-w-0">
					<Server className="w-3 h-3 flex-shrink-0" />
					<span className="font-mono truncate">{triggerLabel}</span>
				</span>
				<ChevronUp
					className="w-3 h-3 flex-shrink-0 transition-transform"
					style={{
						transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
						color: theme.colors.textDim,
					}}
				/>
			</button>
		</div>
	);
});
