/**
 * usePipelineLayout — Layout persistence and restoration for the pipeline editor.
 *
 * Handles debounced layout saving (node positions + viewport) and one-time
 * layout restoration on mount by merging saved positions with live graph data.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ReactFlowInstance, Viewport } from 'reactflow';
import type {
	AgentNodeData,
	CuePipelineState,
	CueGraphSession,
	PipelineLayoutState,
} from '../../../shared/cue-pipeline-types';
import { graphSessionsToPipelines } from '../../components/CuePipelineEditor/utils/yamlToPipeline';
import { mergePipelinesWithSavedLayout } from '../../components/CuePipelineEditor/utils/pipelineLayout';
import { captureException } from '../../utils/sentry';
import { cueService } from '../../services/cue';

import type { CuePipelineSessionInfo as SessionInfo } from '../../../shared/cue-pipeline-types';

export interface UsePipelineLayoutParams {
	reactFlowInstance: ReactFlowInstance;
	graphSessions: CueGraphSession[];
	sessions: SessionInfo[];
	pipelineState: CuePipelineState;
	setPipelineState: React.Dispatch<React.SetStateAction<CuePipelineState>>;
	savedStateRef: React.MutableRefObject<string>;
	/**
	 * Set of project roots that the current saved state corresponds to. Seeded
	 * from the initial loaded pipelines so handleSave knows which roots to
	 * clear if their last pipeline disappears, even when the agent that owned
	 * those pipelines was renamed/removed since the load.
	 */
	lastWrittenRootsRef: React.MutableRefObject<Set<string>>;
	setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UsePipelineLayoutReturn {
	persistLayout: () => void;
	/**
	 * Pending saved viewport from disk, captured during initial restore.
	 * CuePipelineEditor reads this once nodes have been measured and either
	 * applies it via `setViewport` or falls back to `fitView`. Consumed (set
	 * back to null) after the first read to prevent re-application.
	 *
	 * Owning the viewport-apply step in the component (rather than scheduling
	 * `setViewport` on a timeout here) eliminates the race against ReactFlow's
	 * node measurement — the previous implementation could set or fit the
	 * viewport before nodes were measured, leaving the canvas appearing empty
	 * on first open.
	 */
	pendingSavedViewportRef: React.MutableRefObject<Viewport | null>;
}

export function usePipelineLayout({
	reactFlowInstance,
	graphSessions,
	sessions,
	pipelineState,
	setPipelineState,
	savedStateRef,
	lastWrittenRootsRef,
	setIsDirty,
}: UsePipelineLayoutParams): UsePipelineLayoutReturn {
	const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hasRestoredLayoutRef = useRef(false);
	const latestRestoreIdRef = useRef(0);
	const pendingSavedViewportRef = useRef<Viewport | null>(null);

	// Keep a ref to current pipeline state for layout persistence (avoids unstable callback)
	const pipelineStateRef = useRef(pipelineState);
	pipelineStateRef.current = pipelineState;

	// Debounced layout persistence (positions + viewport + written roots)
	const persistLayout = useCallback(() => {
		if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
		layoutSaveTimerRef.current = setTimeout(() => {
			const viewport = reactFlowInstance.getViewport();
			const state = pipelineStateRef.current;
			const layout: PipelineLayoutState = {
				pipelines: state.pipelines,
				selectedPipelineId: state.selectedPipelineId,
				viewport,
				// Persist the written-roots snapshot so the next mount can
				// reseed lastWrittenRootsRef even if the originating agent has
				// been renamed/removed (sessionId/Name lookup would miss the
				// root in that case, leaving stale YAML uncleared).
				writtenRoots: [...lastWrittenRootsRef.current],
			};
			cueService
				.savePipelineLayout(layout as unknown as Record<string, unknown>)
				.catch((err: unknown) => {
					captureException(err, { extra: { operation: 'savePipelineLayout' } });
				});
		}, 500);
	}, [reactFlowInstance, lastWrittenRootsRef]);

	// Clean up debounce timer on unmount
	useEffect(() => {
		return () => {
			if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
		};
	}, []);

	// Load pipelines once on mount from saved layout merged with live graph data.
	// The pipeline editor is the primary editor — we don't re-sync from disk
	// while the user is working. Save writes back to disk.
	//
	// Uses a request-id guard so that if props change during an in-flight load,
	// only the latest request applies its result.
	useEffect(() => {
		if (hasRestoredLayoutRef.current) return;
		if (!graphSessions || graphSessions.length === 0) return;

		const reqId = ++latestRestoreIdRef.current;

		const loadLayout = async () => {
			const livePipelines = graphSessionsToPipelines(graphSessions, sessions);
			if (livePipelines.length === 0) return;

			let savedLayout: PipelineLayoutState | null = null;
			try {
				savedLayout = (await cueService.loadPipelineLayout()) as PipelineLayoutState | null;
			} catch (err: unknown) {
				// loadPipelineLayout may fail if no layout has been saved yet — that's expected.
				// Report anything else to Sentry.
				const message = err instanceof Error ? err.message : String(err);
				if (!message.includes('no saved layout') && !message.includes('ENOENT')) {
					captureException(err, { extra: { operation: 'loadPipelineLayout' } });
				}
			}

			// Guard: if a newer load started or a previous one already completed, bail out
			if (reqId !== latestRestoreIdRef.current || hasRestoredLayoutRef.current) return;

			let pipelinesForRoots: CuePipelineState['pipelines'];
			if (savedLayout && savedLayout.pipelines) {
				const merged = mergePipelinesWithSavedLayout(livePipelines, savedLayout);

				setPipelineState(merged);
				savedStateRef.current = JSON.stringify(merged.pipelines);
				pipelinesForRoots = merged.pipelines;

				// Stash the saved viewport for the editor to apply once ReactFlow
				// has measured the restored nodes. Applying it here on a timeout
				// raced against `fitView` and — more importantly — against node
				// measurement, which caused the initial canvas to appear empty.
				if (savedLayout.viewport) {
					pendingSavedViewportRef.current = savedLayout.viewport;
				}
			} else {
				setPipelineState({ pipelines: livePipelines, selectedPipelineId: livePipelines[0].id });
				savedStateRef.current = JSON.stringify(livePipelines);
				pipelinesForRoots = livePipelines;
			}

			// Seed lastWrittenRootsRef from two sources, unioned:
			//   1. The persisted writtenRoots set from the previous save —
			//      authoritative even when the originating agent has since been
			//      renamed or deleted (the session lookup below would miss it
			//      in that case, leaving stale YAML at that root uncleared).
			//   2. Session-resolved roots from the just-loaded pipelines —
			//      catches any roots that aren't in writtenRoots yet (e.g.
			//      first-ever editor open with pre-existing pipelines, or
			//      writtenRoots was cleared/missing on disk).
			const loadedRoots = new Set<string>();
			if (savedLayout?.writtenRoots && Array.isArray(savedLayout.writtenRoots)) {
				for (const root of savedLayout.writtenRoots) {
					if (typeof root === 'string' && root.length > 0) {
						loadedRoots.add(root);
					}
				}
			}
			const sessionsById = new Map(sessions.map((s) => [s.id, s]));
			const sessionsByName = new Map(sessions.map((s) => [s.name, s]));
			for (const pipeline of pipelinesForRoots) {
				for (const node of pipeline.nodes) {
					if (node.type !== 'agent') continue;
					const data = node.data as AgentNodeData;
					const root =
						sessionsById.get(data.sessionId)?.projectRoot ??
						sessionsByName.get(data.sessionName)?.projectRoot;
					if (root) loadedRoots.add(root);
				}
			}
			lastWrittenRootsRef.current = loadedRoots;

			hasRestoredLayoutRef.current = true;
			setIsDirty(false);
		};

		loadLayout();
	}, [graphSessions, sessions]);

	return { persistLayout, pendingSavedViewportRef };
}
