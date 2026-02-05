import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { X, History, Sparkles, Loader2 } from 'lucide-react';
import type { Theme } from '../../types';
import { useLayerStack } from '../../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';

// Lazy load tab components
const UnifiedHistoryTab = lazy(() => import('./UnifiedHistoryTab').then(m => ({ default: m.UnifiedHistoryTab })));
const AIOverviewTab = lazy(() => import('./AIOverviewTab').then(m => ({ default: m.AIOverviewTab })));

interface DirectorNotesModalProps {
	theme: Theme;
	onClose: () => void;
	// File linking props passed through to history detail modal
	fileTree?: any[];
	onFileClick?: (path: string) => void;
}

type TabId = 'history' | 'overview';

export function DirectorNotesModal({
	theme,
	onClose,
	fileTree,
	onFileClick,
}: DirectorNotesModalProps) {
	const [activeTab, setActiveTab] = useState<TabId>('history');
	const [overviewReady, setOverviewReady] = useState(false);
	const [overviewGenerating, setOverviewGenerating] = useState(false);

	// Layer stack registration for Escape handling
	const { registerLayer, unregisterLayer } = useLayerStack();
	const layerIdRef = useRef<string>();

	// Register modal layer
	useEffect(() => {
		layerIdRef.current = registerLayer({
			type: 'modal',
			priority: MODAL_PRIORITIES.DIRECTOR_NOTES,
			blocksLowerLayers: true,
			capturesFocus: true,
			focusTrap: 'lenient',
			onEscape: onClose,
		});
		return () => {
			if (layerIdRef.current) unregisterLayer(layerIdRef.current);
		};
	}, [registerLayer, unregisterLayer, onClose]);

	// Handle synopsis ready callback from AIOverviewTab
	const handleSynopsisReady = useCallback(() => {
		setOverviewGenerating(false);
		setOverviewReady(true);
	}, []);

	// Start generating indicator when modal opens
	useEffect(() => {
		setOverviewGenerating(true);
	}, []);

	return createPortal(
		<div className="fixed inset-0 flex items-center justify-center z-[9999]">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/60" onClick={onClose} />

			{/* Modal */}
			<div
				className="relative w-full max-w-5xl h-[85vh] overflow-hidden rounded-lg border shadow-2xl flex flex-col"
				style={{
					backgroundColor: theme.colors.bgSidebar,
					borderColor: theme.colors.border,
				}}
			>
				{/* Header with tabs */}
				<div className="shrink-0 border-b" style={{ borderColor: theme.colors.border }}>
					<div className="flex items-center justify-between px-4">
						{/* Tab buttons */}
						<div className="flex">
							<button
								onClick={() => setActiveTab('history')}
								className={`px-4 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors`}
								style={{
									borderColor: activeTab === 'history' ? theme.colors.accent : 'transparent',
									color: activeTab === 'history' ? theme.colors.textMain : theme.colors.textDim,
								}}
							>
								<History className="w-4 h-4" />
								Unified History
							</button>
							<button
								onClick={() => overviewReady && setActiveTab('overview')}
								disabled={!overviewReady}
								className={`px-4 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors`}
								style={{
									borderColor: activeTab === 'overview' ? theme.colors.accent : 'transparent',
									color: activeTab === 'overview' ? theme.colors.textMain : theme.colors.textDim,
									opacity: overviewReady ? 1 : 0.5,
									cursor: overviewReady ? 'pointer' : 'default',
								}}
							>
								{overviewGenerating ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Sparkles className="w-4 h-4" />
								)}
								AI Overview
								{overviewGenerating && (
									<span className="text-[10px] font-normal">(generating...)</span>
								)}
							</button>
						</div>

						{/* Close button */}
						<button
							onClick={onClose}
							className="p-2 rounded hover:bg-white/10 transition-colors"
						>
							<X className="w-5 h-5" style={{ color: theme.colors.textDim }} />
						</button>
					</div>
				</div>

				{/* Tab content */}
				<div className="flex-1 overflow-hidden">
					<Suspense fallback={
						<div className="flex items-center justify-center h-full">
							<Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.colors.textDim }} />
						</div>
					}>
						<div className={`h-full ${activeTab === 'history' ? '' : 'hidden'}`}>
							<UnifiedHistoryTab
								theme={theme}
								fileTree={fileTree}
								onFileClick={onFileClick}
							/>
						</div>
						<div className={`h-full ${activeTab === 'overview' ? '' : 'hidden'}`}>
							<AIOverviewTab
								theme={theme}
								onSynopsisReady={handleSynopsisReady}
							/>
						</div>
					</Suspense>
				</div>
			</div>
		</div>,
		document.body
	);
}
