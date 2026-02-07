/**
 * Agents Collector
 *
 * Collects agent configurations and availability.
 * - No binary paths or installation locations are included
 * - Custom paths/args/env vars show only whether they're set, not values
 */

import { AgentDetector, type AgentCapabilities } from '../../agents';

export interface AgentInfo {
	id: string;
	name: string;
	available: boolean;
	customPath: string; // "[SET]" or "[NOT SET]"
	customArgs: string; // "[SET]" or "[NOT SET]"
	hasCustomEnvVars: boolean;
	customEnvVarCount: number;
	capabilities: AgentCapabilities;
	hidden?: boolean;
	configOptionsState?: Record<string, boolean | string | number>;
}

export interface AgentsInfo {
	detectedAgents: AgentInfo[];
	customArgsSet: string[]; // List of agent IDs with custom args
	customEnvVarsSet: string[]; // List of agent IDs with custom env vars
}

/**
 * Collect agent information with sensitive data stripped.
 * No binary paths, installation directories, or custom path values are included.
 */
export async function collectAgents(agentDetector: AgentDetector | null): Promise<AgentsInfo> {
	const result: AgentsInfo = {
		detectedAgents: [],
		customArgsSet: [],
		customEnvVarsSet: [],
	};

	if (!agentDetector) {
		return result;
	}

	// Get all detected agents
	const agents = await agentDetector.detectAgents();

	for (const agent of agents) {
		const agentInfo: AgentInfo = {
			id: agent.id,
			name: agent.name,
			available: agent.available,
			customPath: agent.customPath ? '[SET]' : '[NOT SET]',
			customArgs: '[NOT SET]',
			hasCustomEnvVars: false,
			customEnvVarCount: 0,
			capabilities: agent.capabilities || {},
			hidden: agent.hidden,
		};

		// Check for config options (model, contextWindow, etc.)
		if (agent.configOptions) {
			agentInfo.configOptionsState = {};
			for (const option of agent.configOptions) {
				agentInfo.configOptionsState[option.key] = `[${option.type.toUpperCase()}]`;
			}
		}

		result.detectedAgents.push(agentInfo);
	}

	return result;
}
