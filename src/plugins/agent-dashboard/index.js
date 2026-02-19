/**
 * Agent Dashboard Plugin
 *
 * Writes real-time agent status to a JSON file for external consumption.
 * Main-process-only plugin — no renderer/iframe UI.
 */

/** @type {Map<string, object>} */
const agents = new Map();

let debounceTimer = null;
let api = null;

function debounceWriteStatus() {
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		writeStatus();
	}, 500);
}

async function writeStatus() {
	if (!api) return;

	try {
		const now = Date.now();
		const agentList = [];
		let totalInputTokens = 0;
		let totalOutputTokens = 0;
		let totalCost = 0;
		let activeAgents = 0;

		for (const agent of agents.values()) {
			const runtimeSeconds = Math.floor((now - agent.startTime) / 1000);
			agentList.push({
				sessionId: agent.sessionId,
				agentType: agent.agentType,
				pid: agent.pid,
				startTime: agent.startTime,
				runtimeSeconds,
				status: agent.status,
				tokens: { ...agent.tokens },
				cost: agent.cost,
				lastTool: agent.lastTool ? { ...agent.lastTool } : null,
			});

			if (agent.status === 'active') {
				activeAgents++;
			}
			totalInputTokens += agent.tokens.input;
			totalOutputTokens += agent.tokens.output;
			totalCost += agent.cost;
		}

		const output = {
			timestamp: now,
			agents: agentList,
			totals: {
				activeAgents,
				totalInputTokens,
				totalOutputTokens,
				totalCost,
			},
		};

		await api.storage.write('status.json', JSON.stringify(output, null, 2));
	} catch (err) {
		console.error('[agent-dashboard] Failed to write status:', err);
	}
}

function ensureAgent(sessionId) {
	if (!agents.has(sessionId)) {
		agents.set(sessionId, {
			sessionId,
			agentType: 'unknown',
			pid: 0,
			startTime: Date.now(),
			tokens: { input: 0, output: 0, cacheRead: 0, contextWindow: 0 },
			cost: 0,
			lastTool: null,
			status: 'active',
			exitedAt: null,
		});
	}
	return agents.get(sessionId);
}

async function activate(pluginApi) {
	api = pluginApi;

	// Seed initial state from already-running agents
	try {
		const active = await api.process.getActiveProcesses();
		for (const proc of active) {
			const agent = ensureAgent(proc.sessionId);
			agent.agentType = proc.toolType || 'unknown';
			agent.pid = proc.pid || 0;
			agent.startTime = proc.startTime || Date.now();
		}
	} catch (err) {
		console.error('[agent-dashboard] Failed to get active processes:', err);
	}

	// Subscribe to usage updates
	api.process.onUsage((sessionId, stats) => {
		const agent = ensureAgent(sessionId);
		if (stats.inputTokens !== undefined) agent.tokens.input = stats.inputTokens;
		if (stats.outputTokens !== undefined) agent.tokens.output = stats.outputTokens;
		if (stats.cacheReadTokens !== undefined) agent.tokens.cacheRead = stats.cacheReadTokens;
		if (stats.contextWindow !== undefined) agent.tokens.contextWindow = stats.contextWindow;
		if (stats.totalCostUsd !== undefined) agent.cost = stats.totalCostUsd;
		debounceWriteStatus();
	});

	// Subscribe to tool executions
	api.process.onToolExecution((sessionId, tool) => {
		const agent = ensureAgent(sessionId);
		try {
			agent.lastTool = {
				name: (tool && tool.name) || 'unknown',
				timestamp: Date.now(),
			};
		} catch {
			// Handle missing/unknown tool data defensively
			agent.lastTool = { name: 'unknown', timestamp: Date.now() };
		}
		debounceWriteStatus();
	});

	// Subscribe to agent exits
	api.process.onExit((sessionId, code) => {
		const agent = agents.get(sessionId);
		if (agent) {
			agent.status = 'exited';
			agent.exitedAt = Date.now();
			debounceWriteStatus();

			// Remove exited agent after 30 seconds
			setTimeout(() => {
				agents.delete(sessionId);
				debounceWriteStatus();
			}, 30000);
		}
	});

	// Subscribe to data events to catch agents that started between getActiveProcesses and subscriptions
	api.process.onData((sessionId, _data) => {
		if (!agents.has(sessionId)) {
			ensureAgent(sessionId);
			debounceWriteStatus();
		}
	});

	// Write initial status
	debounceWriteStatus();
}

async function deactivate() {
	// Clear pending debounce
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}

	// Mark all agents as exited and write final status
	for (const agent of agents.values()) {
		agent.status = 'exited';
		agent.exitedAt = Date.now();
	}
	await writeStatus();

	// Cleanup
	agents.clear();
	api = null;
}

module.exports = { activate, deactivate };
