import { execFileNoThrow } from './utils/execFile';
import { logger } from './utils/logger';
import * as os from 'os';
import * as fs from 'fs';
import { AgentCapabilities, getAgentCapabilities } from './agent-capabilities';

// Re-export AgentCapabilities for convenience
export { AgentCapabilities } from './agent-capabilities';

// Configuration option types for agent-specific settings
export interface AgentConfigOption {
  key: string; // Storage key
  type: 'checkbox' | 'text' | 'number' | 'select';
  label: string; // UI label
  description: string; // Help text
  default: any; // Default value
  options?: string[]; // For select type
  argBuilder?: (value: any) => string[]; // Converts config value to CLI args
}

export interface AgentConfig {
  id: string;
  name: string;
  binaryName: string;
  command: string;
  args: string[]; // Base args always included (excludes batch mode prefix)
  available: boolean;
  path?: string;
  customPath?: string; // User-specified custom path (shown in UI even if not available)
  requiresPty?: boolean; // Whether this agent needs a pseudo-terminal
  configOptions?: AgentConfigOption[]; // Agent-specific configuration
  hidden?: boolean; // If true, agent is hidden from UI (internal use only)
  capabilities: AgentCapabilities; // Agent feature capabilities

  // Argument builders for dynamic CLI construction
  // These are optional - agents that don't have them use hardcoded behavior
  batchModePrefix?: string[]; // Args added before base args for batch mode (e.g., ['run'] for OpenCode)
  batchModeArgs?: string[]; // Args only applied in batch mode (e.g., ['--skip-git-repo-check'] for Codex exec)
  jsonOutputArgs?: string[]; // Args for JSON output format (e.g., ['--format', 'json'])
  resumeArgs?: (sessionId: string) => string[]; // Function to build resume args
  readOnlyArgs?: string[]; // Args for read-only/plan mode (e.g., ['--agent', 'plan'])
  modelArgs?: (modelId: string) => string[]; // Function to build model selection args (e.g., ['--model', modelId])
  yoloModeArgs?: string[]; // Args for YOLO/full-access mode (e.g., ['--dangerously-bypass-approvals-and-sandbox'])
  workingDirArgs?: (dir: string) => string[]; // Function to build working directory args (e.g., ['-C', dir])
}

const AGENT_DEFINITIONS: Omit<AgentConfig, 'available' | 'path' | 'capabilities'>[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    binaryName: 'bash',
    command: 'bash',
    args: [],
    requiresPty: true,
    hidden: true, // Internal agent, not shown in UI
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    binaryName: 'claude',
    command: 'claude',
    // YOLO mode (--dangerously-skip-permissions) is always enabled - Maestro requires it
    args: ['--print', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions'],
    resumeArgs: (sessionId: string) => ['--resume', sessionId], // Resume with session ID
  },
  {
    id: 'codex',
    name: 'Codex',
    binaryName: 'codex',
    command: 'codex',
    // Base args for interactive mode (no flags that are exec-only)
    args: [],
    // Codex CLI argument builders
    // Batch mode: codex exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check [--sandbox read-only] [-C dir] [resume <id>] -- "prompt"
    // Sandbox modes:
    //   - Default (YOLO): --dangerously-bypass-approvals-and-sandbox (full system access, required by Maestro)
    //   - Read-only: --sandbox read-only (can only read files, overrides YOLO)
    batchModePrefix: ['exec'], // Codex uses 'exec' subcommand for batch mode
    batchModeArgs: ['--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check'], // Args only valid on 'exec' subcommand
    jsonOutputArgs: ['--json'], // JSON output format (must come before resume subcommand)
    resumeArgs: (sessionId: string) => ['resume', sessionId], // Resume with session/thread ID
    readOnlyArgs: ['--sandbox', 'read-only'], // Read-only/plan mode
    yoloModeArgs: ['--dangerously-bypass-approvals-and-sandbox'], // Full access mode
    workingDirArgs: (dir: string) => ['-C', dir], // Set working directory
    // Agent-specific configuration options shown in UI
    configOptions: [
      {
        key: 'contextWindow',
        type: 'number',
        label: 'Context Window Size',
        description: 'Maximum context window size in tokens. Required for context usage display. Common values: 128000 (o4-mini), 200000 (o3).',
        default: 200000, // Default for GPT-5.x models
      },
    ],
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    binaryName: 'gemini',
    command: 'gemini',
    args: [],
  },
  {
    id: 'qwen3-coder',
    name: 'Qwen3 Coder',
    binaryName: 'qwen3-coder',
    command: 'qwen3-coder',
    args: [],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    binaryName: 'opencode',
    command: 'opencode',
    args: [], // Base args (none for OpenCode - batch mode uses 'run' subcommand)
    // OpenCode CLI argument builders
    // Batch mode: opencode run --format json [--model provider/model] [--session <id>] [--agent plan] "prompt"
    // Note: 'run' subcommand auto-approves all permissions (YOLO mode is implicit)
    batchModePrefix: ['run'], // OpenCode uses 'run' subcommand for batch mode
    jsonOutputArgs: ['--format', 'json'], // JSON output format
    resumeArgs: (sessionId: string) => ['--session', sessionId], // Resume with session ID
    readOnlyArgs: ['--agent', 'plan'], // Read-only/plan mode
    modelArgs: (modelId: string) => ['--model', modelId], // Model selection (e.g., 'ollama/qwen3:8b')
    yoloModeArgs: ['run'], // 'run' subcommand auto-approves all permissions (YOLO mode is implicit)
    // Agent-specific configuration options shown in UI
    configOptions: [
      {
        key: 'model',
        type: 'text',
        label: 'Model',
        description: 'Model to use (e.g., "ollama/qwen3:8b", "anthropic/claude-sonnet-4-20250514"). Leave empty for default.',
        default: '', // Empty string means use OpenCode's default model
        argBuilder: (value: string) => {
          // Only add --model arg if a model is specified
          if (value && value.trim()) {
            return ['--model', value.trim()];
          }
          return [];
        },
      },
      {
        key: 'contextWindow',
        type: 'number',
        label: 'Context Window Size',
        description: 'Maximum context window size in tokens. Required for context usage display. Varies by model (e.g., 200000 for Claude, 128000 for GPT-4).',
        default: 128000, // Default for common models (GPT-4, etc.)
      },
    ],
  },
  {
    id: 'aider',
    name: 'Aider',
    binaryName: 'aider',
    command: 'aider',
    args: [], // Base args (placeholder - to be configured when implemented)
  },
];

export class AgentDetector {
  private cachedAgents: AgentConfig[] | null = null;
  private detectionInProgress: Promise<AgentConfig[]> | null = null;
  private customPaths: Record<string, string> = {};
  // Cache for model discovery results: agentId -> { models, timestamp }
  private modelCache: Map<string, { models: string[]; timestamp: number }> = new Map();
  // Cache TTL: 5 minutes (model lists don't change frequently)
  private readonly MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

  /**
   * Set custom paths for agents (from user configuration)
   */
  setCustomPaths(paths: Record<string, string>): void {
    this.customPaths = paths;
    // Clear cache when custom paths change
    this.cachedAgents = null;
  }

  /**
   * Get the current custom paths
   */
  getCustomPaths(): Record<string, string> {
    return { ...this.customPaths };
  }

  /**
   * Detect which agents are available on the system
   * Uses promise deduplication to prevent parallel detection when multiple calls arrive simultaneously
   */
  async detectAgents(): Promise<AgentConfig[]> {
    if (this.cachedAgents) {
      return this.cachedAgents;
    }

    // If detection is already in progress, return the same promise to avoid parallel runs
    if (this.detectionInProgress) {
      return this.detectionInProgress;
    }

    // Start detection and track the promise
    this.detectionInProgress = this.doDetectAgents();
    try {
      return await this.detectionInProgress;
    } finally {
      this.detectionInProgress = null;
    }
  }

  /**
   * Internal method that performs the actual agent detection
   */
  private async doDetectAgents(): Promise<AgentConfig[]> {
    const agents: AgentConfig[] = [];
    const expandedEnv = this.getExpandedEnv();

    logger.info(`Agent detection starting. PATH: ${expandedEnv.PATH}`, 'AgentDetector');

    for (const agentDef of AGENT_DEFINITIONS) {
      const customPath = this.customPaths[agentDef.id];
      let detection: { exists: boolean; path?: string };

      // If user has specified a custom path, check that first
      if (customPath) {
        detection = await this.checkCustomPath(customPath);
        if (detection.exists) {
          logger.info(`Agent "${agentDef.name}" found at custom path: ${detection.path}`, 'AgentDetector');
        } else {
          logger.warn(
            `Agent "${agentDef.name}" custom path not valid: ${customPath}`,
            'AgentDetector'
          );
          // Fall back to PATH detection
          detection = await this.checkBinaryExists(agentDef.binaryName);
          if (detection.exists) {
            logger.info(`Agent "${agentDef.name}" found in PATH at: ${detection.path}`, 'AgentDetector');
          }
        }
      } else {
        detection = await this.checkBinaryExists(agentDef.binaryName);

        if (detection.exists) {
          logger.info(`Agent "${agentDef.name}" found at: ${detection.path}`, 'AgentDetector');
        } else if (agentDef.binaryName !== 'bash') {
          // Don't log bash as missing since it's always present, log others as warnings
          logger.warn(
            `Agent "${agentDef.name}" (binary: ${agentDef.binaryName}) not found. ` +
            `Searched in PATH: ${expandedEnv.PATH}`,
            'AgentDetector'
          );
        }
      }

      agents.push({
        ...agentDef,
        available: detection.exists,
        path: detection.path,
        customPath: customPath || undefined,
        capabilities: getAgentCapabilities(agentDef.id),
      });
    }

    const availableAgents = agents.filter(a => a.available).map(a => a.name);
    logger.info(`Agent detection complete. Available: ${availableAgents.join(', ') || 'none'}`, 'AgentDetector');

    this.cachedAgents = agents;
    return agents;
  }

  /**
   * Check if a custom path points to a valid executable
   */
  private async checkCustomPath(customPath: string): Promise<{ exists: boolean; path?: string }> {
    try {
      // Check if file exists
      const stats = await fs.promises.stat(customPath);
      if (!stats.isFile()) {
        return { exists: false };
      }

      // Check if file is executable (on Unix systems)
      if (process.platform !== 'win32') {
        try {
          await fs.promises.access(customPath, fs.constants.X_OK);
        } catch {
          // File exists but is not executable
          logger.warn(`Custom path exists but is not executable: ${customPath}`, 'AgentDetector');
          return { exists: false };
        }
      }

      return { exists: true, path: customPath };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Build an expanded PATH that includes common binary installation locations.
   * This is necessary because packaged Electron apps don't inherit shell environment.
   */
  private getExpandedEnv(): NodeJS.ProcessEnv {
    const home = os.homedir();
    const env = { ...process.env };

    // Standard system paths + common user-installed binary locations
    const additionalPaths = [
      '/opt/homebrew/bin',           // Homebrew on Apple Silicon
      '/opt/homebrew/sbin',
      '/usr/local/bin',              // Homebrew on Intel, common install location
      '/usr/local/sbin',
      `${home}/.local/bin`,          // User local installs (pip, etc.)
      `${home}/.npm-global/bin`,     // npm global with custom prefix
      `${home}/bin`,                 // User bin directory
      `${home}/.claude/local`,       // Sneaky Claude loccation
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ];

    const currentPath = env.PATH || '';
    const pathParts = currentPath.split(':');

    // Add paths that aren't already present
    for (const p of additionalPaths) {
      if (!pathParts.includes(p)) {
        pathParts.unshift(p);
      }
    }

    env.PATH = pathParts.join(':');
    return env;
  }

  /**
   * Check if a binary exists in PATH
   */
  private async checkBinaryExists(binaryName: string): Promise<{ exists: boolean; path?: string }> {
    try {
      // Use 'which' on Unix-like systems, 'where' on Windows
      const command = process.platform === 'win32' ? 'where' : 'which';

      // Use expanded PATH to find binaries in common installation locations
      // This is critical for packaged Electron apps which don't inherit shell env
      const env = this.getExpandedEnv();
      const result = await execFileNoThrow(command, [binaryName], undefined, env);

      if (result.exitCode === 0 && result.stdout.trim()) {
        return {
          exists: true,
          path: result.stdout.trim().split('\n')[0], // First match
        };
      }

      return { exists: false };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(agentId: string): Promise<AgentConfig | null> {
    const agents = await this.detectAgents();
    return agents.find(a => a.id === agentId) || null;
  }

  /**
   * Clear the cache (useful if PATH changes)
   */
  clearCache(): void {
    this.cachedAgents = null;
  }

  /**
   * Clear the model cache for a specific agent or all agents
   */
  clearModelCache(agentId?: string): void {
    if (agentId) {
      this.modelCache.delete(agentId);
    } else {
      this.modelCache.clear();
    }
  }

  /**
   * Discover available models for an agent that supports model selection.
   * Returns cached results if available and not expired.
   *
   * @param agentId - The agent identifier (e.g., 'opencode')
   * @param forceRefresh - If true, bypass cache and fetch fresh model list
   * @returns Array of model names, or empty array if agent doesn't support model discovery
   */
  async discoverModels(agentId: string, forceRefresh = false): Promise<string[]> {
    const agent = await this.getAgent(agentId);

    if (!agent || !agent.available) {
      logger.warn(`Cannot discover models: agent ${agentId} not available`, 'AgentDetector');
      return [];
    }

    // Check if agent supports model selection
    if (!agent.capabilities.supportsModelSelection) {
      logger.debug(`Agent ${agentId} does not support model selection`, 'AgentDetector');
      return [];
    }

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = this.modelCache.get(agentId);
      if (cached && (Date.now() - cached.timestamp) < this.MODEL_CACHE_TTL_MS) {
        logger.debug(`Returning cached models for ${agentId}`, 'AgentDetector');
        return cached.models;
      }
    }

    // Run agent-specific model discovery command
    const models = await this.runModelDiscovery(agentId, agent);

    // Cache the results
    this.modelCache.set(agentId, { models, timestamp: Date.now() });

    return models;
  }

  /**
   * Run the agent-specific model discovery command.
   * Each agent may have a different way to list available models.
   */
  private async runModelDiscovery(agentId: string, agent: AgentConfig): Promise<string[]> {
    const env = this.getExpandedEnv();
    const command = agent.path || agent.command;

    // Agent-specific model discovery commands
    switch (agentId) {
      case 'opencode': {
        // OpenCode: `opencode models` returns one model per line
        const result = await execFileNoThrow(command, ['models'], undefined, env);

        if (result.exitCode !== 0) {
          logger.warn(
            `Model discovery failed for ${agentId}: exit code ${result.exitCode}`,
            'AgentDetector',
            { stderr: result.stderr }
          );
          return [];
        }

        // Parse output: one model per line (e.g., "opencode/gpt-5-nano", "ollama/gpt-oss:latest")
        const models = result.stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);

        logger.info(`Discovered ${models.length} models for ${agentId}`, 'AgentDetector', { models });
        return models;
      }

      default:
        // For agents without model discovery implemented, return empty array
        logger.debug(`No model discovery implemented for ${agentId}`, 'AgentDetector');
        return [];
    }
  }
}

