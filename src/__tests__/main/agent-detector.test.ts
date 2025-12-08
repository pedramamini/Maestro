import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentDetector, AgentConfig, AgentConfigOption } from '../../main/agent-detector';

// Mock dependencies
vi.mock('../../main/utils/execFile', () => ({
  execFileNoThrow: vi.fn(),
}));

vi.mock('../../main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Get mocked modules
import { execFileNoThrow } from '../../main/utils/execFile';
import { logger } from '../../main/utils/logger';
import * as fs from 'fs';
import * as os from 'os';

describe('agent-detector', () => {
  let detector: AgentDetector;
  const mockExecFileNoThrow = vi.mocked(execFileNoThrow);

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new AgentDetector();
    // Default: no binaries found
    mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Type exports', () => {
    it('should export AgentConfigOption interface', () => {
      const option: AgentConfigOption = {
        key: 'test',
        type: 'checkbox',
        label: 'Test',
        description: 'Test description',
        default: false,
      };
      expect(option.key).toBe('test');
      expect(option.type).toBe('checkbox');
    });

    it('should export AgentConfig interface', () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        binaryName: 'test',
        command: 'test',
        args: ['--flag'],
        available: true,
        path: '/usr/bin/test',
      };
      expect(config.id).toBe('test-agent');
      expect(config.available).toBe(true);
    });

    it('should support optional AgentConfig fields', () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        binaryName: 'test',
        command: 'test',
        args: [],
        available: false,
        customPath: '/custom/path',
        requiresPty: true,
        configOptions: [{ key: 'k', type: 'text', label: 'L', description: 'D', default: '' }],
        hidden: true,
      };
      expect(config.customPath).toBe('/custom/path');
      expect(config.requiresPty).toBe(true);
      expect(config.hidden).toBe(true);
    });

    it('should support select type with options in AgentConfigOption', () => {
      const option: AgentConfigOption = {
        key: 'theme',
        type: 'select',
        label: 'Theme',
        description: 'Select theme',
        default: 'dark',
        options: ['dark', 'light'],
      };
      expect(option.options).toEqual(['dark', 'light']);
    });

    it('should support argBuilder function in AgentConfigOption', () => {
      const option: AgentConfigOption = {
        key: 'verbose',
        type: 'checkbox',
        label: 'Verbose',
        description: 'Enable verbose',
        default: false,
        argBuilder: (value: boolean) => value ? ['--verbose'] : [],
      };
      expect(option.argBuilder!(true)).toEqual(['--verbose']);
      expect(option.argBuilder!(false)).toEqual([]);
    });
  });

  describe('setCustomPaths', () => {
    it('should set custom paths', () => {
      detector.setCustomPaths({ 'claude-code': '/custom/claude' });
      expect(detector.getCustomPaths()).toEqual({ 'claude-code': '/custom/claude' });
    });

    it('should override previous custom paths', () => {
      detector.setCustomPaths({ 'claude-code': '/first' });
      detector.setCustomPaths({ 'openai-codex': '/second' });
      expect(detector.getCustomPaths()).toEqual({ 'openai-codex': '/second' });
    });

    it('should clear cache when paths are set', async () => {
      // First detection - cache the result
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/bash\n', stderr: '', exitCode: 0 });
      await detector.detectAgents();
      const initialCallCount = mockExecFileNoThrow.mock.calls.length;

      // Set custom paths - should clear cache
      detector.setCustomPaths({ 'claude-code': '/custom/claude' });

      // Detect again - should re-detect since cache was cleared
      await detector.detectAgents();
      expect(mockExecFileNoThrow.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('getCustomPaths', () => {
    it('should return empty object initially', () => {
      expect(detector.getCustomPaths()).toEqual({});
    });

    it('should return a copy of custom paths', () => {
      detector.setCustomPaths({ 'claude-code': '/custom/claude' });
      const paths1 = detector.getCustomPaths();
      const paths2 = detector.getCustomPaths();
      expect(paths1).toEqual(paths2);
      expect(paths1).not.toBe(paths2); // Different object references
    });

    it('should not be affected by modifications to returned object', () => {
      detector.setCustomPaths({ 'claude-code': '/original' });
      const paths = detector.getCustomPaths();
      paths['claude-code'] = '/modified';
      expect(detector.getCustomPaths()['claude-code']).toBe('/original');
    });
  });

  describe('detectAgents', () => {
    it('should return cached agents on subsequent calls', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/bash\n', stderr: '', exitCode: 0 });

      const result1 = await detector.detectAgents();
      const callCount = mockExecFileNoThrow.mock.calls.length;

      const result2 = await detector.detectAgents();
      expect(result2).toBe(result1); // Same reference
      expect(mockExecFileNoThrow.mock.calls.length).toBe(callCount); // No additional calls
    });

    it('should detect all defined agent types', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/found\n', stderr: '', exitCode: 0 });

      const agents = await detector.detectAgents();

      // Should have all 5 agents
      expect(agents.length).toBe(5);

      const agentIds = agents.map(a => a.id);
      expect(agentIds).toContain('terminal');
      expect(agentIds).toContain('claude-code');
      expect(agentIds).toContain('openai-codex');
      expect(agentIds).toContain('gemini-cli');
      expect(agentIds).toContain('qwen3-coder');
    });

    it('should mark agents as available when binary is found', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 });

      const agents = await detector.detectAgents();
      const claudeAgent = agents.find(a => a.id === 'claude-code');

      expect(claudeAgent?.available).toBe(true);
      expect(claudeAgent?.path).toBe('/usr/bin/claude');
    });

    it('should mark agents as unavailable when binary is not found', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: 'not found', exitCode: 1 });

      const agents = await detector.detectAgents();
      const codexAgent = agents.find(a => a.id === 'openai-codex');

      expect(codexAgent?.available).toBe(false);
      expect(codexAgent?.path).toBeUndefined();
    });

    it('should handle mixed availability', async () => {
      mockExecFileNoThrow.mockImplementation(async (cmd, args) => {
        const binaryName = args[0];
        if (binaryName === 'bash' || binaryName === 'claude') {
          return { stdout: `/usr/bin/${binaryName}\n`, stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: 'not found', exitCode: 1 };
      });

      const agents = await detector.detectAgents();

      expect(agents.find(a => a.id === 'terminal')?.available).toBe(true);
      expect(agents.find(a => a.id === 'claude-code')?.available).toBe(true);
      expect(agents.find(a => a.id === 'openai-codex')?.available).toBe(false);
    });

    it('should use deduplication for parallel calls', async () => {
      let callCount = 0;
      mockExecFileNoThrow.mockImplementation(async () => {
        callCount++;
        // Simulate slow detection
        await new Promise(resolve => setTimeout(resolve, 50));
        return { stdout: '/usr/bin/found\n', stderr: '', exitCode: 0 };
      });

      // Start multiple detections simultaneously
      const promises = [
        detector.detectAgents(),
        detector.detectAgents(),
        detector.detectAgents(),
      ];

      const results = await Promise.all(promises);

      // All should return the same result (same reference)
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });

    it('should include agent metadata', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 });

      const agents = await detector.detectAgents();
      const claudeAgent = agents.find(a => a.id === 'claude-code');

      expect(claudeAgent?.name).toBe('Claude Code');
      expect(claudeAgent?.binaryName).toBe('claude');
      expect(claudeAgent?.command).toBe('claude');
      expect(claudeAgent?.args).toContain('--print');
      expect(claudeAgent?.args).toContain('--verbose');
      expect(claudeAgent?.args).toContain('--dangerously-skip-permissions');
    });

    it('should include terminal as hidden agent', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/bin/bash\n', stderr: '', exitCode: 0 });

      const agents = await detector.detectAgents();
      const terminal = agents.find(a => a.id === 'terminal');

      expect(terminal?.hidden).toBe(true);
      expect(terminal?.requiresPty).toBe(true);
    });

    it('should log agent detection progress', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 });

      await detector.detectAgents();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Agent detection starting'),
        'AgentDetector'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Agent detection complete'),
        'AgentDetector'
      );
    });

    it('should log when agents are found', async () => {
      mockExecFileNoThrow.mockImplementation(async (cmd, args) => {
        const binaryName = args[0];
        if (binaryName === 'claude') {
          return { stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 1 };
      });

      await detector.detectAgents();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Claude Code'),
        'AgentDetector'
      );
    });

    it('should log warnings for missing agents (except bash)', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });

      await detector.detectAgents();

      // Should warn about missing agents
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Claude Code'),
        'AgentDetector'
      );

      // But not about bash (it's always present)
      const bashWarning = (logger.warn as any).mock.calls.find(
        (call: any[]) => call[0].includes('Terminal') && call[0].includes('bash')
      );
      expect(bashWarning).toBeUndefined();
    });
  });

  describe('custom path detection', () => {
    beforeEach(() => {
      vi.spyOn(fs.promises, 'stat').mockImplementation(async () => {
        throw new Error('ENOENT');
      });
      vi.spyOn(fs.promises, 'access').mockImplementation(async () => undefined);
    });

    it('should check custom path when set', async () => {
      const statMock = vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        isFile: () => true,
      } as fs.Stats);

      detector.setCustomPaths({ 'claude-code': '/custom/claude' });
      await detector.detectAgents();

      expect(statMock).toHaveBeenCalledWith('/custom/claude');
    });

    it('should use custom path when valid', async () => {
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        isFile: () => true,
      } as fs.Stats);

      detector.setCustomPaths({ 'claude-code': '/custom/claude' });
      const agents = await detector.detectAgents();

      const claude = agents.find(a => a.id === 'claude-code');
      expect(claude?.available).toBe(true);
      expect(claude?.path).toBe('/custom/claude');
      expect(claude?.customPath).toBe('/custom/claude');
    });

    it('should reject non-file custom paths', async () => {
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        isFile: () => false, // Directory
      } as fs.Stats);

      detector.setCustomPaths({ 'claude-code': '/custom/claude-dir' });
      const agents = await detector.detectAgents();

      const claude = agents.find(a => a.id === 'claude-code');
      expect(claude?.available).toBe(false);
    });

    it('should reject non-executable custom paths on Unix', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        isFile: () => true,
      } as fs.Stats);
      vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('EACCES'));

      detector.setCustomPaths({ 'claude-code': '/custom/claude' });
      const agents = await detector.detectAgents();

      const claude = agents.find(a => a.id === 'claude-code');
      expect(claude?.available).toBe(false);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not executable'),
        'AgentDetector'
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should skip executable check on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      const accessMock = vi.spyOn(fs.promises, 'access');
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        isFile: () => true,
      } as fs.Stats);

      detector.setCustomPaths({ 'claude-code': 'C:\\custom\\claude.exe' });
      const agents = await detector.detectAgents();

      const claude = agents.find(a => a.id === 'claude-code');
      expect(claude?.available).toBe(true);
      expect(accessMock).not.toHaveBeenCalled();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should fall back to PATH when custom path is invalid', async () => {
      vi.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('ENOENT'));
      mockExecFileNoThrow.mockImplementation(async (cmd, args) => {
        if (args[0] === 'claude') {
          return { stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 1 };
      });

      detector.setCustomPaths({ 'claude-code': '/invalid/path' });
      const agents = await detector.detectAgents();

      const claude = agents.find(a => a.id === 'claude-code');
      expect(claude?.available).toBe(true);
      expect(claude?.path).toBe('/usr/bin/claude');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('custom path not valid'),
        'AgentDetector'
      );
    });

    it('should log when found at custom path', async () => {
      vi.spyOn(fs.promises, 'stat').mockResolvedValue({
        isFile: () => true,
      } as fs.Stats);

      detector.setCustomPaths({ 'claude-code': '/custom/claude' });
      await detector.detectAgents();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('custom path'),
        'AgentDetector'
      );
    });

    it('should log when falling back to PATH after invalid custom path', async () => {
      vi.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('ENOENT'));
      mockExecFileNoThrow.mockImplementation(async (cmd, args) => {
        if (args[0] === 'claude') {
          return { stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 1 };
      });

      detector.setCustomPaths({ 'claude-code': '/invalid/path' });
      await detector.detectAgents();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('found in PATH'),
        'AgentDetector'
      );
    });
  });

  describe('binary detection', () => {
    it('should use which command on Unix', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      // Create a new detector to pick up the platform change
      const unixDetector = new AgentDetector();
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 });

      await unixDetector.detectAgents();

      expect(mockExecFileNoThrow).toHaveBeenCalledWith(
        'which',
        expect.any(Array),
        undefined,
        expect.any(Object)
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should use where command on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      const winDetector = new AgentDetector();
      mockExecFileNoThrow.mockResolvedValue({ stdout: 'C:\\claude.exe\n', stderr: '', exitCode: 0 });

      await winDetector.detectAgents();

      expect(mockExecFileNoThrow).toHaveBeenCalledWith(
        'where',
        expect.any(Array),
        undefined,
        expect.any(Object)
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should take first match when multiple paths returned', async () => {
      mockExecFileNoThrow.mockResolvedValue({
        stdout: '/usr/local/bin/claude\n/usr/bin/claude\n/home/user/bin/claude\n',
        stderr: '',
        exitCode: 0,
      });

      const agents = await detector.detectAgents();
      const claude = agents.find(a => a.id === 'claude-code');

      expect(claude?.path).toBe('/usr/local/bin/claude');
    });

    it('should handle exceptions in binary detection', async () => {
      mockExecFileNoThrow.mockRejectedValue(new Error('spawn failed'));

      const agents = await detector.detectAgents();

      // All agents should be marked as unavailable
      expect(agents.every(a => !a.available)).toBe(true);
    });
  });

  describe('expanded environment', () => {
    it('should expand PATH with common directories', async () => {
      // Can't mock os.homedir in ESM, but we can verify the static paths are added
      await detector.detectAgents();

      // Check that execFileNoThrow was called with expanded env
      expect(mockExecFileNoThrow).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        undefined,
        expect.objectContaining({
          PATH: expect.stringContaining('/opt/homebrew/bin'),
        })
      );

      expect(mockExecFileNoThrow).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        undefined,
        expect.objectContaining({
          PATH: expect.stringContaining('/usr/local/bin'),
        })
      );
    });

    it('should include user-specific paths based on actual homedir', async () => {
      // Since we can't mock os.homedir in ESM, verify paths include actual home directory
      const actualHome = os.homedir();

      await detector.detectAgents();

      expect(mockExecFileNoThrow).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        undefined,
        expect.objectContaining({
          PATH: expect.stringContaining(`${actualHome}/.local/bin`),
        })
      );

      expect(mockExecFileNoThrow).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        undefined,
        expect.objectContaining({
          PATH: expect.stringContaining(`${actualHome}/.claude/local`),
        })
      );
    });

    it('should preserve existing PATH', async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '/existing/path:/another/path';

      const newDetector = new AgentDetector();
      await newDetector.detectAgents();

      expect(mockExecFileNoThrow).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        undefined,
        expect.objectContaining({
          PATH: expect.stringContaining('/existing/path'),
        })
      );

      process.env.PATH = originalPath;
    });

    it('should not duplicate paths already in PATH', async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '/opt/homebrew/bin:/usr/bin';

      const newDetector = new AgentDetector();
      await newDetector.detectAgents();

      const call = mockExecFileNoThrow.mock.calls[0];
      const env = call[3] as NodeJS.ProcessEnv;
      const pathParts = (env.PATH || '').split(':');

      // Should only appear once
      const homebrewCount = pathParts.filter(p => p === '/opt/homebrew/bin').length;
      expect(homebrewCount).toBe(1);

      process.env.PATH = originalPath;
    });

    it('should handle empty PATH', async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '';

      const newDetector = new AgentDetector();
      await newDetector.detectAgents();

      expect(mockExecFileNoThrow).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        undefined,
        expect.objectContaining({
          PATH: expect.stringContaining('/opt/homebrew/bin'),
        })
      );

      process.env.PATH = originalPath;
    });
  });

  describe('getAgent', () => {
    it('should return agent by ID', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 });

      const agent = await detector.getAgent('claude-code');

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('claude-code');
      expect(agent?.name).toBe('Claude Code');
    });

    it('should return null for unknown ID', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });

      const agent = await detector.getAgent('unknown-agent');

      expect(agent).toBeNull();
    });

    it('should trigger detection if not cached', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 });

      await detector.getAgent('claude-code');

      expect(mockExecFileNoThrow).toHaveBeenCalled();
    });

    it('should use cache for subsequent calls', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 });

      await detector.getAgent('claude-code');
      const callCount = mockExecFileNoThrow.mock.calls.length;

      await detector.getAgent('terminal');
      expect(mockExecFileNoThrow.mock.calls.length).toBe(callCount);
    });
  });

  describe('clearCache', () => {
    it('should clear cached agents', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 });

      await detector.detectAgents();
      const initialCallCount = mockExecFileNoThrow.mock.calls.length;

      detector.clearCache();
      await detector.detectAgents();

      expect(mockExecFileNoThrow.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should allow re-detection with different results', async () => {
      // First detection: claude available
      mockExecFileNoThrow.mockImplementation(async (cmd, args) => {
        if (args[0] === 'claude') {
          return { stdout: '/usr/bin/claude\n', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 1 };
      });

      const agents1 = await detector.detectAgents();
      expect(agents1.find(a => a.id === 'claude-code')?.available).toBe(true);

      detector.clearCache();

      // Second detection: claude unavailable
      mockExecFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });

      const agents2 = await detector.detectAgents();
      expect(agents2.find(a => a.id === 'claude-code')?.available).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace-only stdout from which', async () => {
      mockExecFileNoThrow.mockResolvedValue({ stdout: '   \n\t\n', stderr: '', exitCode: 0 });

      const agents = await detector.detectAgents();

      // Empty stdout should mean not found
      expect(agents.every(a => !a.available || a.id === 'terminal')).toBe(true);
    });

    it('should handle concurrent detectAgents and clearCache', async () => {
      mockExecFileNoThrow.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { stdout: '/usr/bin/found\n', stderr: '', exitCode: 0 };
      });

      const detectPromise = detector.detectAgents();
      detector.clearCache(); // Clear during detection

      const result = await detectPromise;
      expect(result).toBeDefined();
      expect(result.length).toBe(5);
    });

    it('should handle very long PATH', async () => {
      const originalPath = process.env.PATH;
      // Create a very long PATH
      const longPath = Array(1000).fill('/some/path').join(':');
      process.env.PATH = longPath;

      const newDetector = new AgentDetector();
      await newDetector.detectAgents();

      // Should still work
      expect(mockExecFileNoThrow).toHaveBeenCalled();

      process.env.PATH = originalPath;
    });

    it('should include all system paths in expanded environment', async () => {
      // Test that system paths are properly included
      await detector.detectAgents();

      const call = mockExecFileNoThrow.mock.calls[0];
      const env = call[3] as NodeJS.ProcessEnv;
      const path = env.PATH || '';

      // Check critical system paths
      expect(path).toContain('/usr/bin');
      expect(path).toContain('/bin');
      expect(path).toContain('/usr/local/bin');
      expect(path).toContain('/opt/homebrew/bin');
    });

    it('should handle undefined PATH', async () => {
      const originalPath = process.env.PATH;
      delete process.env.PATH;

      const newDetector = new AgentDetector();
      await newDetector.detectAgents();

      expect(mockExecFileNoThrow).toHaveBeenCalled();

      process.env.PATH = originalPath;
    });
  });
});
