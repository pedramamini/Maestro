// Agent spawner service for CLI
// Spawns Claude Code and parses its output

import { spawn, SpawnOptions } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import type { UsageStats } from '../../shared/types';

// Claude Code command and arguments (same as Electron app)
const CLAUDE_COMMAND = 'claude';
const CLAUDE_ARGS = ['--print', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions'];

// Result from spawning an agent
export interface AgentResult {
  success: boolean;
  response?: string;
  claudeSessionId?: string;
  usageStats?: UsageStats;
  error?: string;
}

/**
 * Build an expanded PATH that includes common binary installation locations
 */
function getExpandedPath(): string {
  const home = os.homedir();
  const additionalPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    `${home}/.local/bin`,
    `${home}/.npm-global/bin`,
    `${home}/bin`,
    `${home}/.claude/local`,
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];

  const currentPath = process.env.PATH || '';
  const pathParts = currentPath.split(':');

  for (const p of additionalPaths) {
    if (!pathParts.includes(p)) {
      pathParts.unshift(p);
    }
  }

  return pathParts.join(':');
}

/**
 * Check if Claude Code is available
 */
export async function detectClaude(): Promise<{ available: boolean; path?: string }> {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: getExpandedPath() };

    const which = spawn('which', [CLAUDE_COMMAND], { env });
    let stdout = '';

    which.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    which.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve({ available: true, path: stdout.trim() });
      } else {
        resolve({ available: false });
      }
    });

    which.on('error', () => {
      resolve({ available: false });
    });
  });
}

/**
 * Spawn Claude Code with a prompt and return the result
 */
export async function spawnAgent(
  cwd: string,
  prompt: string,
  claudeSessionId?: string
): Promise<AgentResult> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: getExpandedPath(),
    };

    // Build args: base args + optional resume + prompt
    const args = [...CLAUDE_ARGS];

    if (claudeSessionId) {
      args.push('--resume', claudeSessionId);
    }

    // Add prompt as positional argument
    args.push('--', prompt);

    const options: SpawnOptions = {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    const child = spawn(CLAUDE_COMMAND, args, options);

    let jsonBuffer = '';
    let result: string | undefined;
    let sessionId: string | undefined;
    let usageStats: UsageStats | undefined;
    let resultEmitted = false;
    let sessionIdEmitted = false;

    // Handle stdout - parse stream-json format
    child.stdout?.on('data', (data: Buffer) => {
      jsonBuffer += data.toString();

      // Process complete lines
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const msg = JSON.parse(line);

          // Capture result (only once)
          if (msg.type === 'result' && msg.result && !resultEmitted) {
            resultEmitted = true;
            result = msg.result;
          }

          // Capture session_id (only once)
          if (msg.session_id && !sessionIdEmitted) {
            sessionIdEmitted = true;
            sessionId = msg.session_id;
          }

          // Extract usage statistics
          if (msg.modelUsage || msg.usage || msg.total_cost_usd !== undefined) {
            const usage = msg.usage || {};

            let aggregatedInputTokens = 0;
            let aggregatedOutputTokens = 0;
            let aggregatedCacheReadTokens = 0;
            let aggregatedCacheCreationTokens = 0;
            let contextWindow = 200000;

            if (msg.modelUsage) {
              for (const modelStats of Object.values(msg.modelUsage) as Record<string, number>[]) {
                aggregatedInputTokens += modelStats.inputTokens || 0;
                aggregatedOutputTokens += modelStats.outputTokens || 0;
                aggregatedCacheReadTokens += modelStats.cacheReadInputTokens || 0;
                aggregatedCacheCreationTokens += modelStats.cacheCreationInputTokens || 0;
                if (modelStats.contextWindow && modelStats.contextWindow > contextWindow) {
                  contextWindow = modelStats.contextWindow;
                }
              }
            }

            if (aggregatedInputTokens === 0 && aggregatedOutputTokens === 0) {
              aggregatedInputTokens = usage.input_tokens || 0;
              aggregatedOutputTokens = usage.output_tokens || 0;
              aggregatedCacheReadTokens = usage.cache_read_input_tokens || 0;
              aggregatedCacheCreationTokens = usage.cache_creation_input_tokens || 0;
            }

            usageStats = {
              inputTokens: aggregatedInputTokens,
              outputTokens: aggregatedOutputTokens,
              cacheReadInputTokens: aggregatedCacheReadTokens,
              cacheCreationInputTokens: aggregatedCacheCreationTokens,
              totalCostUsd: msg.total_cost_usd || 0,
              contextWindow,
            };
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    });

    // Collect stderr for error reporting
    let stderr = '';
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Close stdin immediately
    child.stdin?.end();

    // Handle completion
    child.on('close', (code) => {
      if (code === 0 && result) {
        resolve({
          success: true,
          response: result,
          claudeSessionId: sessionId,
          usageStats,
        });
      } else {
        resolve({
          success: false,
          error: stderr || `Process exited with code ${code}`,
          claudeSessionId: sessionId,
          usageStats,
        });
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        error: `Failed to spawn Claude: ${error.message}`,
      });
    });
  });
}

/**
 * Read a markdown document and count unchecked tasks
 */
export function readDocAndCountTasks(folderPath: string, filename: string): { content: string; taskCount: number } {
  const filePath = `${folderPath}/${filename}.md`;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(/^[\s]*-\s*\[\s*\]\s*.+$/gm);
    return {
      content,
      taskCount: matches ? matches.length : 0,
    };
  } catch (error) {
    return { content: '', taskCount: 0 };
  }
}

/**
 * Uncheck all markdown checkboxes in content (for reset-on-completion)
 */
export function uncheckAllTasks(content: string): string {
  return content.replace(/^(\s*-\s*)\[x\]/gim, '$1[ ]');
}

/**
 * Write content to a document
 */
export function writeDoc(folderPath: string, filename: string, content: string): void {
  const filePath = `${folderPath}/${filename}`;
  fs.writeFileSync(filePath, content, 'utf-8');
}
