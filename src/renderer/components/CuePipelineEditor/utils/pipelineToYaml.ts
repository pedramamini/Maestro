/**
 * Converts visual pipeline graph state to YAML content consumable by the Cue engine.
 *
 * A pipeline "trigger -> agent1 -> agent2" produces chained subscriptions:
 *   - First subscription uses the trigger's event type
 *   - Subsequent subscriptions use agent.completed with source_session chaining
 *   - Fan-out uses fan_out array, fan-in uses source_session array
 */

import * as yaml from 'js-yaml';
import type {
	CuePipeline,
	PipelineNode,
	PipelineEdge,
	TriggerNodeData,
	AgentNodeData,
	CommandNodeData,
} from '../../../../shared/cue-pipeline-types';
import { commandNodeDataToCueCommand } from '../../../../shared/cue-pipeline-types';
import type { CueSubscription, CueSettings } from '../../../../shared/cue';
import { cuePromptFilePath } from '../../../../shared/maestro-paths';

/**
 * Returns the chain identity for a node — the value downstream subscriptions
 * will use as `source_session`. For agents that's the agent's session name; for
 * command nodes we use the owning session's name (the engine emits
 * agent.completed against the session that ran the work).
 */
function getChainSessionName(node: PipelineNode): string {
	if (node.type === 'command') return (node.data as CommandNodeData).owningSessionName;
	return (node.data as AgentNodeData).sessionName;
}

/**
 * Returns the owning session ID for a node — used as the `agent_id` field on
 * the YAML subscription, binding it to the session whose project root and
 * cue.yaml own the work.
 */
function getOwningSessionId(node: PipelineNode): string {
	if (node.type === 'command') return (node.data as CommandNodeData).owningSessionId;
	return (node.data as AgentNodeData).sessionId;
}

const SOURCE_OUTPUT_VAR = '{{CUE_SOURCE_OUTPUT}}';

/**
 * Ensures the prompt for an agent.completed chain subscription includes the
 * {{CUE_SOURCE_OUTPUT}} template variable so upstream agent output is passed through.
 *
 * - If the prompt already contains the variable (case-insensitive), returns as-is.
 * - If the prompt is empty/whitespace, returns the bare variable.
 * - Otherwise prepends the variable above the user's prompt.
 */
export function ensureSourceOutputVariable(prompt: string): string {
	if (prompt.toUpperCase().includes(SOURCE_OUTPUT_VAR.toUpperCase())) return prompt;
	if (!prompt.trim()) return SOURCE_OUTPUT_VAR;
	return `${SOURCE_OUTPUT_VAR}\n\n${prompt}`;
}

/** Result of converting pipelines to YAML, including external prompt files */
export interface PipelineYamlResult {
	yaml: string;
	promptFiles: Map<string, string>;
}

function buildAdjacency(pipeline: CuePipeline): {
	outgoing: Map<string, PipelineEdge[]>;
	incoming: Map<string, PipelineEdge[]>;
} {
	const outgoing = new Map<string, PipelineEdge[]>();
	const incoming = new Map<string, PipelineEdge[]>();

	for (const edge of pipeline.edges) {
		const out = outgoing.get(edge.source) ?? [];
		out.push(edge);
		outgoing.set(edge.source, out);

		const inc = incoming.get(edge.target) ?? [];
		inc.push(edge);
		incoming.set(edge.target, inc);
	}

	return { outgoing, incoming };
}

function findTriggerNodes(pipeline: CuePipeline): PipelineNode[] {
	return pipeline.nodes.filter((n) => n.type === 'trigger');
}

function getEdgeModeComment(edge: PipelineEdge): string | null {
	if (edge.mode === 'debate') {
		const rounds = edge.debateConfig?.maxRounds ?? 3;
		const timeout = edge.debateConfig?.timeoutPerRound ?? 60;
		return `# mode: debate, max_rounds: ${rounds}, timeout_per_round: ${timeout}`;
	}
	if (edge.mode === 'autorun') {
		return '# mode: autorun';
	}
	return null;
}

/**
 * Lower-level helper: converts a single pipeline into CueSubscription objects.
 */
export function pipelineToYamlSubscriptions(pipeline: CuePipeline): CueSubscription[] {
	const subscriptions: CueSubscription[] = [];
	const { outgoing, incoming } = buildAdjacency(pipeline);
	const triggers = findTriggerNodes(pipeline);
	const nodeMap = new Map(pipeline.nodes.map((n) => [n.id, n]));

	// Track visited nodes to avoid duplicates
	const visited = new Set<string>();
	let chainIndex = 0;

	for (const trigger of triggers) {
		const triggerData = trigger.data as TriggerNodeData;
		const triggerOutgoing = outgoing.get(trigger.id) ?? [];

		if (triggerOutgoing.length === 0) continue;

		// Build the first subscription from trigger. A "work target" is anything
		// that performs work — agent nodes (run a prompt) or command nodes (run
		// shell/cli). cli_output nodes from rc are now folded into command nodes;
		// they no longer exist as a node type.
		const directTargets = triggerOutgoing
			.map((e) => nodeMap.get(e.target))
			.filter(Boolean) as PipelineNode[];
		const agentTargets = directTargets.filter((n) => n.type === 'agent' || n.type === 'command');

		if (agentTargets.length === 0) continue;

		const subName = chainIndex === 0 ? pipeline.name : `${pipeline.name}-chain-${chainIndex}`;
		chainIndex++;

		const sub: CueSubscription = {
			name: subName,
			event: triggerData.eventType,
			enabled: true,
			prompt: '',
		};

		// Persist trigger's custom label
		if (triggerData.customLabel) {
			sub.label = triggerData.customLabel;
		}

		// Map trigger config fields
		switch (triggerData.eventType) {
			case 'time.heartbeat':
				if (triggerData.config.interval_minutes) {
					sub.interval_minutes = triggerData.config.interval_minutes;
				}
				break;
			case 'time.scheduled':
				if (triggerData.config.schedule_times?.length) {
					sub.schedule_times = triggerData.config.schedule_times;
				}
				if (triggerData.config.schedule_days?.length) {
					sub.schedule_days = triggerData.config.schedule_days as CueSubscription['schedule_days'];
				}
				break;
			case 'file.changed':
				sub.watch = triggerData.config.watch ?? '**/*';
				if (triggerData.config.filter) {
					sub.filter = triggerData.config.filter;
				}
				break;
			case 'github.pull_request':
			case 'github.issue':
				if (triggerData.config.repo) sub.repo = triggerData.config.repo;
				if (triggerData.config.poll_minutes) sub.poll_minutes = triggerData.config.poll_minutes;
				break;
			case 'task.pending':
				sub.watch = triggerData.config.watch ?? '**/*.md';
				break;
			case 'agent.completed':
				// source_session comes from node config, not edges
				break;
		}

		if (agentTargets.length === 1) {
			// Single target — agent or command
			const target = agentTargets[0];
			if (target.type === 'command') {
				const cmdData = target.data as CommandNodeData;
				const cmd = commandNodeDataToCueCommand(cmdData);
				// User chose this name in the UI; keep it as the subscription name so
				// the YAML is readable instead of using the auto-generated chain index.
				sub.name = cmdData.name || subName;
				// `prompt` is the dispatcher's "has work" sentinel for command actions;
				// the normalizer back-fills it from the command spec on load.
				sub.prompt = cmd?.mode === 'shell' ? cmd.shell : cmd?.mode === 'cli' ? cmd.cli.target : '';
				sub.action = 'command';
				if (cmd) sub.command = cmd;
			} else {
				const agentData = target.data as AgentNodeData;
				// Use edge prompt if available (per-trigger prompt), fallback to agent node prompt
				const triggerEdge = triggerOutgoing.find((e) => e.target === target.id);
				sub.prompt = triggerEdge?.prompt ?? agentData.inputPrompt ?? '';
				if (agentData.outputPrompt) sub.output_prompt = agentData.outputPrompt;
			}

			subscriptions.push(sub);
			visited.add(target.id);

			// Follow the chain from this target
			buildChain(target, pipeline.name, subscriptions, outgoing, incoming, nodeMap, visited);
			chainIndex = subscriptions.length;
		} else {
			// Fan-out: multiple targets from trigger. Command targets are NOT
			// supported in fan-out (the engine's `fan_out` field targets sessions
			// by name, not subscriptions, and a command node doesn't have its own
			// session identity). Restrict fan-out to agent targets here; the
			// pipeline editor already discourages this combination at edit time.
			const fanOutAgents = agentTargets.filter((n) => n.type === 'agent');
			// If the graph contains command nodes in the fan-out (shouldn't
			// normally happen — editor blocks it — but hand-edited JSON could),
			// surface a dev-facing warning so the silent drop isn't hidden.
			if (agentTargets.length > fanOutAgents.length) {
				const dropped = agentTargets.filter((n) => n.type !== 'agent').length;
				console.warn(
					`[cue] pipelineToYaml: ${dropped} non-agent fan-out target(s) skipped from "fan_out" in trigger "${triggerData.customLabel ?? triggerData.eventType}" — command nodes are not supported as fan-out targets`
				);
			}
			sub.fan_out = fanOutAgents.map((a) => (a.data as AgentNodeData).sessionName);
			// Resolve per-agent prompts from edge prompt → agent inputPrompt fallback
			const perAgentPrompts = fanOutAgents.map((agent) => {
				const edge = triggerOutgoing.find((e) => e.target === agent.id);
				return edge?.prompt ?? (agent.data as AgentNodeData).inputPrompt ?? '';
			});
			// Use per-agent prompts if they differ; otherwise collapse to single prompt
			const allSame = perAgentPrompts.every((p) => p === perAgentPrompts[0]);
			if (allSame) {
				sub.prompt = perAgentPrompts[0];
			} else {
				sub.prompt = perAgentPrompts[0];
				sub.fan_out_prompts = perAgentPrompts;
			}
			subscriptions.push(sub);

			for (const agent of agentTargets) {
				visited.add(agent.id);
			}

			// Follow chains from each fan-out target
			for (const agent of agentTargets) {
				buildChain(agent, pipeline.name, subscriptions, outgoing, incoming, nodeMap, visited);
			}
			chainIndex = subscriptions.length;
		}
	}

	return subscriptions;
}

function buildChain(
	fromNode: PipelineNode,
	pipelineName: string,
	subscriptions: CueSubscription[],
	outgoing: Map<string, PipelineEdge[]>,
	incoming: Map<string, PipelineEdge[]>,
	nodeMap: Map<string, PipelineNode>,
	visited: Set<string>
): void {
	const fromOutgoing = outgoing.get(fromNode.id) ?? [];
	if (fromOutgoing.length === 0) return;

	const targets = fromOutgoing
		.map((e) => nodeMap.get(e.target))
		.filter((n): n is PipelineNode => n != null && (n.type === 'agent' || n.type === 'command'));

	if (targets.length === 0) return;

	const fromChainName = getChainSessionName(fromNode);

	for (const target of targets) {
		if (visited.has(target.id)) continue;
		visited.add(target.id);

		// Incoming work edges (agent-or-command sources). Used for fan-in
		// detection and source_session emission.
		const targetIncoming = incoming.get(target.id) ?? [];
		const incomingWorkEdges = targetIncoming.filter((e) => {
			const sourceNode = nodeMap.get(e.source);
			return sourceNode?.type === 'agent' || sourceNode?.type === 'command';
		});

		const fallbackSubName = `${pipelineName}-chain-${subscriptions.length}`;

		let sub: CueSubscription;

		if (target.type === 'command') {
			const cmdData = target.data as CommandNodeData;
			const cmd = commandNodeDataToCueCommand(cmdData);
			sub = {
				name: cmdData.name || fallbackSubName,
				event: 'agent.completed',
				enabled: true,
				prompt: cmd?.mode === 'shell' ? cmd.shell : cmd?.mode === 'cli' ? cmd.cli.target : '',
				action: 'command',
				...(cmd ? { command: cmd } : {}),
			};
		} else {
			const targetData = target.data as AgentNodeData;
			// Determine per-edge upstream-output inclusion. Each incoming work edge
			// can independently opt out of contributing its output to the target's
			// {{CUE_SOURCE_OUTPUT}} ("passthrough": the source must still complete
			// before the target fires, but its output is not injected).
			//
			// Resolution priority: edge.includeUpstreamOutput → node.includeUpstreamOutput → true.
			const resolveInclude = (edge: PipelineEdge): boolean => {
				if (edge.includeUpstreamOutput !== undefined) return edge.includeUpstreamOutput;
				return targetData.includeUpstreamOutput !== false;
			};
			const includedEdges = incomingWorkEdges.filter(resolveInclude);
			const shouldInjectSource = includedEdges.length > 0;

			sub = {
				name: fallbackSubName,
				event: 'agent.completed',
				enabled: true,
				prompt: shouldInjectSource
					? ensureSourceOutputVariable(targetData.inputPrompt ?? '')
					: (targetData.inputPrompt ?? ''),
				output_prompt: targetData.outputPrompt || undefined,
			};

			if (incomingWorkEdges.length > 1) {
				// Fan-in include_output_from / forward_output_from only emit for agent
				// targets — command nodes don't aggregate per-source outputs.
				if (includedEdges.length < incomingWorkEdges.length && includedEdges.length > 0) {
					sub.include_output_from = includedEdges
						.map((e) => {
							const src = nodeMap.get(e.source);
							return src ? getChainSessionName(src) : '';
						})
						.filter(Boolean);
				}
				const forwardedEdges = incomingWorkEdges.filter((e) => e.forwardOutput === true);
				if (forwardedEdges.length > 0) {
					sub.forward_output_from = forwardedEdges
						.map((e) => {
							const src = nodeMap.get(e.source);
							return src ? getChainSessionName(src) : '';
						})
						.filter(Boolean);
				}
				if (targetData.fanInTimeoutMinutes != null) {
					sub.fan_in_timeout_minutes = targetData.fanInTimeoutMinutes;
				}
				if (targetData.fanInTimeoutOnFail != null) {
					sub.fan_in_timeout_on_fail = targetData.fanInTimeoutOnFail;
				}
			}
		}

		// source_session: fan-in emits the full source list, single-source emits one name.
		if (incomingWorkEdges.length > 1) {
			sub.source_session = incomingWorkEdges
				.map((e) => {
					const src = nodeMap.get(e.source);
					return src ? getChainSessionName(src) : '';
				})
				.filter(Boolean);
		} else {
			sub.source_session = fromChainName;
		}

		subscriptions.push(sub);

		// Continue the chain
		buildChain(target, pipelineName, subscriptions, outgoing, incoming, nodeMap, visited);
	}
}

/**
 * Converts pipeline graph state to YAML string with external prompt files.
 * Prompts are saved as external .md files referenced by prompt_file in the YAML.
 */
export function pipelinesToYaml(
	pipelines: CuePipeline[],
	settings?: Partial<CueSettings>
): PipelineYamlResult {
	const allSubscriptions: Array<Record<string, unknown>> = [];
	const comments: string[] = [];
	const promptFiles = new Map<string, string>();

	for (const pipeline of pipelines) {
		// Pipeline metadata comment
		comments.push(`# Pipeline: ${pipeline.name} (color: ${pipeline.color})`);

		const subs = pipelineToYamlSubscriptions(pipeline);

		// Build maps from subscription name to the agent node that owns it
		const subAgentMap = buildSubAgentMap(pipeline);
		const subAgentIdMap = buildSubAgentIdMap(pipeline);

		for (const sub of subs) {
			const record: Record<string, unknown> = {
				name: sub.name,
				event: sub.event,
			};

			// Bind subscription to its owning agent by session ID
			const agentId = subAgentIdMap.get(sub.name);
			if (agentId) record.agent_id = agentId;

			if (sub.label) record.label = sub.label;
			if (sub.interval_minutes != null) record.interval_minutes = sub.interval_minutes;
			if (sub.schedule_times != null) record.schedule_times = sub.schedule_times;
			if (sub.schedule_days != null) record.schedule_days = sub.schedule_days;
			if (sub.watch != null) record.watch = sub.watch;
			if (sub.repo != null) record.repo = sub.repo;
			if (sub.poll_minutes != null) record.poll_minutes = sub.poll_minutes;
			if (sub.source_session != null) record.source_session = sub.source_session;
			if (sub.fan_out != null) record.fan_out = sub.fan_out;
			if (sub.fan_out_prompts != null) record.fan_out_prompts = sub.fan_out_prompts;
			if (sub.filter != null) record.filter = sub.filter;
			if (sub.fan_in_timeout_minutes != null)
				record.fan_in_timeout_minutes = sub.fan_in_timeout_minutes;
			if (sub.fan_in_timeout_on_fail != null)
				record.fan_in_timeout_on_fail = sub.fan_in_timeout_on_fail;
			if (sub.include_output_from != null) record.include_output_from = sub.include_output_from;
			if (sub.forward_output_from != null) record.forward_output_from = sub.forward_output_from;

			// Command action: emit `action: command` + the structured `command`
			// object inline. Skip prompt_file emission — the dispatcher uses
			// `prompt` only as a sentinel that the normalizer back-fills from
			// the command spec on load.
			if (sub.action === 'command') {
				record.action = 'command';
				if (sub.command != null) record.command = sub.command;
				allSubscriptions.push(record);
				continue;
			}

			// Save prompts as external files.
			// Use sub.name as the suffix key so multiple triggers targeting the same agent
			// get unique file paths (e.g. agent-pipeline.md vs agent-pipeline-chain-1.md).
			const agentName = subAgentMap.get(sub.name) ?? 'agent';
			const promptSuffix = sub.name === pipeline.name ? pipeline.name : sub.name;

			if (sub.prompt) {
				const filePath = cuePromptFilePath(agentName, promptSuffix);
				record.prompt_file = filePath;
				promptFiles.set(filePath, sub.prompt);
			}

			if (sub.output_prompt) {
				const filePath = cuePromptFilePath(agentName, promptSuffix, 'output');
				record.output_prompt_file = filePath;
				promptFiles.set(filePath, sub.output_prompt);
			}

			allSubscriptions.push(record);
		}

		// Add edge mode annotations as comments
		for (const edge of pipeline.edges) {
			const comment = getEdgeModeComment(edge);
			if (comment) {
				const sourceNode = pipeline.nodes.find((n) => n.id === edge.source);
				const targetNode = pipeline.nodes.find((n) => n.id === edge.target);
				if (sourceNode && targetNode) {
					const labelOf = (n: PipelineNode): string => {
						if (n.type === 'trigger') return (n.data as TriggerNodeData).label;
						if (n.type === 'command') return (n.data as CommandNodeData).name || 'command';
						return (n.data as AgentNodeData).sessionName;
					};
					comments.push(
						`# Edge ${labelOf(sourceNode)} -> ${labelOf(targetNode)}: ${comment.replace('# ', '')}`
					);
				}
			}
		}
	}

	const config: Record<string, unknown> = {
		subscriptions: allSubscriptions,
	};

	if (settings) {
		config.settings = settings;
	}

	const yamlStr = yaml.dump(config, {
		indent: 2,
		lineWidth: 120,
		noRefs: true,
		quotingType: "'",
		forceQuotes: false,
	});

	// Prepend pipeline metadata comments
	const header = comments.length > 0 ? comments.join('\n') + '\n\n' : '';
	return { yaml: header + yamlStr, promptFiles };
}

/**
 * Builds a map from subscription name to the agent session name that owns it.
 * Used for generating prompt file paths with the agent name.
 */
function buildSubAgentMap(pipeline: CuePipeline): Map<string, string> {
	const result = new Map<string, string>();
	const { outgoing } = buildAdjacency(pipeline);
	const triggers = findTriggerNodes(pipeline);
	const nodeMap = new Map(pipeline.nodes.map((n) => [n.id, n]));

	const visited = new Set<string>();
	let chainIndex = 0;

	const subKeyFor = (target: PipelineNode, fallback: string): string =>
		target.type === 'command' ? (target.data as CommandNodeData).name || fallback : fallback;

	for (const trigger of triggers) {
		const triggerOutgoing = outgoing.get(trigger.id) ?? [];
		if (triggerOutgoing.length === 0) continue;

		const directTargets = triggerOutgoing
			.map((e) => nodeMap.get(e.target))
			.filter(Boolean) as PipelineNode[];
		const agentTargets = directTargets.filter((n) => n.type === 'agent' || n.type === 'command');
		if (agentTargets.length === 0) continue;

		const subName = chainIndex === 0 ? pipeline.name : `${pipeline.name}-chain-${chainIndex}`;
		chainIndex++;

		if (agentTargets.length === 1) {
			result.set(subKeyFor(agentTargets[0], subName), getChainSessionName(agentTargets[0]));
			visited.add(agentTargets[0].id);
			buildSubAgentMapChain(agentTargets[0], pipeline.name, result, outgoing, nodeMap, visited);
			chainIndex = result.size;
		} else {
			// Fan-out: use first agent name for the subscription
			result.set(subKeyFor(agentTargets[0], subName), getChainSessionName(agentTargets[0]));
			for (const agent of agentTargets) visited.add(agent.id);
			for (const agent of agentTargets) {
				buildSubAgentMapChain(agent, pipeline.name, result, outgoing, nodeMap, visited);
			}
			chainIndex = result.size;
		}
	}

	return result;
}

/**
 * Builds a map from subscription name to the agent session ID that owns it.
 * Used for setting the agent_id field in YAML so subscriptions are bound to specific agents.
 */
function buildSubAgentIdMap(pipeline: CuePipeline): Map<string, string> {
	const result = new Map<string, string>();
	const { outgoing } = buildAdjacency(pipeline);
	const triggers = findTriggerNodes(pipeline);
	const nodeMap = new Map(pipeline.nodes.map((n) => [n.id, n]));

	const visited = new Set<string>();
	let chainIndex = 0;

	const subKeyFor = (target: PipelineNode, fallback: string): string =>
		target.type === 'command' ? (target.data as CommandNodeData).name || fallback : fallback;

	for (const trigger of triggers) {
		const triggerOutgoing = outgoing.get(trigger.id) ?? [];
		if (triggerOutgoing.length === 0) continue;

		const directTargets = triggerOutgoing
			.map((e) => nodeMap.get(e.target))
			.filter(Boolean) as PipelineNode[];
		const agentTargets = directTargets.filter((n) => n.type === 'agent' || n.type === 'command');
		if (agentTargets.length === 0) continue;

		const subName = chainIndex === 0 ? pipeline.name : `${pipeline.name}-chain-${chainIndex}`;
		chainIndex++;

		if (agentTargets.length === 1) {
			result.set(subKeyFor(agentTargets[0], subName), getOwningSessionId(agentTargets[0]));
			visited.add(agentTargets[0].id);
			buildSubAgentIdMapChain(agentTargets[0], pipeline.name, result, outgoing, nodeMap, visited);
			chainIndex = result.size;
		} else {
			// Fan-out: use first agent's ID for the subscription
			result.set(subKeyFor(agentTargets[0], subName), getOwningSessionId(agentTargets[0]));
			for (const agent of agentTargets) visited.add(agent.id);
			for (const agent of agentTargets) {
				buildSubAgentIdMapChain(agent, pipeline.name, result, outgoing, nodeMap, visited);
			}
			chainIndex = result.size;
		}
	}

	return result;
}

function buildSubAgentIdMapChain(
	fromNode: PipelineNode,
	pipelineName: string,
	result: Map<string, string>,
	outgoing: Map<string, PipelineEdge[]>,
	nodeMap: Map<string, PipelineNode>,
	visited: Set<string>
): void {
	const fromOutgoing = outgoing.get(fromNode.id) ?? [];
	const targets = fromOutgoing
		.map((e) => nodeMap.get(e.target))
		.filter((n): n is PipelineNode => n != null && (n.type === 'agent' || n.type === 'command'));

	for (const target of targets) {
		if (visited.has(target.id)) continue;
		visited.add(target.id);

		const fallbackName = `${pipelineName}-chain-${result.size}`;
		const subName =
			target.type === 'command'
				? (target.data as CommandNodeData).name || fallbackName
				: fallbackName;
		result.set(subName, getOwningSessionId(target));
		buildSubAgentIdMapChain(target, pipelineName, result, outgoing, nodeMap, visited);
	}
}

function buildSubAgentMapChain(
	fromNode: PipelineNode,
	pipelineName: string,
	result: Map<string, string>,
	outgoing: Map<string, PipelineEdge[]>,
	nodeMap: Map<string, PipelineNode>,
	visited: Set<string>
): void {
	const fromOutgoing = outgoing.get(fromNode.id) ?? [];
	const targets = fromOutgoing
		.map((e) => nodeMap.get(e.target))
		.filter((n): n is PipelineNode => n != null && (n.type === 'agent' || n.type === 'command'));

	for (const target of targets) {
		if (visited.has(target.id)) continue;
		visited.add(target.id);

		const fallbackName = `${pipelineName}-chain-${result.size}`;
		const subName =
			target.type === 'command'
				? (target.data as CommandNodeData).name || fallbackName
				: fallbackName;
		result.set(subName, getChainSessionName(target));
		buildSubAgentMapChain(target, pipelineName, result, outgoing, nodeMap, visited);
	}
}
