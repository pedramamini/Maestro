/**
 * usePipelineState — Pipeline CRUD, dirty tracking, save/discard, and node/edge mutations.
 *
 * Central state hook for the pipeline editor. Owns all pipeline data, validation,
 * save/discard lifecycle, and node/edge mutation callbacks. Calls usePipelineLayout
 * internally for layout persistence.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactFlowInstance, Viewport } from 'reactflow';
import type {
	CuePipelineState,
	CuePipeline,
	CueGraphSession,
	PipelineEdge as PipelineEdgeType,
	PipelineNode,
	TriggerNodeData,
	AgentNodeData,
	CueEventType,
} from '../../../shared/cue-pipeline-types';
import { getNextPipelineColor } from '../../components/CuePipelineEditor/pipelineColors';
import { graphSessionsToPipelines } from '../../components/CuePipelineEditor/utils/yamlToPipeline';
import { pipelinesToYaml } from '../../components/CuePipelineEditor/utils/pipelineToYaml';
import type { CueSettings } from '../../../shared/cue';
import { DEFAULT_CUE_SETTINGS } from '../../../shared/cue';
import { usePipelineLayout } from './usePipelineLayout';
import { captureException } from '../../utils/sentry';
import { getModalActions } from '../../stores/modalStore';
import { cueService } from '../../services/cue';
import { useCueDirtyStore } from '../../stores/cueDirtyStore';
import { notifyToast } from '../../stores/notificationStore';

// ─── Shared types ────────────────────────────────────────────────────────────

export type { CuePipelineSessionInfo as SessionInfo } from '../../../shared/cue-pipeline-types';
import type { CuePipelineSessionInfo as SessionInfo } from '../../../shared/cue-pipeline-types';

export interface ActiveRunInfo {
	subscriptionName: string;
	sessionName: string;
}

// ─── Exported constants & pure functions ─────────────────────────────────────

export const DEFAULT_TRIGGER_LABELS: Record<CueEventType, string> = {
	'app.startup': 'Startup',
	'time.heartbeat': 'Heartbeat',
	'time.scheduled': 'Scheduled',
	'file.changed': 'File Change',
	'agent.completed': 'Agent Done',
	'github.pull_request': 'Pull Request',
	'github.issue': 'Issue',
	'task.pending': 'Pending Task',
	'cli.trigger': 'CLI Trigger',
};

/**
 * Validate trigger node config against the YAML schema's per-event
 * requirements. Catches misconfigured triggers (e.g. a `time.scheduled`
 * trigger with no `schedule_times`) at SAVE time so they never hit disk —
 * otherwise the YAML loader rejects the whole file on next launch and
 * blocks valid pipelines belonging to other agents in the same project.
 */
function validateTriggerConfig(
	pipelineName: string,
	trigger: PipelineNode,
	errors: string[]
): void {
	const data = trigger.data as TriggerNodeData;
	const cfg = data.config ?? {};
	const label = data.customLabel ? `"${data.customLabel}"` : `${data.eventType}`;
	switch (data.eventType) {
		case 'time.heartbeat':
			if (
				typeof cfg.interval_minutes !== 'number' ||
				!Number.isFinite(cfg.interval_minutes) ||
				cfg.interval_minutes <= 0
			) {
				errors.push(`"${pipelineName}": ${label} trigger needs a positive interval (minutes)`);
			}
			break;
		case 'time.scheduled':
			if (!Array.isArray(cfg.schedule_times) || cfg.schedule_times.length === 0) {
				errors.push(
					`"${pipelineName}": ${label} trigger needs at least one schedule time (e.g. 09:00)`
				);
			}
			break;
		case 'file.changed':
			if (!cfg.watch || (typeof cfg.watch === 'string' && cfg.watch.trim().length === 0)) {
				errors.push(`"${pipelineName}": ${label} trigger needs a "watch" glob pattern`);
			}
			break;
		case 'task.pending':
			if (!cfg.watch || (typeof cfg.watch === 'string' && cfg.watch.trim().length === 0)) {
				errors.push(`"${pipelineName}": ${label} trigger needs a "watch" glob pattern`);
			}
			break;
		case 'github.pull_request':
		case 'github.issue':
			// repo is optional in the YAML schema (defaults to current repo via gh CLI)
			// but if provided it must be non-empty.
			if (
				cfg.repo !== undefined &&
				(typeof cfg.repo !== 'string' || cfg.repo.trim().length === 0)
			) {
				errors.push(
					`"${pipelineName}": ${label} trigger has an empty "repo" — leave blank or set "owner/repo"`
				);
			}
			break;
	}
}

/** Validates pipeline graph before save. Returns array of error messages. */
export function validatePipelines(pipelines: CuePipeline[]): string[] {
	const errors: string[] = [];

	for (const pipeline of pipelines) {
		const triggers = pipeline.nodes.filter((n) => n.type === 'trigger');
		const agents = pipeline.nodes.filter((n) => n.type === 'agent');

		// Completely empty pipelines cannot be persisted (no subscriptions in YAML).
		// Silent-skipping them here led to saves that appeared to succeed but
		// wrote nothing to disk — flag them so the user gets clear feedback.
		if (triggers.length === 0 && agents.length === 0) {
			errors.push(`"${pipeline.name}": add a trigger and an agent before saving`);
			continue;
		}

		if (triggers.length === 0) {
			errors.push(`"${pipeline.name}": needs at least one trigger`);
		}
		if (agents.length === 0) {
			errors.push(`"${pipeline.name}": needs at least one agent`);
		}

		for (const trigger of triggers) {
			validateTriggerConfig(pipeline.name, trigger, errors);
		}

		// Check for disconnected agents (no incoming edge)
		const targetsWithIncoming = new Set(pipeline.edges.map((e) => e.target));
		for (const agent of agents) {
			if (!targetsWithIncoming.has(agent.id)) {
				const name = (agent.data as AgentNodeData).sessionName;
				errors.push(`"${pipeline.name}": agent "${name}" has no incoming connection`);
			}
		}

		// Check agents have prompts configured.
		// An agent's prompt can live on the node (single trigger) or on incoming edges (multi-trigger).
		for (const agent of agents) {
			const agentData = agent.data as AgentNodeData;
			const incomingEdges = pipeline.edges.filter((e) => e.target === agent.id);
			const hasTriggerEdges = incomingEdges.some((e) => {
				const src = pipeline.nodes.find((n) => n.id === e.source);
				return src?.type === 'trigger';
			});

			if (hasTriggerEdges) {
				// Check: either the agent has a node-level prompt, or ALL incoming trigger edges have prompts
				const triggerEdges = incomingEdges.filter((e) => {
					const src = pipeline.nodes.find((n) => n.id === e.source);
					return src?.type === 'trigger';
				});
				const hasNodePrompt = !!agentData.inputPrompt?.trim();
				const allEdgesHavePrompts = triggerEdges.every((e) => e.prompt?.trim());
				if (!hasNodePrompt && !allEdgesHavePrompts) {
					const name = agentData.sessionName;
					errors.push(`"${pipeline.name}": agent "${name}" is missing a prompt`);
				}
			} else if (!agentData.inputPrompt?.trim() && agentData.includeUpstreamOutput === false) {
				// Chain agent with upstream output disabled — must have node-level prompt
				const name = agentData.sessionName;
				errors.push(`"${pipeline.name}": agent "${name}" is missing a prompt`);
			}
		}

		// Check for cycles via topological sort
		const adjList = new Map<string, string[]>();
		const inDegree = new Map<string, number>();
		for (const node of pipeline.nodes) {
			adjList.set(node.id, []);
			inDegree.set(node.id, 0);
		}
		for (const edge of pipeline.edges) {
			adjList.get(edge.source)?.push(edge.target);
			inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
		}
		const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
		let visited = 0;
		while (queue.length > 0) {
			const id = queue.shift()!;
			visited++;
			for (const neighbor of adjList.get(id) ?? []) {
				const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
				inDegree.set(neighbor, newDeg);
				if (newDeg === 0) queue.push(neighbor);
			}
		}
		if (visited < pipeline.nodes.length) {
			errors.push(`"${pipeline.name}": contains a cycle`);
		}
	}

	return errors;
}

// ─── Hook interface ──────────────────────────────────────────────────────────

export interface UsePipelineStateParams {
	sessions: SessionInfo[];
	graphSessions: CueGraphSession[];
	activeRuns?: ActiveRunInfo[];
	reactFlowInstance: ReactFlowInstance;
	// From usePipelineSelection (wired by shell):
	selectedNodePipelineId: string | null;
	selectedEdgePipelineId: string | null;
	setSelectedNodeId: (id: string | null) => void;
	setSelectedEdgeId: (id: string | null) => void;
	// Drawer toggles (selectPipeline closes drawers on null):
	setTriggerDrawerOpen: (open: boolean) => void;
	setAgentDrawerOpen: (open: boolean) => void;
}

export interface UsePipelineStateReturn {
	pipelineState: CuePipelineState;
	setPipelineState: React.Dispatch<React.SetStateAction<CuePipelineState>>;
	isAllPipelinesView: boolean;
	isDirty: boolean;
	setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
	saveStatus: 'idle' | 'saving' | 'success' | 'error';
	validationErrors: string[];
	savedStateRef: React.MutableRefObject<string>;
	cueSettings: CueSettings;
	setCueSettings: React.Dispatch<React.SetStateAction<CueSettings>>;
	showSettings: boolean;
	setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
	runningPipelineIds: Set<string>;
	persistLayout: () => void;
	/** Saved viewport awaiting application once ReactFlow has measured nodes. */
	pendingSavedViewportRef: React.MutableRefObject<Viewport | null>;
	handleSave: () => Promise<void>;
	handleDiscard: () => Promise<void>;
	createPipeline: () => void;
	deletePipeline: (id: string) => void;
	renamePipeline: (id: string, name: string) => void;
	selectPipeline: (id: string | null) => void;
	changePipelineColor: (id: string, color: string) => void;
	onUpdateNode: (nodeId: string, data: Partial<TriggerNodeData | AgentNodeData>) => void;
	onUpdateEdgePrompt: (edgeId: string, prompt: string) => void;
	onDeleteNode: (nodeId: string) => void;
	onUpdateEdge: (edgeId: string, updates: Partial<PipelineEdgeType>) => void;
	onDeleteEdge: (edgeId: string) => void;
}

// ─── Hook implementation ─────────────────────────────────────────────────────

export function usePipelineState({
	sessions,
	graphSessions,
	activeRuns,
	reactFlowInstance,
	selectedNodePipelineId,
	selectedEdgePipelineId,
	setSelectedNodeId,
	setSelectedEdgeId,
	setTriggerDrawerOpen,
	setAgentDrawerOpen,
}: UsePipelineStateParams): UsePipelineStateReturn {
	const [pipelineState, setPipelineState] = useState<CuePipelineState>({
		pipelines: [],
		selectedPipelineId: null,
	});

	const isAllPipelinesView = pipelineState.selectedPipelineId === null;

	// Save/load state
	const [isDirty, setIsDirty] = useState(false);
	const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
	const [validationErrors, setValidationErrors] = useState<string[]>([]);
	const savedStateRef = useRef<string>('');

	// Cue global settings
	const [cueSettings, setCueSettings] = useState<CueSettings>({ ...DEFAULT_CUE_SETTINGS });
	const [showSettings, setShowSettings] = useState(false);

	// Layout persistence (composed hook)
	const { persistLayout, pendingSavedViewportRef } = usePipelineLayout({
		reactFlowInstance,
		graphSessions,
		sessions,
		pipelineState,
		setPipelineState,
		savedStateRef,
		setIsDirty,
	});

	// Load global Cue settings from engine
	useEffect(() => {
		cueService
			.getSettings()
			.then((settings) => setCueSettings(settings))
			.catch((err: unknown) => {
				captureException(err, { extra: { operation: 'cue.getSettings' } });
			});
	}, []);

	// Track dirty state when pipelines change
	useEffect(() => {
		const currentSnapshot = JSON.stringify(pipelineState.pipelines);
		if (savedStateRef.current && currentSnapshot !== savedStateRef.current) {
			setIsDirty(true);
			setValidationErrors([]);
		}
	}, [pipelineState.pipelines]);

	// Push dirty state into the shared store so CueModal can read it without prop-drilling
	useEffect(() => {
		useCueDirtyStore.getState().setPipelineDirty(isDirty);
	}, [isDirty]);

	// Safety net: if `selectedPipelineId` ever points at a pipeline that no
	// longer exists in `pipelines`, reset to "All Pipelines" so the canvas
	// stays populated. This was the user-visible "pipeline vanished after
	// save" symptom — `convertToReactFlowNodes` skips every pipeline whose id
	// doesn't match the selected id, so a stale selection caused the entire
	// canvas to render empty until the editor was remounted (tab switch).
	useEffect(() => {
		const sel = pipelineState.selectedPipelineId;
		if (sel === null) return;
		if (pipelineState.pipelines.length === 0) return;
		if (pipelineState.pipelines.some((p) => p.id === sel)) return;
		setPipelineState((prev) => ({ ...prev, selectedPipelineId: null }));
	}, [pipelineState.pipelines, pipelineState.selectedPipelineId]);

	const handleSave = useCallback(async () => {
		// Validate graph shape first
		const errors = validatePipelines(pipelineState.pipelines);

		// Build session lookup maps. Prefer sessionId since agents can be
		// renamed, but fall back to sessionName for pipelines loaded from older
		// YAML that referenced agents purely by name.
		const sessionsById = new Map<string, SessionInfo>();
		const sessionsByName = new Map<string, SessionInfo>();
		for (const s of sessions) {
			sessionsById.set(s.id, s);
			if (!sessionsByName.has(s.name)) sessionsByName.set(s.name, s);
		}

		const resolveRoot = (agent: AgentNodeData): string | null => {
			const byId = sessionsById.get(agent.sessionId);
			if (byId?.projectRoot) return byId.projectRoot;
			const byName = sessionsByName.get(agent.sessionName);
			if (byName?.projectRoot) return byName.projectRoot;
			return null;
		};

		// Partition pipelines by project root. A pipeline must live in exactly
		// one root — cross-root pipelines are rejected so each .maestro/cue.yaml
		// remains the sole owner of its pipelines (prevents the historical
		// mirroring / deleted-pipeline-reappears class of bugs).
		const pipelinesByRoot = new Map<string, CuePipeline[]>();
		const unresolvedPipelines: string[] = [];

		for (const pipeline of pipelineState.pipelines) {
			const agents = pipeline.nodes.filter((n) => n.type === 'agent');
			if (agents.length === 0) continue; // validatePipelines already flagged this

			const roots = new Set<string>();
			let missingRoot = false;
			for (const agent of agents) {
				const root = resolveRoot(agent.data as AgentNodeData);
				if (!root) {
					missingRoot = true;
					continue;
				}
				roots.add(root);
			}

			if (roots.size === 0) {
				unresolvedPipelines.push(pipeline.name);
				continue;
			}
			if (roots.size > 1) {
				errors.push(
					`"${pipeline.name}": agents span multiple project roots (${[...roots].join(', ')}) — a Cue pipeline must live in a single project.`
				);
				continue;
			}
			if (missingRoot) {
				errors.push(
					`"${pipeline.name}": one or more agents have no resolvable project root — assign a working directory to the agent(s).`
				);
				continue;
			}

			const root = [...roots][0];
			const existing = pipelinesByRoot.get(root) ?? [];
			existing.push(pipeline);
			pipelinesByRoot.set(root, existing);
		}

		if (unresolvedPipelines.length > 0) {
			errors.push(
				`No project root found for pipeline(s): ${unresolvedPipelines.join(', ')} — agents need a working directory.`
			);
		}

		// Safety net: if the editor has pipelines but nothing will be written and
		// no previously-saved root needs clearing, the save would silently succeed
		// with no effect. Surface that rather than masking it as "Saved".
		if (pipelineState.pipelines.length > 0 && pipelinesByRoot.size === 0 && errors.length === 0) {
			errors.push(
				'Nothing to save — pipelines are empty. Add a trigger and an agent, then try again.'
			);
		}

		setValidationErrors(errors);
		if (errors.length > 0) return;

		// Compute which roots were previously saved so we can clear any that
		// dropped out of the current set (e.g. the last pipeline in a root was
		// deleted). Without this, stale YAML files linger at abandoned roots
		// and reappear on reload.
		const previousRoots = new Set<string>();
		if (savedStateRef.current) {
			try {
				const prev = JSON.parse(savedStateRef.current) as CuePipeline[];
				for (const pipeline of prev) {
					for (const node of pipeline.nodes) {
						if (node.type !== 'agent') continue;
						const root = resolveRoot(node.data as AgentNodeData);
						if (root) previousRoots.add(root);
					}
				}
			} catch {
				// Corrupt ref — ignore, we'll only touch current roots this save.
			}
		}

		setSaveStatus('saving');
		try {
			const currentRoots = new Set(pipelinesByRoot.keys());
			const touchedRoots = new Set<string>([...currentRoots, ...previousRoots]);
			let totalPipelinesWritten = 0;
			let rootsCleared = 0;

			// Write each root's YAML with only that root's pipelines.
			for (const root of currentRoots) {
				const rootPipelines = pipelinesByRoot.get(root)!;
				const { yaml: yamlContent, promptFiles } = pipelinesToYaml(rootPipelines, cueSettings);
				const promptFilesObj: Record<string, string> = {};
				for (const [filePath, content] of promptFiles) {
					promptFilesObj[filePath] = content;
				}
				await cueService.writeYaml(root, yamlContent, promptFilesObj);

				// Write-back verification: read the YAML we just wrote and
				// confirm our content is on disk. Guards against any silent
				// IPC failure path — if disk doesn't match memory, we throw
				// so the user sees an error instead of a fake "Saved".
				const onDisk = await cueService.readYaml(root);
				if (onDisk === null) {
					throw new Error(`writeYaml to "${root}" did not persist: no file on disk`);
				}
				if (onDisk !== yamlContent) {
					throw new Error(
						`writeYaml to "${root}" did not persist the expected content (${onDisk.length} bytes on disk vs ${yamlContent.length} expected)`
					);
				}
				totalPipelinesWritten += rootPipelines.length;
			}

			// Clear any root whose pipelines were all removed this save.
			for (const root of previousRoots) {
				if (currentRoots.has(root)) continue;
				const { yaml: emptyYaml } = pipelinesToYaml([], cueSettings);
				await cueService.writeYaml(root, emptyYaml, {});
				rootsCleared++;
			}

			// Refresh every session whose project root was touched so the engine
			// reloads the freshly written YAML into its in-memory registry.
			for (const session of sessions) {
				if (session.projectRoot && touchedRoots.has(session.projectRoot)) {
					await cueService.refreshSession(session.id, session.projectRoot);
				}
			}

			savedStateRef.current = JSON.stringify(pipelineState.pipelines);
			setIsDirty(false);
			setSaveStatus('success');
			persistLayout();
			setTimeout(() => setSaveStatus('idle'), 2000);

			// Explicit confirmation so the user cannot miss the brief in-button
			// status flash — "didn't save" used to happen when the 2-second
			// success indicator was blinked past without the user noticing.
			const rootLabel = currentRoots.size === 1 ? 'project' : 'projects';
			const pipelineLabel = totalPipelinesWritten === 1 ? 'pipeline' : 'pipelines';
			const clearedSuffix =
				rootsCleared > 0
					? ` (cleared ${rootsCleared} empty ${rootsCleared === 1 ? 'project' : 'projects'})`
					: '';
			notifyToast({
				type: 'success',
				title: 'Cue pipelines saved',
				message: `Saved ${totalPipelinesWritten} ${pipelineLabel} to ${currentRoots.size} ${rootLabel}${clearedSuffix}.`,
			});
		} catch (err: unknown) {
			captureException(err, { extra: { operation: 'cue.pipelineSave' } });
			setSaveStatus('error');
			setTimeout(() => setSaveStatus('idle'), 3000);
			// Keep isDirty = true so the user knows their changes are still
			// unsaved (do NOT update savedStateRef on failure).
			const message = err instanceof Error ? err.message : String(err);
			notifyToast({
				type: 'error',
				title: 'Cue save failed',
				message: `Your changes were NOT saved. ${message}`,
			});
		}
	}, [pipelineState.pipelines, sessions, cueSettings, persistLayout, savedStateRef]);

	const handleDiscard = useCallback(async () => {
		try {
			const data = await cueService.getGraphData();
			if (data && data.length > 0) {
				const pipelines = graphSessionsToPipelines(data, sessions);
				setPipelineState({
					pipelines,
					selectedPipelineId: pipelines.length > 0 ? pipelines[0].id : null,
				});
				savedStateRef.current = JSON.stringify(pipelines);
			} else {
				setPipelineState({ pipelines: [], selectedPipelineId: null });
				savedStateRef.current = '[]';
			}
			setIsDirty(false);
			setValidationErrors([]);
		} catch (err: unknown) {
			captureException(err, { extra: { operation: 'cue.pipelineDiscard' } });
		}
	}, [sessions]);

	const createPipeline = useCallback(() => {
		setPipelineState((prev) => {
			// Find the highest existing pipeline number to avoid duplicates after deletions
			let maxNum = 0;
			for (const p of prev.pipelines) {
				const match = p.name.match(/^Pipeline (\d+)$/);
				if (match) {
					maxNum = Math.max(maxNum, parseInt(match[1], 10));
				}
			}
			const newPipeline: CuePipeline = {
				id: `pipeline-${Date.now()}`,
				name: `Pipeline ${maxNum + 1}`,
				color: getNextPipelineColor(prev.pipelines),
				nodes: [],
				edges: [],
			};
			return {
				pipelines: [...prev.pipelines, newPipeline],
				selectedPipelineId: newPipeline.id,
			};
		});
	}, []);

	const deletePipeline = useCallback(
		(id: string) => {
			const state = pipelineState;
			const pipeline = state.pipelines.find((p) => p.id === id);
			if (!pipeline) return;

			const doDelete = () => {
				setPipelineState((prev) => {
					const otherPipelines = prev.pipelines.filter((p) => p.id !== id);
					const newSelectedId = prev.selectedPipelineId === id ? null : prev.selectedPipelineId;
					return { pipelines: otherPipelines, selectedPipelineId: newSelectedId };
				});
			};

			if (pipeline.nodes.length > 0) {
				getModalActions().showConfirmation(
					`Delete pipeline "${pipeline.name}" and its nodes?`,
					doDelete
				);
			} else {
				doDelete();
			}
		},
		[pipelineState]
	);

	const renamePipeline = useCallback((id: string, name: string) => {
		setPipelineState((prev) => ({
			...prev,
			pipelines: prev.pipelines.map((p) => (p.id === id ? { ...p, name } : p)),
		}));
	}, []);

	const selectPipeline = useCallback(
		(id: string | null) => {
			setPipelineState((prev) => ({ ...prev, selectedPipelineId: id }));
			if (id === null) {
				setTriggerDrawerOpen(false);
				setAgentDrawerOpen(false);
			}
			persistLayout();
		},
		[persistLayout, setTriggerDrawerOpen, setAgentDrawerOpen]
	);

	const changePipelineColor = useCallback((id: string, color: string) => {
		setPipelineState((prev) => ({
			...prev,
			pipelines: prev.pipelines.map((p) => (p.id === id ? { ...p, color } : p)),
		}));
	}, []);

	// Determine which pipelines have active runs
	const runningPipelineIds = useMemo(() => {
		const ids = new Set<string>();
		if (!activeRuns || activeRuns.length === 0) return ids;
		for (const run of activeRuns) {
			// Match subscription name to pipeline name (strip -chain-N, -fanin suffixes)
			const baseName = run.subscriptionName.replace(/-chain-\d+$/, '').replace(/-fanin$/, '');
			for (const pipeline of pipelineState.pipelines) {
				if (pipeline.name === baseName) {
					ids.add(pipeline.id);
				}
			}
		}
		return ids;
	}, [activeRuns, pipelineState.pipelines]);

	// ─── Node/edge mutation callbacks ────────────────────────────────────────

	const onUpdateNode = useCallback(
		(nodeId: string, data: Partial<TriggerNodeData | AgentNodeData>) => {
			if (!selectedNodePipelineId) return;
			setPipelineState((prev) => ({
				...prev,
				pipelines: prev.pipelines.map((p) => {
					if (p.id !== selectedNodePipelineId) return p;
					return {
						...p,
						nodes: p.nodes.map((n) => {
							if (n.id !== nodeId) return n;
							return { ...n, data: { ...n.data, ...data } };
						}),
					};
				}),
			}));
		},
		[selectedNodePipelineId]
	);

	const onUpdateEdgePrompt = useCallback(
		(edgeId: string, prompt: string) => {
			if (!selectedNodePipelineId) return;
			setPipelineState((prev) => ({
				...prev,
				pipelines: prev.pipelines.map((p) => {
					if (p.id !== selectedNodePipelineId) return p;
					return {
						...p,
						edges: p.edges.map((e) => {
							if (e.id !== edgeId) return e;
							return { ...e, prompt };
						}),
					};
				}),
			}));
		},
		[selectedNodePipelineId]
	);

	const onDeleteNode = useCallback(
		(nodeId: string) => {
			if (!selectedNodePipelineId) return;
			setPipelineState((prev) => ({
				...prev,
				pipelines: prev.pipelines.map((p) => {
					if (p.id !== selectedNodePipelineId) return p;
					return {
						...p,
						nodes: p.nodes.filter((n) => n.id !== nodeId),
						edges: p.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
					};
				}),
			}));
			setSelectedNodeId(null);
		},
		[selectedNodePipelineId, setSelectedNodeId]
	);

	const onUpdateEdge = useCallback(
		(edgeId: string, updates: Partial<PipelineEdgeType>) => {
			if (!selectedEdgePipelineId) return;
			setPipelineState((prev) => ({
				...prev,
				pipelines: prev.pipelines.map((p) => {
					if (p.id !== selectedEdgePipelineId) return p;
					return {
						...p,
						edges: p.edges.map((e) => {
							if (e.id !== edgeId) return e;
							return { ...e, ...updates };
						}),
					};
				}),
			}));
		},
		[selectedEdgePipelineId]
	);

	const onDeleteEdge = useCallback(
		(edgeId: string) => {
			if (!selectedEdgePipelineId) return;
			setPipelineState((prev) => ({
				...prev,
				pipelines: prev.pipelines.map((p) => {
					if (p.id !== selectedEdgePipelineId) return p;
					return {
						...p,
						edges: p.edges.filter((e) => e.id !== edgeId),
					};
				}),
			}));
			setSelectedEdgeId(null);
		},
		[selectedEdgePipelineId, setSelectedEdgeId]
	);

	return {
		pipelineState,
		setPipelineState,
		isAllPipelinesView,
		isDirty,
		setIsDirty,
		saveStatus,
		validationErrors,
		savedStateRef,
		cueSettings,
		setCueSettings,
		showSettings,
		setShowSettings,
		runningPipelineIds,
		persistLayout,
		pendingSavedViewportRef,
		handleSave,
		handleDiscard,
		createPipeline,
		deletePipeline,
		renamePipeline,
		selectPipeline,
		changePipelineColor,
		onUpdateNode,
		onUpdateEdgePrompt,
		onDeleteNode,
		onUpdateEdge,
		onDeleteEdge,
	};
}
