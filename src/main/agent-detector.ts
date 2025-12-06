import { execFileNoThrow } from './utils/execFile';
import { logger } from './utils/logger';
import * as os from 'os';
import * as fs from 'fs';

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
  args: string[]; // Base args always included
  available: boolean;
  path?: string;
  customPath?: string; // User-specified custom path (shown in UI even if not available)
  requiresPty?: boolean; // Whether this agent needs a pseudo-terminal
  configOptions?: AgentConfigOption[]; // Agent-specific configuration
  hidden?: boolean; // If true, agent is hidden from UI (internal use only)
}

const AGENT_DEFINITIONS: Omit<AgentConfig, 'available' | 'path'>[] = [
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
  },
  {
    id: 'openai-codex',
    name: 'OpenAI Codex',
    binaryName: 'codex',
    command: 'codex',
    args: [],
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
];

export class AgentDetector {
  private cachedAgents: AgentConfig[] | null = null;
  private detectionInProgress: Promise<AgentConfig[]> | null = null;
  private customPaths: Record<string, string> = {};

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
}

