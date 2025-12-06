import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import { stripControlSequences } from './utils/terminalFilter';

interface ProcessConfig {
  sessionId: string;
  toolType: string;
  cwd: string;
  command: string;
  args: string[];
  requiresPty?: boolean; // Whether this agent needs a pseudo-terminal
  prompt?: string; // For batch mode agents like Claude (passed as CLI argument)
  shell?: string; // Shell to use for terminal sessions (e.g., 'zsh', 'bash', 'fish')
  images?: string[]; // Base64 data URLs for images (passed via stream-json input)
}

interface ManagedProcess {
  sessionId: string;
  toolType: string;
  ptyProcess?: pty.IPty;
  childProcess?: ChildProcess;
  cwd: string;
  pid: number;
  isTerminal: boolean;
  isBatchMode?: boolean; // True for agents that run in batch mode (exit after response)
  isStreamJsonMode?: boolean; // True when using stream-json input/output (for images)
  jsonBuffer?: string; // Buffer for accumulating JSON output in batch mode
  lastCommand?: string; // Last command sent to terminal (for filtering command echoes)
  sessionIdEmitted?: boolean; // True after session_id has been emitted (prevents duplicate emissions)
  resultEmitted?: boolean; // True after result data has been emitted (prevents duplicate emissions)
  startTime: number; // Timestamp when process was spawned
}

/**
 * Parse a data URL and extract base64 data and media type
 */
function parseDataUrl(dataUrl: string): { base64: string; mediaType: string } | null {
  // Format: data:image/png;base64,iVBORw0KGgo...
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mediaType: match[1],
    base64: match[2],
  };
}

/**
 * Build a stream-json message for Claude Code with images and text
 */
function buildStreamJsonMessage(prompt: string, images: string[]): string {
  // Build content array with images first, then text
  const content: Array<{
    type: 'image' | 'text';
    text?: string;
    source?: { type: 'base64'; media_type: string; data: string };
  }> = [];

  // Add images
  for (const dataUrl of images) {
    const parsed = parseDataUrl(dataUrl);
    if (parsed) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsed.mediaType,
          data: parsed.base64,
        },
      });
    }
  }

  // Add text prompt
  content.push({
    type: 'text',
    text: prompt,
  });

  // Build the stream-json message
  const message = {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
  };

  return JSON.stringify(message);
}

export class ProcessManager extends EventEmitter {
  private processes: Map<string, ManagedProcess> = new Map();

  /**
   * Spawn a new process for a session
   */
  spawn(config: ProcessConfig): { pid: number; success: boolean } {
    const { sessionId, toolType, cwd, command, args, requiresPty, prompt, shell, images } = config;

    // For batch mode with images, use stream-json mode and send message via stdin
    // For batch mode without images, append prompt to args with -- separator
    const hasImages = images && images.length > 0;
    let finalArgs: string[];

    if (hasImages && prompt) {
      // For images, add stream-json input format (output format and --verbose already in base args)
      // The prompt will be sent via stdin as a JSON message with image data
      finalArgs = [...args, '--input-format', 'stream-json'];
    } else if (prompt) {
      // Regular batch mode - prompt as CLI arg
      // The -- ensures prompt is treated as positional arg, not a flag (even if it starts with --)
      finalArgs = [...args, '--', prompt];
    } else {
      finalArgs = args;
    }

    console.log('[ProcessManager] spawn() config:', {
      sessionId,
      toolType,
      hasPrompt: !!prompt,
      hasImages,
      promptValue: prompt,
      baseArgs: args,
      finalArgs
    });

    // Determine if this should use a PTY:
    // - If toolType is 'terminal', always use PTY for full shell emulation
    // - If requiresPty is true, use PTY for AI agents that need TTY (like Claude Code)
    // - Batch mode (with prompt) never uses PTY
    const usePty = (toolType === 'terminal' || requiresPty === true) && !prompt;
    const isTerminal = toolType === 'terminal';

    try {
      if (usePty) {
        // Use node-pty for terminal mode or AI agents that require PTY
        let ptyCommand: string;
        let ptyArgs: string[];

        if (isTerminal) {
          // Full shell emulation for terminal mode
          // Use the provided shell, or default based on platform
          if (shell) {
            ptyCommand = shell;
          } else {
            ptyCommand = process.platform === 'win32' ? 'powershell.exe' : 'bash';
          }
          // Use -l (login) AND -i (interactive) flags to spawn a fully configured shell
          // - Login shells source .zprofile/.bash_profile (system-wide PATH additions)
          // - Interactive shells source .zshrc/.bashrc (user customizations, aliases, functions)
          // Both are needed to match the user's regular terminal environment
          ptyArgs = process.platform === 'win32' ? [] : ['-l', '-i'];
        } else {
          // Spawn the AI agent directly with PTY support
          ptyCommand = command;
          ptyArgs = finalArgs;
        }

        // Build environment for PTY process
        // For terminal sessions, pass minimal env with base system PATH.
        // Shell startup files (.zprofile, .zshrc) will prepend user paths (homebrew, go, etc.)
        // We need the base system paths or commands like sort, find, head won't work.
        let ptyEnv: NodeJS.ProcessEnv;
        if (isTerminal) {
          ptyEnv = {
            HOME: process.env.HOME,
            USER: process.env.USER,
            SHELL: process.env.SHELL,
            TERM: 'xterm-256color',
            LANG: process.env.LANG || 'en_US.UTF-8',
            // Provide base system PATH - shell startup files will prepend user paths
            PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
          };
        } else {
          // For AI agents in PTY mode: pass full env (they need NODE_PATH, etc.)
          ptyEnv = process.env;
        }

        const ptyProcess = pty.spawn(ptyCommand, ptyArgs, {
          name: 'xterm-256color',
          cols: 100,
          rows: 30,
          cwd: cwd,
          env: ptyEnv as any,
        });

        const managedProcess: ManagedProcess = {
          sessionId,
          toolType,
          ptyProcess,
          cwd,
          pid: ptyProcess.pid,
          isTerminal: true,
          startTime: Date.now(),
        };

        this.processes.set(sessionId, managedProcess);

        // Handle output
        ptyProcess.onData((data) => {
          // Strip terminal control sequences and filter prompts/echoes
          const managedProc = this.processes.get(sessionId);
          const cleanedData = stripControlSequences(data, managedProc?.lastCommand, isTerminal);
          console.log(`[ProcessManager] PTY onData for session ${sessionId} (PID ${ptyProcess.pid}):`, cleanedData.substring(0, 100));
          // Only emit if there's actual content after filtering
          if (cleanedData.trim()) {
            this.emit('data', sessionId, cleanedData);
          }
        });

        ptyProcess.onExit(({ exitCode }) => {
          console.log(`[ProcessManager] PTY onExit for session ${sessionId}:`, exitCode);
          this.emit('exit', sessionId, exitCode);
          this.processes.delete(sessionId);
        });

        console.log(`[ProcessManager] PTY process created:`, {
          sessionId,
          toolType,
          isTerminal,
          requiresPty: requiresPty || false,
          pid: ptyProcess.pid,
          command: ptyCommand,
          args: ptyArgs,
          cwd
        });

        return { pid: ptyProcess.pid, success: true };
      } else {
        // Use regular child_process for AI tools (including batch mode)

        // Fix PATH for Electron environment
        // Electron's main process may have a limited PATH that doesn't include
        // user-installed binaries like node, which is needed for #!/usr/bin/env node scripts
        const env = { ...process.env };
        const standardPaths = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
        if (env.PATH) {
          // Prepend standard paths if not already present
          if (!env.PATH.includes('/opt/homebrew/bin')) {
            env.PATH = `${standardPaths}:${env.PATH}`;
          }
        } else {
          env.PATH = standardPaths;
        }

        console.log('[ProcessManager] About to spawn child process:', {
          command,
          finalArgs,
          cwd,
          PATH: env.PATH?.substring(0, 150),
          hasStdio: 'default (pipe)'
        });

        const childProcess = spawn(command, finalArgs, {
          cwd,
          env,
          shell: false, // Explicitly disable shell to prevent injection
          stdio: ['pipe', 'pipe', 'pipe'], // Explicitly set stdio to pipe
        });

        console.log('[ProcessManager] Child process spawned:', {
          pid: childProcess.pid,
          hasStdout: !!childProcess.stdout,
          hasStderr: !!childProcess.stderr,
          hasStdin: !!childProcess.stdin,
          killed: childProcess.killed,
          exitCode: childProcess.exitCode
        });

        const isBatchMode = !!prompt;
        // Detect stream-json mode from args (now default for Claude Code) or when images are present
        const isStreamJsonMode = finalArgs.includes('stream-json') || (hasImages && !!prompt);

        const managedProcess: ManagedProcess = {
          sessionId,
          toolType,
          childProcess,
          cwd,
          pid: childProcess.pid || -1,
          isTerminal: false,
          isBatchMode,
          isStreamJsonMode,
          jsonBuffer: isBatchMode ? '' : undefined,
          startTime: Date.now(),
        };

        this.processes.set(sessionId, managedProcess);

        console.log('[ProcessManager] Setting up stdout/stderr/exit handlers for session:', sessionId);
        console.log('[ProcessManager] childProcess.stdout:', childProcess.stdout ? 'exists' : 'null');
        console.log('[ProcessManager] childProcess.stderr:', childProcess.stderr ? 'exists' : 'null');

        // Handle stdout
        if (childProcess.stdout) {
          console.log('[ProcessManager] Attaching stdout data listener...');
          childProcess.stdout.setEncoding('utf8'); // Ensure proper encoding
          childProcess.stdout.on('error', (err) => {
            console.error('[ProcessManager] stdout error:', err);
          });
          childProcess.stdout.on('data', (data: Buffer | string) => {
          const output = data.toString();

          if (isStreamJsonMode) {
            // In stream-json mode, each line is a JSONL message
            // Accumulate and process complete lines
            managedProcess.jsonBuffer = (managedProcess.jsonBuffer || '') + output;

            // Process complete lines
            const lines = managedProcess.jsonBuffer.split('\n');
            // Keep the last incomplete line in the buffer
            managedProcess.jsonBuffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const msg = JSON.parse(line);
                // Handle different message types from stream-json output
                // Policy: Use 'result' for complete response, skip 'assistant' streaming messages
                // This gives us the final complete response rather than incremental chunks
                // Only emit once per process to prevent duplicates
                if (msg.type === 'result' && msg.result && !managedProcess.resultEmitted) {
                  managedProcess.resultEmitted = true;
                  console.log(`[ProcessManager] Emitting result data for session ${sessionId}, length: ${msg.result.length}`);
                  this.emit('data', sessionId, msg.result);
                }
                // Skip 'assistant' type - we prefer the complete 'result' over streaming chunks
                // Capture session_id from the first message only (prevents duplicate emissions)
                // Claude includes session_id in every message, but we only want to emit once
                if (msg.session_id && !managedProcess.sessionIdEmitted) {
                  managedProcess.sessionIdEmitted = true;
                  this.emit('session-id', sessionId, msg.session_id);
                }
                // Extract slash commands from init message
                // Claude Code emits available slash commands (built-in + user-defined) in the init message
                if (msg.type === 'system' && msg.subtype === 'init' && msg.slash_commands) {
                  this.emit('slash-commands', sessionId, msg.slash_commands);
                }
                // Extract usage statistics from stream-json messages (typically in 'result' type)
                // Note: We need to aggregate token counts from modelUsage for accurate context window tracking
                if (msg.modelUsage || msg.usage || msg.total_cost_usd !== undefined) {
                  const usage = msg.usage || {};

                  // Aggregate token counts from modelUsage for accurate context tracking
                  let aggregatedInputTokens = 0;
                  let aggregatedOutputTokens = 0;
                  let aggregatedCacheReadTokens = 0;
                  let aggregatedCacheCreationTokens = 0;
                  let contextWindow = 200000; // Default for Claude

                  if (msg.modelUsage) {
                    for (const modelStats of Object.values(msg.modelUsage) as any[]) {
                      aggregatedInputTokens += modelStats.inputTokens || 0;
                      aggregatedOutputTokens += modelStats.outputTokens || 0;
                      aggregatedCacheReadTokens += modelStats.cacheReadInputTokens || 0;
                      aggregatedCacheCreationTokens += modelStats.cacheCreationInputTokens || 0;
                      if (modelStats.contextWindow && modelStats.contextWindow > contextWindow) {
                        contextWindow = modelStats.contextWindow;
                      }
                    }
                  }

                  // Fall back to top-level usage if modelUsage isn't available
                  if (aggregatedInputTokens === 0 && aggregatedOutputTokens === 0) {
                    aggregatedInputTokens = usage.input_tokens || 0;
                    aggregatedOutputTokens = usage.output_tokens || 0;
                    aggregatedCacheReadTokens = usage.cache_read_input_tokens || 0;
                    aggregatedCacheCreationTokens = usage.cache_creation_input_tokens || 0;
                  }

                  const usageStats = {
                    inputTokens: aggregatedInputTokens,
                    outputTokens: aggregatedOutputTokens,
                    cacheReadInputTokens: aggregatedCacheReadTokens,
                    cacheCreationInputTokens: aggregatedCacheCreationTokens,
                    totalCostUsd: msg.total_cost_usd || 0,
                    contextWindow
                  };

                  this.emit('usage', sessionId, usageStats);
                }
              } catch (e) {
                // If it's not valid JSON, emit as raw text
                this.emit('data', sessionId, line);
              }
            }
          } else if (isBatchMode) {
            // In regular batch mode, accumulate JSON output
            managedProcess.jsonBuffer = (managedProcess.jsonBuffer || '') + output;
            console.log('[ProcessManager] Accumulated JSON buffer length:', managedProcess.jsonBuffer.length);
          } else {
            // In interactive mode, emit data immediately
            this.emit('data', sessionId, output);
          }
          });
        } else {
          console.log('[ProcessManager] WARNING: childProcess.stdout is null!');
        }

        // Handle stderr
        if (childProcess.stderr) {
          console.log('[ProcessManager] Attaching stderr data listener...');
          childProcess.stderr.setEncoding('utf8');
          childProcess.stderr.on('error', (err) => {
            console.error('[ProcessManager] stderr error:', err);
          });
          childProcess.stderr.on('data', (data: Buffer | string) => {
            console.log('[ProcessManager] >>> STDERR EVENT FIRED <<<', data.toString().substring(0, 100));
            this.emit('data', sessionId, `[stderr] ${data.toString()}`);
          });
        }

        // Handle exit
        childProcess.on('exit', (code) => {
          console.log('[ProcessManager] Child process exit event:', {
            sessionId,
            code,
            isBatchMode,
            isStreamJsonMode,
            jsonBufferLength: managedProcess.jsonBuffer?.length || 0,
            jsonBufferPreview: managedProcess.jsonBuffer?.substring(0, 200)
          });
          if (isBatchMode && !isStreamJsonMode && managedProcess.jsonBuffer) {
            // Parse JSON response from regular batch mode (not stream-json)
            try {
              const jsonResponse = JSON.parse(managedProcess.jsonBuffer);

              // Emit the result text (only once per process)
              if (jsonResponse.result && !managedProcess.resultEmitted) {
                managedProcess.resultEmitted = true;
                this.emit('data', sessionId, jsonResponse.result);
              }

              // Emit session_id if present (only once per process)
              if (jsonResponse.session_id && !managedProcess.sessionIdEmitted) {
                managedProcess.sessionIdEmitted = true;
                this.emit('session-id', sessionId, jsonResponse.session_id);
              }

              // Extract and emit usage statistics
              // Note: We need to aggregate token counts from modelUsage for accurate context window tracking
              // The top-level usage object shows billable/new tokens, not total context tokens
              if (jsonResponse.modelUsage || jsonResponse.usage || jsonResponse.total_cost_usd !== undefined) {
                const usage = jsonResponse.usage || {};

                // Aggregate token counts from modelUsage for accurate context tracking
                // modelUsage contains per-model breakdown with actual context tokens (including cache hits)
                let aggregatedInputTokens = 0;
                let aggregatedOutputTokens = 0;
                let aggregatedCacheReadTokens = 0;
                let aggregatedCacheCreationTokens = 0;
                let contextWindow = 200000; // Default for Claude

                if (jsonResponse.modelUsage) {
                  for (const modelStats of Object.values(jsonResponse.modelUsage) as any[]) {
                    // inputTokens in modelUsage includes the full context (not just new tokens)
                    aggregatedInputTokens += modelStats.inputTokens || 0;
                    aggregatedOutputTokens += modelStats.outputTokens || 0;
                    aggregatedCacheReadTokens += modelStats.cacheReadInputTokens || 0;
                    aggregatedCacheCreationTokens += modelStats.cacheCreationInputTokens || 0;
                    // Use the highest context window from any model
                    if (modelStats.contextWindow && modelStats.contextWindow > contextWindow) {
                      contextWindow = modelStats.contextWindow;
                    }
                  }
                }

                // Fall back to top-level usage if modelUsage isn't available
                // This handles older CLI versions or different output formats
                if (aggregatedInputTokens === 0 && aggregatedOutputTokens === 0) {
                  aggregatedInputTokens = usage.input_tokens || 0;
                  aggregatedOutputTokens = usage.output_tokens || 0;
                  aggregatedCacheReadTokens = usage.cache_read_input_tokens || 0;
                  aggregatedCacheCreationTokens = usage.cache_creation_input_tokens || 0;
                }

                const usageStats = {
                  inputTokens: aggregatedInputTokens,
                  outputTokens: aggregatedOutputTokens,
                  cacheReadInputTokens: aggregatedCacheReadTokens,
                  cacheCreationInputTokens: aggregatedCacheCreationTokens,
                  totalCostUsd: jsonResponse.total_cost_usd || 0,
                  contextWindow
                };

                this.emit('usage', sessionId, usageStats);
              }
            } catch (error) {
              console.error('[ProcessManager] Failed to parse JSON response:', error);
              // Emit raw buffer as fallback
              this.emit('data', sessionId, managedProcess.jsonBuffer);
            }
          }

          this.emit('exit', sessionId, code || 0);
          this.processes.delete(sessionId);
        });

        childProcess.on('error', (error) => {
          this.emit('data', sessionId, `[error] ${error.message}`);
          this.processes.delete(sessionId);
        });

        // Handle stdin for batch mode
        if (isStreamJsonMode && prompt && images) {
          // Stream-json mode with images: send the message via stdin
          const streamJsonMessage = buildStreamJsonMessage(prompt, images);
          console.log('[ProcessManager] Sending stream-json message with images:', {
            sessionId,
            messageLength: streamJsonMessage.length,
            imageCount: images.length
          });
          childProcess.stdin?.write(streamJsonMessage + '\n');
          childProcess.stdin?.end(); // Signal end of input
        } else if (isBatchMode) {
          // Regular batch mode: close stdin immediately since prompt is passed as CLI arg
          // Some CLIs wait for stdin to close before processing
          console.log('[ProcessManager] Closing stdin for batch mode (prompt passed as CLI arg)');
          childProcess.stdin?.end();
        }

        return { pid: childProcess.pid || -1, success: true };
      }
    } catch (error: any) {
      console.error('Failed to spawn process:', error);
      return { pid: -1, success: false };
    }
  }

  /**
   * Write data to a process's stdin
   */
  write(sessionId: string, data: string): boolean {
    const process = this.processes.get(sessionId);
    if (!process) {
      console.error(`[ProcessManager] write() - No process found for session: ${sessionId}`);
      return false;
    }

    console.log('[ProcessManager] write() - Process info:', {
      sessionId,
      toolType: process.toolType,
      isTerminal: process.isTerminal,
      pid: process.pid,
      hasPtyProcess: !!process.ptyProcess,
      hasChildProcess: !!process.childProcess,
      hasStdin: !!process.childProcess?.stdin,
      dataLength: data.length,
      dataPreview: data.substring(0, 50)
    });

    try {
      if (process.isTerminal && process.ptyProcess) {
        console.log(`[ProcessManager] Writing to PTY process (PID ${process.pid})`);
        // Track the command for filtering echoes (remove trailing newline for comparison)
        const command = data.replace(/\r?\n$/, '');
        if (command.trim()) {
          process.lastCommand = command.trim();
        }
        process.ptyProcess.write(data);
        return true;
      } else if (process.childProcess?.stdin) {
        console.log(`[ProcessManager] Writing to child process stdin (PID ${process.pid})`);
        process.childProcess.stdin.write(data);
        return true;
      }
      console.error(`[ProcessManager] No valid input stream for session: ${sessionId}`);
      return false;
    } catch (error) {
      console.error('Failed to write to process:', error);
      return false;
    }
  }

  /**
   * Resize terminal (for pty processes)
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const process = this.processes.get(sessionId);
    if (!process || !process.isTerminal || !process.ptyProcess) return false;

    try {
      process.ptyProcess.resize(cols, rows);
      return true;
    } catch (error) {
      console.error('Failed to resize terminal:', error);
      return false;
    }
  }

  /**
   * Send interrupt signal (SIGINT/Ctrl+C) to a process
   * This attempts a graceful interrupt first, like pressing Ctrl+C
   */
  interrupt(sessionId: string): boolean {
    const process = this.processes.get(sessionId);
    if (!process) {
      console.error(`[ProcessManager] interrupt() - No process found for session: ${sessionId}`);
      return false;
    }

    try {
      if (process.isTerminal && process.ptyProcess) {
        // For PTY processes, send Ctrl+C character
        console.log(`[ProcessManager] Sending Ctrl+C to PTY process (PID ${process.pid})`);
        process.ptyProcess.write('\x03'); // Ctrl+C
        return true;
      } else if (process.childProcess) {
        // For child processes, send SIGINT signal
        console.log(`[ProcessManager] Sending SIGINT to child process (PID ${process.pid})`);
        process.childProcess.kill('SIGINT');
        return true;
      }
      console.error(`[ProcessManager] No valid process to interrupt for session: ${sessionId}`);
      return false;
    } catch (error) {
      console.error('Failed to interrupt process:', error);
      return false;
    }
  }

  /**
   * Kill a specific process
   */
  kill(sessionId: string): boolean {
    const process = this.processes.get(sessionId);
    if (!process) return false;

    try {
      if (process.isTerminal && process.ptyProcess) {
        process.ptyProcess.kill();
      } else if (process.childProcess) {
        process.childProcess.kill('SIGTERM');
      }
      this.processes.delete(sessionId);
      return true;
    } catch (error) {
      console.error('Failed to kill process:', error);
      return false;
    }
  }

  /**
   * Kill all managed processes
   */
  killAll(): void {
    for (const [sessionId] of this.processes) {
      this.kill(sessionId);
    }
  }

  /**
   * Get all active processes
   */
  getAll(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get a specific process
   */
  get(sessionId: string): ManagedProcess | undefined {
    return this.processes.get(sessionId);
  }

  /**
   * Run a single command and capture stdout/stderr cleanly
   * This does NOT use PTY - it spawns the command directly via shell -c
   * and captures only the command output without prompts or echoes.
   *
   * @param sessionId - Session ID for event emission
   * @param command - The shell command to execute
   * @param cwd - Working directory
   * @param shell - Shell to use (default: bash)
   * @returns Promise that resolves when command completes
   */
  runCommand(
    sessionId: string,
    command: string,
    cwd: string,
    shell: string = 'bash'
  ): Promise<{ exitCode: number }> {
    return new Promise((resolve) => {
      console.log('[ProcessManager] runCommand():', { sessionId, command, cwd, shell });

      // Build the command with shell config sourcing
      // This ensures PATH, aliases, and functions are available
      const shellName = shell.split('/').pop() || shell;
      let wrappedCommand: string;

      if (shellName === 'fish') {
        // Fish auto-sources config.fish, just run the command
        wrappedCommand = command;
      } else if (shellName === 'zsh') {
        // Source both .zprofile (login shell - PATH setup) and .zshrc (interactive - aliases, functions)
        // This matches what a login interactive shell does (zsh -l -i)
        // Without eval, the shell parses the command before configs are sourced, so aliases aren't available
        const escapedCommand = command.replace(/'/g, "'\\''");
        wrappedCommand = `source ~/.zprofile 2>/dev/null; source ~/.zshrc 2>/dev/null; eval '${escapedCommand}'`;
      } else if (shellName === 'bash') {
        // Source both .bash_profile (login shell) and .bashrc (interactive)
        const escapedCommand = command.replace(/'/g, "'\\''");
        wrappedCommand = `source ~/.bash_profile 2>/dev/null; source ~/.bashrc 2>/dev/null; eval '${escapedCommand}'`;
      } else {
        // Other POSIX-compatible shells
        wrappedCommand = command;
      }

      // Pass minimal environment with a base PATH for essential system commands.
      // Shell startup files (.zprofile, .zshrc) will prepend user paths to this.
      // We need the base system paths or commands like sort, find, head won't work.
      const env: NodeJS.ProcessEnv = {
        HOME: process.env.HOME,
        USER: process.env.USER,
        SHELL: process.env.SHELL,
        TERM: 'xterm-256color',
        LANG: process.env.LANG || 'en_US.UTF-8',
        // Provide base system PATH - shell startup files will prepend user paths (homebrew, go, etc.)
        PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      };

      // Resolve shell to full path - Electron's internal PATH may not include /bin
      // where common shells like zsh and bash are located
      let shellPath = shell;
      if (!shell.includes('/')) {
        const fs = require('fs');
        const commonPaths = ['/bin/', '/usr/bin/', '/usr/local/bin/', '/opt/homebrew/bin/'];
        for (const prefix of commonPaths) {
          try {
            fs.accessSync(prefix + shell, fs.constants.X_OK);
            shellPath = prefix + shell;
            break;
          } catch {
            // Try next path
          }
        }
      }

      console.log('[ProcessManager] runCommand spawning:', { shell, shellPath, wrappedCommand, cwd, PATH: env.PATH?.substring(0, 100) });

      const childProcess = spawn(wrappedCommand, [], {
        cwd,
        env,
        shell: shellPath, // Use resolved full path to shell
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Handle stdout - emit data events for real-time streaming
      childProcess.stdout?.on('data', (data: Buffer) => {
        let output = data.toString();
        console.log('[ProcessManager] runCommand stdout RAW:', { sessionId, rawLength: output.length, raw: output.substring(0, 200) });

        // Filter out shell integration sequences that may appear in interactive shells
        // These include iTerm2, VSCode, and other terminal emulator integration markers
        // Format: ]1337;..., ]133;..., ]7;... (with or without ESC prefix)
        output = output.replace(/\x1b?\]1337;[^\x07\x1b\n]*(\x07|\x1b\\)?/g, '');
        output = output.replace(/\x1b?\]133;[^\x07\x1b\n]*(\x07|\x1b\\)?/g, '');
        output = output.replace(/\x1b?\]7;[^\x07\x1b\n]*(\x07|\x1b\\)?/g, '');
        // Remove OSC sequences for window title, etc.
        output = output.replace(/\x1b?\][0-9];[^\x07\x1b\n]*(\x07|\x1b\\)?/g, '');

        console.log('[ProcessManager] runCommand stdout FILTERED:', { sessionId, filteredLength: output.length, filtered: output.substring(0, 200), trimmedEmpty: !output.trim() });

        // Only emit if there's actual content after filtering
        if (output.trim()) {
          stdoutBuffer += output;
          console.log('[ProcessManager] runCommand EMITTING data event:', { sessionId, outputLength: output.length });
          this.emit('data', sessionId, output);
        } else {
          console.log('[ProcessManager] runCommand SKIPPED emit (empty after trim):', { sessionId });
        }
      });

      // Handle stderr - emit with [stderr] prefix for differentiation
      childProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderrBuffer += output;
        // Emit stderr with prefix so renderer can style it differently
        this.emit('stderr', sessionId, output);
      });

      // Handle process exit
      childProcess.on('exit', (code) => {
        console.log('[ProcessManager] runCommand exit:', { sessionId, exitCode: code });
        this.emit('command-exit', sessionId, code || 0);
        resolve({ exitCode: code || 0 });
      });

      // Handle errors (e.g., spawn failures)
      childProcess.on('error', (error) => {
        console.error('[ProcessManager] runCommand error:', error);
        this.emit('stderr', sessionId, `Error: ${error.message}`);
        this.emit('command-exit', sessionId, 1);
        resolve({ exitCode: 1 });
      });
    });
  }
}
