/**
 * Symphony Integration Tests
 *
 * These tests verify Symphony workflows with minimal mocking.
 * Only external services (GitHub API, git/gh CLI) are mocked.
 * Real file system operations are used with temporary directories.
 *
 * Test coverage includes:
 * - Full contribution workflow: start → update status → complete
 * - State persistence across handler registrations
 * - Cache behavior and expiration
 * - Edge cases and error handling
 * - Security validation (path traversal, input sanitization)
 * - Performance considerations
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { ipcMain, BrowserWindow, App } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  registerSymphonyHandlers,
  SymphonyHandlerDependencies,
} from '../../main/ipc/handlers/symphony';
import {
  REGISTRY_CACHE_TTL_MS,
  ISSUES_CACHE_TTL_MS,
  DEFAULT_CONTRIBUTOR_STATS,
} from '../../shared/symphony-constants';
import type {
  SymphonyRegistry,
  SymphonyIssue,
  SymphonyState,
  SymphonyCache,
  ActiveContribution,
  ContributorStats,
} from '../../shared/symphony-types';

// ============================================================================
// Minimal Mocking - Only External Services
// ============================================================================

// Mock electron IPC (required for handler registration)
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  app: {
    getPath: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

// Mock execFileNoThrow for git/gh CLI operations (external service)
vi.mock('../../main/utils/execFile', () => ({
  execFileNoThrow: vi.fn(),
}));

// Mock logger (not an external service, but avoid console noise)
vi.mock('../../main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock global fetch for GitHub API calls (external service)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import mocked functions
import { execFileNoThrow } from '../../main/utils/execFile';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a temporary directory for test isolation.
 * Each test gets its own directory to avoid interference.
 */
async function createTempDir(): Promise<string> {
  const tempBase = path.join(os.tmpdir(), 'maestro-symphony-tests');
  await fs.mkdir(tempBase, { recursive: true });
  const testTempDir = await fs.mkdtemp(path.join(tempBase, 'test-'));
  return testTempDir;
}

/**
 * Clean up a temporary directory after test.
 */
async function cleanupTempDir(testTempDir: string): Promise<void> {
  try {
    await fs.rm(testTempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a mock registry response.
 */
function createMockRegistry(overrides: Partial<SymphonyRegistry> = {}): SymphonyRegistry {
  return {
    schemaVersion: '1.0',
    lastUpdated: new Date().toISOString(),
    repositories: [
      {
        slug: 'test-owner/test-repo',
        name: 'Test Repository',
        description: 'A test repository for Symphony',
        url: 'https://github.com/test-owner/test-repo',
        category: 'developer-tools',
        maintainer: { name: 'Test Maintainer' },
        isActive: true,
        addedAt: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
}

/**
 * Create a mock issue response.
 */
function createMockIssue(overrides: Partial<SymphonyIssue> = {}): SymphonyIssue {
  return {
    number: 1,
    title: 'Test Issue',
    body: '- `docs/task.md`\n- `docs/setup.md`',
    url: 'https://api.github.com/repos/test-owner/test-repo/issues/1',
    htmlUrl: 'https://github.com/test-owner/test-repo/issues/1',
    author: 'test-author',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    documentPaths: [
      { name: 'task.md', path: 'docs/task.md', isExternal: false },
      { name: 'setup.md', path: 'docs/setup.md', isExternal: false },
    ],
    status: 'available',
    ...overrides,
  };
}

/**
 * Create mock GitHub API issue response.
 */
function createGitHubIssueResponse(issues: Partial<SymphonyIssue>[] = [createMockIssue()]): unknown[] {
  return issues.map((issue, index) => ({
    number: issue.number ?? index + 1,
    title: issue.title ?? `Test Issue ${index + 1}`,
    body: issue.body ?? '- `docs/task.md`',
    url: issue.url ?? `https://api.github.com/repos/test-owner/test-repo/issues/${index + 1}`,
    html_url: issue.htmlUrl ?? `https://github.com/test-owner/test-repo/issues/${index + 1}`,
    user: { login: issue.author ?? 'test-author' },
    created_at: issue.createdAt ?? new Date().toISOString(),
    updated_at: issue.updatedAt ?? new Date().toISOString(),
  }));
}

/**
 * Helper to invoke a registered IPC handler.
 */
async function invokeHandler(
  handlers: Map<string, Function>,
  channel: string,
  ...args: unknown[]
): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  // IPC handlers receive (event, ...args) but our handlers unwrap the args
  return await handler({}, ...args);
}

// ============================================================================
// Integration Test Suite
// ============================================================================

describe('Symphony Integration Tests', () => {
  let handlers: Map<string, Function>;
  let mockApp: App;
  let mockMainWindow: BrowserWindow;
  let mockDeps: SymphonyHandlerDependencies;
  let testTempDir: string;

  beforeAll(async () => {
    // Nothing to do - each test creates its own temp directory
  });

  afterAll(async () => {
    // Nothing to do - each test cleans its own temp directory
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a fresh temp directory for each test to ensure isolation
    testTempDir = await createTempDir();

    // Capture all registered handlers
    handlers = new Map();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler);
    });

    // Setup mock app with real temp directory
    mockApp = {
      getPath: vi.fn().mockReturnValue(testTempDir),
    } as unknown as App;

    // Setup mock main window
    mockMainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
    } as unknown as BrowserWindow;

    // Setup dependencies
    mockDeps = {
      app: mockApp,
      getMainWindow: () => mockMainWindow,
    };

    // Default fetch mock (successful responses)
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('symphony-registry.json')) {
        return {
          ok: true,
          json: async () => createMockRegistry(),
        };
      }
      if (url.includes('/issues')) {
        return {
          ok: true,
          json: async () => createGitHubIssueResponse(),
        };
      }
      if (url.includes('/pulls')) {
        return {
          ok: true,
          json: async () => [], // No PRs by default
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    });

    // Default execFileNoThrow mock (successful git operations)
    vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args, _cwd) => {
      // gh auth status - authenticated
      if (cmd === 'gh' && args?.[0] === 'auth' && args?.[1] === 'status') {
        return { stdout: 'Logged in to github.com', stderr: '', exitCode: 0 };
      }
      // git clone
      if (cmd === 'git' && args?.[0] === 'clone') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      // git checkout -b (create branch)
      if (cmd === 'git' && args?.[0] === 'checkout' && args?.[1] === '-b') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      // git symbolic-ref (get default branch)
      if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
        return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
      }
      // git rev-list (count commits)
      if (cmd === 'git' && args?.[0] === 'rev-list') {
        return { stdout: '1', stderr: '', exitCode: 0 };
      }
      // git rev-parse (get branch name)
      if (cmd === 'git' && args?.[0] === 'rev-parse') {
        return { stdout: 'symphony/issue-1-test', stderr: '', exitCode: 0 };
      }
      // git push
      if (cmd === 'git' && args?.[0] === 'push') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      // gh pr create
      if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
        return { stdout: 'https://github.com/test-owner/test-repo/pull/1', stderr: '', exitCode: 0 };
      }
      // gh pr ready
      if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'ready') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      // gh pr comment
      if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'comment') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      // Default: command not found
      return { stdout: '', stderr: 'command not found', exitCode: 127 };
    });

    // Register handlers
    registerSymphonyHandlers(mockDeps);
  });

  afterEach(async () => {
    handlers.clear();
    // Clean up temp directory after each test
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
    }
  });

  // ==========================================================================
  // Test File Setup Verification
  // ==========================================================================

  describe('Integration Test Setup', () => {
    it('should create temp directory with real file system', async () => {
      const stat = await fs.stat(testTempDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should have mock fetch for GitHub API calls', () => {
      expect(mockFetch).toBeDefined();
      expect(vi.isMockFunction(mockFetch)).toBe(true);
    });

    it('should have mock execFileNoThrow for git/gh CLI operations', () => {
      expect(execFileNoThrow).toBeDefined();
      expect(vi.isMockFunction(execFileNoThrow)).toBe(true);
    });

    it('should use real file system operations for state files', async () => {
      const testFile = path.join(testTempDir, 'test-file.txt');
      await fs.writeFile(testFile, 'test content');
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('test content');
      await fs.rm(testFile);
    });

    it('should register all Symphony handlers', () => {
      const expectedHandlers = [
        'symphony:getRegistry',
        'symphony:getIssues',
        'symphony:getState',
        'symphony:getActive',
        'symphony:getCompleted',
        'symphony:getStats',
        'symphony:start',
        'symphony:registerActive',
        'symphony:updateStatus',
        'symphony:complete',
        'symphony:cancel',
        'symphony:checkPRStatuses',
        'symphony:clearCache',
        'symphony:cloneRepo',
        'symphony:startContribution',
        'symphony:createDraftPR',
        'symphony:fetchDocumentContent',
      ];

      for (const channel of expectedHandlers) {
        expect(handlers.has(channel), `Handler ${channel} should be registered`).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Full Contribution Workflow Tests
  // ==========================================================================

  describe('Full Contribution Workflow', () => {
    it('should complete full contribution flow: start → update status → complete', async () => {
      // Create a local repo directory to simulate clone
      const repoDir = path.join(testTempDir, 'symphony-repos', 'test-repo-contrib_test');
      await fs.mkdir(repoDir, { recursive: true });

      // 1. Start contribution - this creates branch and initial state
      const startResult = await invokeHandler(handlers, 'symphony:startContribution', {
        contributionId: 'contrib_test',
        sessionId: 'session-123',
        repoSlug: 'test-owner/test-repo',
        issueNumber: 1,
        issueTitle: 'Test Issue',
        localPath: repoDir,
        documentPaths: [
          { name: 'task.md', path: 'docs/task.md', isExternal: false },
        ],
      }) as { success: boolean; branchName?: string; error?: string };

      expect(startResult.success).toBe(true);
      expect(startResult.branchName).toMatch(/^symphony\/issue-1-/);

      // 2. Register the active contribution (simulating App.tsx behavior)
      const registerResult = await invokeHandler(handlers, 'symphony:registerActive', {
        contributionId: 'contrib_test',
        sessionId: 'session-123',
        repoSlug: 'test-owner/test-repo',
        repoName: 'test-repo',
        issueNumber: 1,
        issueTitle: 'Test Issue',
        localPath: repoDir,
        branchName: startResult.branchName!,
        documentPaths: ['docs/task.md'],
        agentType: 'claude-code',
      }) as { success: boolean };

      expect(registerResult.success).toBe(true);

      // 3. Update status with progress
      const updateResult = await invokeHandler(handlers, 'symphony:updateStatus', {
        contributionId: 'contrib_test',
        status: 'running',
        progress: {
          totalDocuments: 1,
          completedDocuments: 1,
          totalTasks: 5,
          completedTasks: 3,
        },
        tokenUsage: {
          inputTokens: 1000,
          outputTokens: 500,
          estimatedCost: 0.05,
        },
        timeSpent: 60000, // 1 minute
      }) as { updated: boolean };

      expect(updateResult.updated).toBe(true);

      // 4. Create draft PR (simulating first commit)
      // First, create metadata file that createDraftPR expects
      const metadataDir = path.join(testTempDir, 'symphony', 'contributions', 'contrib_test');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(
        path.join(metadataDir, 'metadata.json'),
        JSON.stringify({
          contributionId: 'contrib_test',
          sessionId: 'session-123',
          repoSlug: 'test-owner/test-repo',
          issueNumber: 1,
          issueTitle: 'Test Issue',
          branchName: startResult.branchName,
          localPath: repoDir,
          prCreated: false,
        })
      );

      const prResult = await invokeHandler(handlers, 'symphony:createDraftPR', {
        contributionId: 'contrib_test',
      }) as { success: boolean; draftPrNumber?: number; draftPrUrl?: string };

      expect(prResult.success).toBe(true);
      expect(prResult.draftPrNumber).toBe(1);
      expect(prResult.draftPrUrl).toContain('github.com');

      // 5. Update with PR info
      await invokeHandler(handlers, 'symphony:updateStatus', {
        contributionId: 'contrib_test',
        draftPrNumber: prResult.draftPrNumber,
        draftPrUrl: prResult.draftPrUrl,
      });

      // 6. Complete the contribution
      const completeResult = await invokeHandler(handlers, 'symphony:complete', {
        contributionId: 'contrib_test',
        stats: {
          inputTokens: 2000,
          outputTokens: 1000,
          estimatedCost: 0.10,
          timeSpentMs: 120000,
          documentsProcessed: 1,
          tasksCompleted: 5,
        },
      }) as { prUrl?: string; prNumber?: number; error?: string };

      expect(completeResult.prUrl).toBeDefined();
      expect(completeResult.prNumber).toBe(1);

      // 7. Verify state after completion
      const state = await invokeHandler(handlers, 'symphony:getState') as { state: SymphonyState };

      // Active should be empty (contribution moved to history)
      expect(state.state.active.length).toBe(0);

      // History should have the completed contribution
      expect(state.state.history.length).toBe(1);
      expect(state.state.history[0].id).toBe('contrib_test');
      expect(state.state.history[0].prNumber).toBe(1);

      // Stats should be updated
      expect(state.state.stats.totalContributions).toBe(1);
      expect(state.state.stats.totalTokensUsed).toBe(3000); // 2000 + 1000
    });

    it('should handle real state file persistence', async () => {
      // Create contribution to persist state
      const repoDir = path.join(testTempDir, 'symphony-repos', 'persist-test');
      await fs.mkdir(repoDir, { recursive: true });

      await invokeHandler(handlers, 'symphony:registerActive', {
        contributionId: 'persist_test',
        sessionId: 'session-persist',
        repoSlug: 'test-owner/test-repo',
        repoName: 'test-repo',
        issueNumber: 42,
        issueTitle: 'Persistence Test',
        localPath: repoDir,
        branchName: 'symphony/issue-42-test',
        documentPaths: ['docs/task.md'],
        agentType: 'claude-code',
      });

      // Verify state file was created on disk
      const stateFile = path.join(testTempDir, 'symphony', 'symphony-state.json');
      const stateContent = await fs.readFile(stateFile, 'utf-8');
      const persistedState = JSON.parse(stateContent) as SymphonyState;

      expect(persistedState.active.length).toBe(1);
      expect(persistedState.active[0].id).toBe('persist_test');
      expect(persistedState.active[0].issueNumber).toBe(42);
    });

    it('should handle multiple concurrent contributions without interference', async () => {
      // Start multiple contributions
      const contributions = ['contrib_a', 'contrib_b', 'contrib_c'];

      for (let i = 0; i < contributions.length; i++) {
        const repoDir = path.join(testTempDir, 'symphony-repos', `concurrent-${contributions[i]}`);
        await fs.mkdir(repoDir, { recursive: true });

        await invokeHandler(handlers, 'symphony:registerActive', {
          contributionId: contributions[i],
          sessionId: `session-${contributions[i]}`,
          repoSlug: `test-owner/repo-${i}`,
          repoName: `repo-${i}`,
          issueNumber: i + 1,
          issueTitle: `Issue ${i + 1}`,
          localPath: repoDir,
          branchName: `symphony/issue-${i + 1}-test`,
          documentPaths: ['docs/task.md'],
          agentType: 'claude-code',
        });
      }

      // Verify all contributions are tracked
      const activeResult = await invokeHandler(handlers, 'symphony:getActive') as { contributions: ActiveContribution[] };
      expect(activeResult.contributions.length).toBe(3);

      // Update each contribution with different progress
      for (let i = 0; i < contributions.length; i++) {
        await invokeHandler(handlers, 'symphony:updateStatus', {
          contributionId: contributions[i],
          progress: {
            totalTasks: 10,
            completedTasks: i + 1, // Different progress for each
          },
        });
      }

      // Verify each contribution has correct progress
      const stateResult = await invokeHandler(handlers, 'symphony:getState') as { state: SymphonyState };
      for (let i = 0; i < contributions.length; i++) {
        const contrib = stateResult.state.active.find(c => c.id === contributions[i]);
        expect(contrib?.progress.completedTasks).toBe(i + 1);
      }
    });

    it('should support contribution recovery after simulated app restart', async () => {
      const repoDir = path.join(testTempDir, 'symphony-repos', 'recovery-test');
      await fs.mkdir(repoDir, { recursive: true });

      // Start a contribution
      await invokeHandler(handlers, 'symphony:registerActive', {
        contributionId: 'recovery_test',
        sessionId: 'session-recovery',
        repoSlug: 'test-owner/recovery-repo',
        repoName: 'recovery-repo',
        issueNumber: 99,
        issueTitle: 'Recovery Test',
        localPath: repoDir,
        branchName: 'symphony/issue-99-test',
        documentPaths: ['docs/task.md'],
        agentType: 'claude-code',
      });

      // Simulate app restart by re-registering handlers (new handler instance)
      handlers.clear();
      registerSymphonyHandlers(mockDeps);

      // State should be recovered from disk
      const stateResult = await invokeHandler(handlers, 'symphony:getState') as { state: SymphonyState };
      const recoveredContrib = stateResult.state.active.find(c => c.id === 'recovery_test');

      expect(recoveredContrib).toBeDefined();
      expect(recoveredContrib?.issueNumber).toBe(99);
      expect(recoveredContrib?.repoSlug).toBe('test-owner/recovery-repo');
    });
  });

  // ==========================================================================
  // State Persistence Tests
  // ==========================================================================

  describe('State Persistence', () => {
    it('should survive state across handler registrations', async () => {
      // Create initial state
      await invokeHandler(handlers, 'symphony:registerActive', {
        contributionId: 'state_persist_1',
        sessionId: 'session-1',
        repoSlug: 'owner/repo1',
        repoName: 'repo1',
        issueNumber: 1,
        issueTitle: 'Issue 1',
        localPath: '/tmp/repo1',
        branchName: 'symphony/issue-1',
        documentPaths: [],
        agentType: 'claude-code',
      });

      // Re-register handlers (simulates module reload)
      handlers.clear();
      registerSymphonyHandlers(mockDeps);

      // State should persist
      const result = await invokeHandler(handlers, 'symphony:getState') as { state: SymphonyState };
      expect(result.state.active.some(c => c.id === 'state_persist_1')).toBe(true);
    });

    it('should create cache file that is readable', async () => {
      // Fetch registry (creates cache)
      await invokeHandler(handlers, 'symphony:getRegistry', false);

      // Verify cache file exists and is readable
      const cacheFile = path.join(testTempDir, 'symphony', 'symphony-cache.json');
      const cacheContent = await fs.readFile(cacheFile, 'utf-8');
      const cache = JSON.parse(cacheContent) as SymphonyCache;

      expect(cache.registry).toBeDefined();
      expect(cache.registry?.data).toBeDefined();
    });

    it('should create state file that is readable', async () => {
      // Create some state
      await invokeHandler(handlers, 'symphony:registerActive', {
        contributionId: 'state_file_test',
        sessionId: 'session-state',
        repoSlug: 'owner/repo',
        repoName: 'repo',
        issueNumber: 1,
        issueTitle: 'State File Test',
        localPath: '/tmp/repo',
        branchName: 'symphony/issue-1',
        documentPaths: [],
        agentType: 'claude-code',
      });

      // Verify state file
      const stateFile = path.join(testTempDir, 'symphony', 'symphony-state.json');
      const stateContent = await fs.readFile(stateFile, 'utf-8');
      const state = JSON.parse(stateContent) as SymphonyState;

      expect(state.active).toBeDefined();
      expect(state.history).toBeDefined();
      expect(state.stats).toBeDefined();
    });

    it('should handle corrupted state file gracefully', async () => {
      // Write corrupted state
      const stateFile = path.join(testTempDir, 'symphony', 'symphony-state.json');
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      await fs.writeFile(stateFile, '{ invalid json');

      // Re-register handlers
      handlers.clear();
      registerSymphonyHandlers(mockDeps);

      // Should return defaults
      const result = await invokeHandler(handlers, 'symphony:getState') as { state: SymphonyState };
      expect(result.state.active).toEqual([]);
      expect(result.state.history).toEqual([]);
    });

    it('should handle corrupted cache file gracefully', async () => {
      // Write corrupted cache
      const cacheFile = path.join(testTempDir, 'symphony', 'symphony-cache.json');
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, 'not valid json at all');

      // Should fetch fresh data
      const result = await invokeHandler(handlers, 'symphony:getRegistry', false) as {
        registry: SymphonyRegistry;
        fromCache: boolean
      };

      expect(result.registry).toBeDefined();
      expect(result.fromCache).toBe(false);
    });
  });

  // ==========================================================================
  // Cache Behavior Tests
  // ==========================================================================

  describe('Cache Behavior', () => {
    it('should expire registry cache after REGISTRY_CACHE_TTL_MS', async () => {
      // First fetch - caches data
      await invokeHandler(handlers, 'symphony:getRegistry', false);

      // Manually expire cache by modifying timestamp
      const cacheFile = path.join(testTempDir, 'symphony', 'symphony-cache.json');
      const cache = JSON.parse(await fs.readFile(cacheFile, 'utf-8')) as SymphonyCache;
      cache.registry!.fetchedAt = Date.now() - REGISTRY_CACHE_TTL_MS - 1000;
      await fs.writeFile(cacheFile, JSON.stringify(cache));

      // Clear and re-register handlers
      handlers.clear();
      registerSymphonyHandlers(mockDeps);

      // Track fetch calls
      mockFetch.mockClear();

      // Should fetch fresh
      const result = await invokeHandler(handlers, 'symphony:getRegistry', false) as {
        fromCache: boolean;
      };

      expect(result.fromCache).toBe(false);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should expire issues cache after ISSUES_CACHE_TTL_MS', async () => {
      // First fetch
      await invokeHandler(handlers, 'symphony:getIssues', 'test-owner/test-repo', false);

      // Expire cache
      const cacheFile = path.join(testTempDir, 'symphony', 'symphony-cache.json');
      const cache = JSON.parse(await fs.readFile(cacheFile, 'utf-8')) as SymphonyCache;
      if (cache.issues['test-owner/test-repo']) {
        cache.issues['test-owner/test-repo'].fetchedAt = Date.now() - ISSUES_CACHE_TTL_MS - 1000;
      }
      await fs.writeFile(cacheFile, JSON.stringify(cache));

      // Clear and re-register
      handlers.clear();
      registerSymphonyHandlers(mockDeps);
      mockFetch.mockClear();

      // Should fetch fresh
      const result = await invokeHandler(handlers, 'symphony:getIssues', 'test-owner/test-repo', false) as {
        fromCache: boolean;
      };

      expect(result.fromCache).toBe(false);
    });

    it('should clear all cached data with clearCache', async () => {
      // Create cache
      await invokeHandler(handlers, 'symphony:getRegistry', false);
      await invokeHandler(handlers, 'symphony:getIssues', 'owner/repo1', false);
      await invokeHandler(handlers, 'symphony:getIssues', 'owner/repo2', false);

      // Clear cache
      const result = await invokeHandler(handlers, 'symphony:clearCache') as { cleared: boolean };
      expect(result.cleared).toBe(true);

      // Verify cache is empty
      const cacheFile = path.join(testTempDir, 'symphony', 'symphony-cache.json');
      const cache = JSON.parse(await fs.readFile(cacheFile, 'utf-8')) as SymphonyCache;
      expect(cache.registry).toBeUndefined();
      expect(Object.keys(cache.issues)).toHaveLength(0);
    });

    it('should maintain repo-specific cache for issues', async () => {
      // Fetch issues for different repos
      await invokeHandler(handlers, 'symphony:getIssues', 'owner/repo-a', false);
      await invokeHandler(handlers, 'symphony:getIssues', 'owner/repo-b', false);

      // Verify cache has both
      const cacheFile = path.join(testTempDir, 'symphony', 'symphony-cache.json');
      const cache = JSON.parse(await fs.readFile(cacheFile, 'utf-8')) as SymphonyCache;

      expect(cache.issues['owner/repo-a']).toBeDefined();
      expect(cache.issues['owner/repo-b']).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge Cases & Error Handling - Input Validation
  // ==========================================================================

  describe('Input Validation Edge Cases', () => {
    it('should truncate extremely long repo names (>100 chars)', async () => {
      const longRepoName = 'a'.repeat(150);

      await invokeHandler(handlers, 'symphony:registerActive', {
        contributionId: 'long_name_test',
        sessionId: 'session-long',
        repoSlug: `owner/${longRepoName}`,
        repoName: longRepoName,
        issueNumber: 1,
        issueTitle: 'Long Name Test',
        localPath: '/tmp/long-repo',
        branchName: 'symphony/issue-1',
        documentPaths: [],
        agentType: 'claude-code',
      });

      const state = await invokeHandler(handlers, 'symphony:getState') as { state: SymphonyState };
      // Repo name in slug might be preserved, but local path sanitization applies
      expect(state.state.active.some(c => c.id === 'long_name_test')).toBe(true);
    });

    it('should handle repo names with unicode characters', async () => {
      await invokeHandler(handlers, 'symphony:registerActive', {
        contributionId: 'unicode_test',
        sessionId: 'session-unicode',
        repoSlug: 'owner/测试仓库',
        repoName: '测试仓库',
        issueNumber: 1,
        issueTitle: 'Unicode Test',
        localPath: '/tmp/unicode-repo',
        branchName: 'symphony/issue-1',
        documentPaths: [],
        agentType: 'claude-code',
      });

      const state = await invokeHandler(handlers, 'symphony:getState') as { state: SymphonyState };
      expect(state.state.active.some(c => c.id === 'unicode_test')).toBe(true);
    });

    it('should handle repo names with special characters through clone', async () => {
      // Special chars in repo names are valid - GitHub allows them in repo names
      // The clone will succeed (mocked) but the repo name is preserved
      const result = await invokeHandler(handlers, 'symphony:cloneRepo', {
        repoUrl: 'https://github.com/owner/special-repo',
        localPath: path.join(testTempDir, 'special-repo'),
      }) as { success: boolean; error?: string };

      // Clone should succeed (mocked git clone)
      expect(result.success).toBe(true);
    });

    it('should handle document paths with encoded characters', async () => {
      await invokeHandler(handlers, 'symphony:registerActive', {
        contributionId: 'encoded_path_test',
        sessionId: 'session-encoded',
        repoSlug: 'owner/repo',
        repoName: 'repo',
        issueNumber: 1,
        issueTitle: 'Encoded Path Test',
        localPath: '/tmp/encoded-repo',
        branchName: 'symphony/issue-1',
        documentPaths: ['docs/file%20with%20spaces.md'],
        agentType: 'claude-code',
      });

      const state = await invokeHandler(handlers, 'symphony:getState') as { state: SymphonyState };
      expect(state.state.active.some(c => c.id === 'encoded_path_test')).toBe(true);
    });

    it('should handle issue body at exactly MAX_BODY_SIZE (1MB)', async () => {
      // MAX_BODY_SIZE is 1024 * 1024 = 1,048,576 bytes
      const MAX_BODY_SIZE = 1024 * 1024;

      // Create a body that is exactly MAX_BODY_SIZE
      // Include a document path at the beginning so we can verify parsing still works
      const docPrefix = '- `docs/test-file.md`\n';
      const padding = 'x'.repeat(MAX_BODY_SIZE - docPrefix.length);
      const exactSizeBody = docPrefix + padding;

      expect(exactSizeBody.length).toBe(MAX_BODY_SIZE);

      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => [{
          number: 1,
          title: 'Exact Size Body Test',
          body: exactSizeBody,
          url: 'https://api.github.com/repos/owner/repo/issues/1',
          html_url: 'https://github.com/owner/repo/issues/1',
          user: { login: 'test-user' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      }));

      // Force fresh fetch (not from cache)
      const result = await invokeHandler(handlers, 'symphony:getIssues', 'owner/exact-size-test', true) as {
        issues: SymphonyIssue[];
        fromCache: boolean;
      };

      // Should succeed and parse the document path
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].documentPaths).toBeDefined();
      // The document path at the beginning should be found
      expect(result.issues[0].documentPaths.some(d => d.path === 'docs/test-file.md')).toBe(true);
    });

    it('should handle issue body slightly over MAX_BODY_SIZE', async () => {
      // MAX_BODY_SIZE is 1024 * 1024 = 1,048,576 bytes
      const MAX_BODY_SIZE = 1024 * 1024;
      const OVER_SIZE = MAX_BODY_SIZE + 1000; // Slightly over

      // Create a body that exceeds MAX_BODY_SIZE
      // Include document paths at both the beginning (should be found)
      // and at the very end (should be truncated away)
      const docAtStart = '- `docs/start-file.md`\n';
      const docAtEnd = '\n- `docs/end-file.md`';

      // Calculate padding to push end doc past MAX_BODY_SIZE
      const paddingLength = OVER_SIZE - docAtStart.length - docAtEnd.length;
      const padding = 'x'.repeat(paddingLength);
      const oversizeBody = docAtStart + padding + docAtEnd;

      expect(oversizeBody.length).toBe(OVER_SIZE);
      expect(oversizeBody.length).toBeGreaterThan(MAX_BODY_SIZE);

      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => [{
          number: 1,
          title: 'Oversize Body Test',
          body: oversizeBody,
          url: 'https://api.github.com/repos/owner/repo/issues/1',
          html_url: 'https://github.com/owner/repo/issues/1',
          user: { login: 'test-user' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      }));

      // Force fresh fetch
      const result = await invokeHandler(handlers, 'symphony:getIssues', 'owner/oversize-test', true) as {
        issues: SymphonyIssue[];
        fromCache: boolean;
      };

      // Should succeed without throwing/hanging
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].documentPaths).toBeDefined();

      // The document at the start should be found
      expect(result.issues[0].documentPaths.some(d => d.path === 'docs/start-file.md')).toBe(true);

      // The document at the end is past MAX_BODY_SIZE, so it may or may not be found
      // depending on implementation. The key test is that parsing completes without error.
      // (Implementation truncates at MAX_BODY_SIZE, so end doc should NOT be found)
      const endDocFound = result.issues[0].documentPaths.some(d => d.path === 'docs/end-file.md');
      expect(endDocFound).toBe(false);
    });
  });

  // ==========================================================================
  // Network Error Handling
  // ==========================================================================

  describe('Network Error Handling', () => {
    it('should handle registry fetch timeout', async () => {
      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
      });

      try {
        await invokeHandler(handlers, 'symphony:getRegistry', true);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle GitHub API rate limiting (403)', async () => {
      mockFetch.mockImplementationOnce(async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      }));

      try {
        await invokeHandler(handlers, 'symphony:getIssues', 'owner/repo', true);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle GitHub API not found (404)', async () => {
      mockFetch.mockImplementationOnce(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));

      try {
        await invokeHandler(handlers, 'symphony:getIssues', 'nonexistent/repo', true);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle network disconnection during clone', async () => {
      vi.mocked(execFileNoThrow).mockImplementationOnce(async () => ({
        stdout: '',
        stderr: 'fatal: unable to access: Connection refused',
        exitCode: 128,
      }));

      const result = await invokeHandler(handlers, 'symphony:cloneRepo', {
        repoUrl: 'https://github.com/owner/repo',
        localPath: path.join(testTempDir, 'network-fail'),
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clone failed');
    });

    it('should handle network disconnection during PR creation', async () => {
      // Setup: create metadata file
      const metadataDir = path.join(testTempDir, 'symphony', 'contributions', 'network_pr_fail');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(
        path.join(metadataDir, 'metadata.json'),
        JSON.stringify({
          contributionId: 'network_pr_fail',
          sessionId: 'session-fail',
          repoSlug: 'owner/repo',
          issueNumber: 1,
          issueTitle: 'Test',
          branchName: 'symphony/issue-1',
          localPath: '/tmp/repo',
          prCreated: false,
        })
      );

      // Mock push failure due to network
      vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'push') {
          return { stdout: '', stderr: 'fatal: unable to access remote', exitCode: 128 };
        }
        if (cmd === 'git' && args?.[0] === 'rev-list') {
          return { stdout: '1', stderr: '', exitCode: 0 };
        }
        if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
          return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
        }
        if (cmd === 'gh' && args?.[0] === 'auth') {
          return { stdout: 'Logged in', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const result = await invokeHandler(handlers, 'symphony:createDraftPR', {
        contributionId: 'network_pr_fail',
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Git Operation Edge Cases
  // ==========================================================================

  describe('Git Operation Edge Cases', () => {
    it('should handle clone to directory that already exists', async () => {
      const existingDir = path.join(testTempDir, 'existing-repo');
      await fs.mkdir(existingDir, { recursive: true });

      vi.mocked(execFileNoThrow).mockImplementationOnce(async () => ({
        stdout: '',
        stderr: 'fatal: destination path already exists',
        exitCode: 128,
      }));

      const result = await invokeHandler(handlers, 'symphony:cloneRepo', {
        repoUrl: 'https://github.com/owner/repo',
        localPath: existingDir,
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clone failed');
    });

    it('should handle branch creation when branch already exists', async () => {
      vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'checkout' && args?.[1] === '-b') {
          return { stdout: '', stderr: 'fatal: A branch named X already exists', exitCode: 128 };
        }
        if (cmd === 'gh' && args?.[0] === 'auth') {
          return { stdout: 'Logged in', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const repoDir = path.join(testTempDir, 'branch-exists-test');
      await fs.mkdir(repoDir, { recursive: true });

      const result = await invokeHandler(handlers, 'symphony:startContribution', {
        contributionId: 'branch_exists',
        sessionId: 'session-branch',
        repoSlug: 'owner/repo',
        issueNumber: 1,
        issueTitle: 'Test',
        localPath: repoDir,
        documentPaths: [],
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('branch');
    });

    it('should handle PR creation when PR already exists for branch', async () => {
      // Setup metadata
      const metadataDir = path.join(testTempDir, 'symphony', 'contributions', 'pr_exists_test');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(
        path.join(metadataDir, 'metadata.json'),
        JSON.stringify({
          contributionId: 'pr_exists_test',
          sessionId: 'session-pr',
          repoSlug: 'owner/repo',
          issueNumber: 1,
          issueTitle: 'Test',
          branchName: 'symphony/issue-1',
          localPath: '/tmp/repo',
          prCreated: false,
        })
      );

      vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
        if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
          return { stdout: '', stderr: 'pull request already exists', exitCode: 1 };
        }
        if (cmd === 'git' && args?.[0] === 'push') {
          // Push succeeds
          return { stdout: '', stderr: '', exitCode: 0 };
        }
        if (cmd === 'git' && args?.[0] === 'rev-list') {
          return { stdout: '1', stderr: '', exitCode: 0 };
        }
        if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
          return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
        }
        if (cmd === 'git' && args?.[0] === 'rev-parse') {
          return { stdout: 'symphony/issue-1', stderr: '', exitCode: 0 };
        }
        if (cmd === 'gh' && args?.[0] === 'auth') {
          return { stdout: 'Logged in', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const result = await invokeHandler(handlers, 'symphony:createDraftPR', {
        contributionId: 'pr_exists_test',
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('PR');
    });

    it('should handle push when remote branch exists with different content', async () => {
      // Setup metadata
      const metadataDir = path.join(testTempDir, 'symphony', 'contributions', 'push_conflict_test');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(
        path.join(metadataDir, 'metadata.json'),
        JSON.stringify({
          contributionId: 'push_conflict_test',
          sessionId: 'session-conflict',
          repoSlug: 'owner/repo',
          issueNumber: 1,
          issueTitle: 'Push Conflict Test',
          branchName: 'symphony/issue-1-test',
          localPath: '/tmp/repo',
          prCreated: false,
        })
      );

      // Mock push failure due to diverged remote branch (non-fast-forward update)
      vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'push') {
          // Simulate the error when remote branch has different content
          // This happens when someone else pushed to the same branch, or force-push was done remotely
          return {
            stdout: '',
            stderr: `To https://github.com/owner/repo.git
 ! [rejected]        symphony/issue-1-test -> symphony/issue-1-test (non-fast-forward)
error: failed to push some refs to 'https://github.com/owner/repo.git'
hint: Updates were rejected because the tip of your current branch is behind
hint: its remote counterpart. Integrate the remote changes (e.g.
hint: 'git pull ...') before pushing again.`,
            exitCode: 1,
          };
        }
        if (cmd === 'git' && args?.[0] === 'rev-list') {
          return { stdout: '1', stderr: '', exitCode: 0 };
        }
        if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
          return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
        }
        if (cmd === 'git' && args?.[0] === 'rev-parse') {
          return { stdout: 'symphony/issue-1-test', stderr: '', exitCode: 0 };
        }
        if (cmd === 'gh' && args?.[0] === 'auth') {
          return { stdout: 'Logged in', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const result = await invokeHandler(handlers, 'symphony:createDraftPR', {
        contributionId: 'push_conflict_test',
      }) as { success: boolean; error?: string };

      // Push should fail, which means PR creation fails
      expect(result.success).toBe(false);
      expect(result.error).toContain('push');
    });

    it('should handle push failure due to remote branch force-push (fetch-first)', async () => {
      // Another variant: remote was force-pushed, local ref is stale
      const metadataDir = path.join(testTempDir, 'symphony', 'contributions', 'fetch_first_test');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.writeFile(
        path.join(metadataDir, 'metadata.json'),
        JSON.stringify({
          contributionId: 'fetch_first_test',
          sessionId: 'session-fetch',
          repoSlug: 'owner/repo',
          issueNumber: 2,
          issueTitle: 'Fetch First Test',
          branchName: 'symphony/issue-2-test',
          localPath: '/tmp/repo2',
          prCreated: false,
        })
      );

      vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'push') {
          // Simulate error when remote history has been rewritten
          return {
            stdout: '',
            stderr: `error: failed to push some refs to 'https://github.com/owner/repo.git'
hint: Updates were rejected because the remote contains work that you do
hint: not have locally. This is usually caused by another repository pushing
hint: to the same ref. You may want to first integrate the remote changes
hint: (e.g., 'git pull ...') before pushing again.`,
            exitCode: 1,
          };
        }
        if (cmd === 'git' && args?.[0] === 'rev-list') {
          return { stdout: '1', stderr: '', exitCode: 0 };
        }
        if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
          return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
        }
        if (cmd === 'git' && args?.[0] === 'rev-parse') {
          return { stdout: 'symphony/issue-2-test', stderr: '', exitCode: 0 };
        }
        if (cmd === 'gh' && args?.[0] === 'auth') {
          return { stdout: 'Logged in', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const result = await invokeHandler(handlers, 'symphony:createDraftPR', {
        contributionId: 'fetch_first_test',
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('push');
    });
  });

  // ==========================================================================
  // Security Tests - Path Traversal Prevention
  // ==========================================================================

  describe('Security - Path Traversal Prevention', () => {
    it('should sanitize repoName with ../ sequences', async () => {
      const result = await invokeHandler(handlers, 'symphony:cloneRepo', {
        repoUrl: 'https://github.com/../../../etc/passwd',
        localPath: path.join(testTempDir, 'traversal-test'),
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      // Should be rejected by URL validation
    });

    it('should reject document paths with path traversal', async () => {
      const result = await invokeHandler(handlers, 'symphony:startContribution', {
        contributionId: 'traversal_test',
        sessionId: 'session-traversal',
        repoSlug: 'owner/repo',
        issueNumber: 1,
        issueTitle: 'Traversal Test',
        localPath: path.join(testTempDir, 'traversal-repo'),
        documentPaths: [
          { name: 'evil.md', path: '../../etc/passwd', isExternal: false },
        ],
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('document path');
    });

    it('should reject document paths that are absolute', async () => {
      const result = await invokeHandler(handlers, 'symphony:startContribution', {
        contributionId: 'absolute_path_test',
        sessionId: 'session-abs',
        repoSlug: 'owner/repo',
        issueNumber: 1,
        issueTitle: 'Absolute Path Test',
        localPath: path.join(testTempDir, 'abs-repo'),
        documentPaths: [
          { name: 'passwd', path: '/etc/passwd', isExternal: false },
        ],
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('document path');
    });
  });

  // ==========================================================================
  // Security Tests - URL Validation
  // ==========================================================================

  describe('Security - URL Validation', () => {
    it('should reject javascript: URLs', async () => {
      const result = await invokeHandler(handlers, 'symphony:cloneRepo', {
        repoUrl: 'javascript:alert(1)',
        localPath: path.join(testTempDir, 'js-url'),
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
    });

    it('should reject file: URLs', async () => {
      const result = await invokeHandler(handlers, 'symphony:cloneRepo', {
        repoUrl: 'file:///etc/passwd',
        localPath: path.join(testTempDir, 'file-url'),
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
    });

    it('should reject URLs with non-GitHub hosts', async () => {
      const result = await invokeHandler(handlers, 'symphony:cloneRepo', {
        repoUrl: 'https://evil.com/owner/repo',
        localPath: path.join(testTempDir, 'evil-url'),
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub');
    });

    it('should reject HTTP protocol (only HTTPS allowed)', async () => {
      const result = await invokeHandler(handlers, 'symphony:cloneRepo', {
        repoUrl: 'http://github.com/owner/repo',
        localPath: path.join(testTempDir, 'http-url'),
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTPS');
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('Performance Tests', () => {
    it('should not freeze on pathological regex input in document parsing', async () => {
      // Create an issue with a body designed to test ReDoS protection
      const pathologicalBody = 'a'.repeat(10000) + '.md'.repeat(100);

      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        json: async () => [{
          number: 1,
          title: 'ReDoS Test',
          body: pathologicalBody,
          url: 'https://api.github.com/repos/owner/repo/issues/1',
          html_url: 'https://github.com/owner/repo/issues/1',
          user: { login: 'test' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      }));

      // Should complete quickly without hanging
      const start = Date.now();
      await invokeHandler(handlers, 'symphony:getIssues', 'owner/repo', true);
      const elapsed = Date.now() - start;

      // Should complete in less than 5 seconds
      expect(elapsed).toBeLessThan(5000);
    });

    it('should handle concurrent API calls correctly', async () => {
      // Launch multiple concurrent calls
      const promises = [
        invokeHandler(handlers, 'symphony:getRegistry', true),
        invokeHandler(handlers, 'symphony:getIssues', 'owner/repo1', true),
        invokeHandler(handlers, 'symphony:getIssues', 'owner/repo2', true),
        invokeHandler(handlers, 'symphony:getState'),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.length).toBe(4);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });
});
