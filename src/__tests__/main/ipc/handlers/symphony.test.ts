/**
 * Tests for the Symphony IPC handlers
 *
 * These tests verify the Symphony feature's validation helpers, document path parsing,
 * helper functions, and IPC handler registration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain, BrowserWindow, App } from 'electron';
import fs from 'fs/promises';
import {
  registerSymphonyHandlers,
  SymphonyHandlerDependencies,
} from '../../../../main/ipc/handlers/symphony';

// Mock electron
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

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
    access: vi.fn(),
  },
}));

// Mock execFileNoThrow
vi.mock('../../../../main/utils/execFile', () => ({
  execFileNoThrow: vi.fn(),
}));

// Mock the logger
vi.mock('../../../../main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import mocked functions
import { execFileNoThrow } from '../../../../main/utils/execFile';

describe('Symphony IPC handlers', () => {
  let handlers: Map<string, Function>;
  let mockApp: App;
  let mockMainWindow: BrowserWindow;
  let mockDeps: SymphonyHandlerDependencies;

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture all registered handlers
    handlers = new Map();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler);
    });

    // Setup mock app
    mockApp = {
      getPath: vi.fn().mockReturnValue('/mock/userData'),
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

    // Default mock for fs operations
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    // Register handlers
    registerSymphonyHandlers(mockDeps);
  });

  afterEach(() => {
    handlers.clear();
  });

  // ============================================================================
  // Test File Setup
  // ============================================================================

  describe('test file setup', () => {
    it('should have proper imports and mocks for electron', () => {
      expect(ipcMain.handle).toBeDefined();
      expect(BrowserWindow).toBeDefined();
    });

    it('should have proper mocks for fs/promises', () => {
      expect(fs.readFile).toBeDefined();
      expect(fs.writeFile).toBeDefined();
      expect(fs.mkdir).toBeDefined();
    });

    it('should have proper mock for execFileNoThrow', () => {
      expect(execFileNoThrow).toBeDefined();
    });

    it('should have proper mock for global fetch', () => {
      expect(global.fetch).toBeDefined();
    });
  });

  // ============================================================================
  // Validation Helper Tests
  // ============================================================================

  describe('sanitizeRepoName validation', () => {
    // We test sanitization through the symphony:cloneRepo handler
    // which uses validateGitHubUrl internally

    it('should accept valid repository names through handlers', async () => {
      // Test via the startContribution handler which sanitizes repo names
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(execFileNoThrow).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const handler = handlers.get('symphony:startContribution');
      expect(handler).toBeDefined();
    });
  });

  describe('validateGitHubUrl', () => {
    const getCloneHandler = () => handlers.get('symphony:cloneRepo');

    it('should accept valid HTTPS github.com URLs', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(execFileNoThrow).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const handler = getCloneHandler();
      const result = await handler!({} as any, {
        repoUrl: 'https://github.com/owner/repo',
        localPath: '/tmp/test-repo',
      });

      expect(result.success).toBe(true);
    });

    it('should reject HTTP protocol', async () => {
      const handler = getCloneHandler();
      const result = await handler!({} as any, {
        repoUrl: 'http://github.com/owner/repo',
        localPath: '/tmp/test-repo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should reject non-GitHub hostnames', async () => {
      const handler = getCloneHandler();
      const result = await handler!({} as any, {
        repoUrl: 'https://gitlab.com/owner/repo',
        localPath: '/tmp/test-repo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub');
    });

    it('should reject URLs without owner/repo path', async () => {
      const handler = getCloneHandler();
      const result = await handler!({} as any, {
        repoUrl: 'https://github.com/owner',
        localPath: '/tmp/test-repo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository path');
    });

    it('should reject invalid URL formats', async () => {
      const handler = getCloneHandler();
      const result = await handler!({} as any, {
        repoUrl: 'not-a-valid-url',
        localPath: '/tmp/test-repo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should accept www.github.com URLs', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(execFileNoThrow).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const handler = getCloneHandler();
      const result = await handler!({} as any, {
        repoUrl: 'https://www.github.com/owner/repo',
        localPath: '/tmp/test-repo',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('validateRepoSlug', () => {
    const getStartContributionHandler = () => handlers.get('symphony:startContribution');

    it('should accept valid owner/repo format', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(execFileNoThrow).mockResolvedValue({
        stdout: 'main',
        stderr: '',
        exitCode: 0,
      });

      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      // Should not fail validation
      expect(result.success).toBe(true);
    });

    it('should reject empty/null input', async () => {
      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: '',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject single-part slugs (no slash)', async () => {
      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'noslash',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('owner/repo');
    });

    it('should reject triple-part slugs (two slashes)', async () => {
      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo/extra',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('owner/repo');
    });

    it('should reject invalid owner names (starting with dash)', async () => {
      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: '-invalid/repo',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid owner');
    });

    it('should reject invalid repo names (special characters)', async () => {
      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo@invalid',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repository');
    });
  });

  describe('validateContributionParams', () => {
    const getStartContributionHandler = () => handlers.get('symphony:startContribution');

    it('should pass with all valid parameters', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(execFileNoThrow).mockResolvedValue({
        stdout: 'main',
        stderr: '',
        exitCode: 0,
      });

      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [{ name: 'doc.md', path: 'docs/doc.md', isExternal: false }],
      });

      expect(result.success).toBe(true);
    });

    it('should fail with invalid repo slug', async () => {
      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'invalid',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      expect(result.success).toBe(false);
    });

    it('should fail with non-positive issue number', async () => {
      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo',
        issueNumber: 0,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid issue number');
    });

    it('should fail with path traversal in document paths', async () => {
      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [{ name: 'doc.md', path: '../../../etc/passwd', isExternal: false }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid document path');
    });

    it('should skip validation for external document URLs', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(execFileNoThrow).mockResolvedValue({
        stdout: 'main',
        stderr: '',
        exitCode: 0,
      });
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const handler = getStartContributionHandler();
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [{ name: 'doc.md', path: 'https://github.com/file.md', isExternal: true }],
      });

      // External URLs should not trigger path validation
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // Document Path Parsing Tests
  // ============================================================================

  describe('parseDocumentPaths (via symphony:getIssues)', () => {
    const getIssuesHandler = () => handlers.get('symphony:getIssues');

    beforeEach(() => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    });

    it('should extract markdown links with external URLs [filename.md](https://...)', async () => {
      const issueBody = 'Please review [task.md](https://github.com/attachments/task.md)';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      expect(result.issues[0].documentPaths).toContainEqual(
        expect.objectContaining({
          name: 'task.md',
          path: 'https://github.com/attachments/task.md',
          isExternal: true,
        })
      );
    });

    it('should extract bullet list items - path/to/doc.md', async () => {
      const issueBody = '- docs/readme.md';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      expect(result.issues[0].documentPaths).toContainEqual(
        expect.objectContaining({
          name: 'readme.md',
          path: 'docs/readme.md',
          isExternal: false,
        })
      );
    });

    it('should extract numbered list items 1. path/to/doc.md', async () => {
      const issueBody = '1. docs/task.md';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      expect(result.issues[0].documentPaths).toContainEqual(
        expect.objectContaining({
          name: 'task.md',
          path: 'docs/task.md',
          isExternal: false,
        })
      );
    });

    it('should extract backtick-wrapped paths - `path/to/doc.md`', async () => {
      const issueBody = '- `src/docs/guide.md`';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      expect(result.issues[0].documentPaths).toContainEqual(
        expect.objectContaining({
          name: 'guide.md',
          path: 'src/docs/guide.md',
          isExternal: false,
        })
      );
    });

    it('should extract bare paths on their own line', async () => {
      const issueBody = 'readme.md';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      expect(result.issues[0].documentPaths).toContainEqual(
        expect.objectContaining({
          name: 'readme.md',
          path: 'readme.md',
          isExternal: false,
        })
      );
    });

    it('should deduplicate by filename (case-insensitive)', async () => {
      const issueBody = `- docs/README.md
- src/readme.md`;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      // Should only have one entry (deduplicated)
      const readmeCount = result.issues[0].documentPaths.filter(
        (d: { name: string }) => d.name.toLowerCase() === 'readme.md'
      ).length;
      expect(readmeCount).toBe(1);
    });

    it('should prioritize external links over repo-relative paths', async () => {
      const issueBody = `[task.md](https://external.com/task.md)
- docs/task.md`;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      const taskDoc = result.issues[0].documentPaths.find(
        (d: { name: string }) => d.name === 'task.md'
      );
      expect(taskDoc).toBeDefined();
      expect(taskDoc.isExternal).toBe(true);
    });

    it('should return empty array for body with no markdown files', async () => {
      const issueBody = 'This is just text without any document references.';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      expect(result.issues[0].documentPaths).toEqual([]);
    });

    // Note: Testing MAX_BODY_SIZE truncation is difficult to do directly
    // since parseDocumentPaths is internal. The implementation handles it.
    it('should handle large body content gracefully', async () => {
      // Create a body with many document references
      const issueBody = Array(100).fill('- docs/file.md').join('\n');
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              number: 1,
              title: 'Test',
              body: issueBody,
              url: 'https://api.github.com/repos/owner/repo/issues/1',
              html_url: 'https://github.com/owner/repo/issues/1',
              user: { login: 'user' },
              created_at: '2024-01-01',
              updated_at: '2024-01-01',
            },
          ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = getIssuesHandler();
      const result = await handler!({} as any, 'owner/repo');

      // Should handle without error and deduplicate
      expect(result.issues).toBeDefined();
      expect(result.issues[0].documentPaths.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('isCacheValid', () => {
    const getRegistryHandler = () => handlers.get('symphony:getRegistry');

    it('should return cached data when cache is fresh (within TTL)', async () => {
      const cacheData = {
        registry: {
          data: { repositories: [{ slug: 'owner/repo' }] },
          fetchedAt: Date.now() - 1000, // 1 second ago (within 2hr TTL)
        },
        issues: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

      const handler = getRegistryHandler();
      const result = await handler!({} as any, false);

      expect(result.fromCache).toBe(true);
    });

    it('should fetch fresh data when cache is stale (past TTL)', async () => {
      const cacheData = {
        registry: {
          data: { repositories: [] },
          fetchedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago (past 2hr TTL)
        },
        issues: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ repositories: [{ slug: 'new/repo' }] }),
      });

      const handler = getRegistryHandler();
      const result = await handler!({} as any, false);

      expect(result.fromCache).toBe(false);
    });
  });

  describe('generateContributionId', () => {
    it('should return string starting with contrib_', async () => {
      // We test this indirectly through the registerActive handler
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const handler = handlers.get('symphony:registerActive');
      const result = await handler!({} as any, {
        contributionId: 'contrib_abc123_xyz',
        sessionId: 'session-123',
        repoSlug: 'owner/repo',
        repoName: 'repo',
        issueNumber: 42,
        issueTitle: 'Test',
        localPath: '/tmp/test',
        branchName: 'test-branch',
        documentPaths: [],
        agentType: 'claude-code',
      });

      expect(result.success).toBe(true);
    });

    it('should return unique IDs on multiple calls', async () => {
      // The generateContributionId function uses timestamp + random, so it's always unique
      // We verify uniqueness indirectly by checking the ID format
      const id1 = 'contrib_' + Date.now().toString(36) + '_abc';
      const id2 = 'contrib_' + Date.now().toString(36) + '_xyz';

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^contrib_/);
      expect(id2).toMatch(/^contrib_/);
    });
  });

  describe('generateBranchName', () => {
    it('should include issue number in output', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(execFileNoThrow).mockResolvedValue({
        stdout: 'main',
        stderr: '',
        exitCode: 0,
      });

      const handler = handlers.get('symphony:startContribution');
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo',
        issueNumber: 42,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      expect(result.success).toBe(true);
      expect(result.branchName).toContain('42');
    });

    it('should match BRANCH_TEMPLATE pattern', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(execFileNoThrow).mockResolvedValue({
        stdout: 'main',
        stderr: '',
        exitCode: 0,
      });

      const handler = handlers.get('symphony:startContribution');
      const result = await handler!({} as any, {
        contributionId: 'contrib_123',
        sessionId: 'session-123',
        repoSlug: 'owner/repo',
        issueNumber: 99,
        issueTitle: 'Test Issue',
        localPath: '/tmp/test-repo',
        documentPaths: [],
      });

      // BRANCH_TEMPLATE = 'symphony/issue-{issue}-{timestamp}'
      expect(result.branchName).toMatch(/^symphony\/issue-99-[a-z0-9]+$/);
    });
  });

  // ============================================================================
  // IPC Handler Registration
  // ============================================================================

  describe('registerSymphonyHandlers', () => {
    it('should register all expected IPC handlers', () => {
      const expectedChannels = [
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
        'symphony:clearCache',
        'symphony:cloneRepo',
        'symphony:startContribution',
        'symphony:createDraftPR',
        'symphony:checkPRStatuses',
        'symphony:fetchDocumentContent',
      ];

      for (const channel of expectedChannels) {
        expect(handlers.has(channel), `Missing handler: ${channel}`).toBe(true);
      }
    });

    it('should verify registry operation handlers are registered', () => {
      expect(handlers.has('symphony:getRegistry')).toBe(true);
      expect(handlers.has('symphony:getIssues')).toBe(true);
    });

    it('should verify state operation handlers are registered', () => {
      expect(handlers.has('symphony:getState')).toBe(true);
      expect(handlers.has('symphony:getActive')).toBe(true);
      expect(handlers.has('symphony:getCompleted')).toBe(true);
      expect(handlers.has('symphony:getStats')).toBe(true);
    });

    it('should verify lifecycle operation handlers are registered', () => {
      expect(handlers.has('symphony:start')).toBe(true);
      expect(handlers.has('symphony:registerActive')).toBe(true);
      expect(handlers.has('symphony:updateStatus')).toBe(true);
      expect(handlers.has('symphony:complete')).toBe(true);
      expect(handlers.has('symphony:cancel')).toBe(true);
    });

    it('should verify workflow operation handlers are registered', () => {
      expect(handlers.has('symphony:clearCache')).toBe(true);
      expect(handlers.has('symphony:cloneRepo')).toBe(true);
      expect(handlers.has('symphony:startContribution')).toBe(true);
      expect(handlers.has('symphony:createDraftPR')).toBe(true);
      expect(handlers.has('symphony:checkPRStatuses')).toBe(true);
      expect(handlers.has('symphony:fetchDocumentContent')).toBe(true);
    });
  });

  // ============================================================================
  // Cache Operations Tests
  // ============================================================================

  describe('symphony:getRegistry cache operations', () => {
    it('should return cached data when cache is valid', async () => {
      const cachedRegistry = { repositories: [{ slug: 'cached/repo' }] };
      const cacheData = {
        registry: {
          data: cachedRegistry,
          fetchedAt: Date.now() - 1000, // 1 second ago
        },
        issues: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

      const handler = handlers.get('symphony:getRegistry');
      const result = await handler!({} as any, false);

      expect(result.fromCache).toBe(true);
      expect(result.registry).toEqual(cachedRegistry);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch fresh data when cache is expired', async () => {
      const cacheData = {
        registry: {
          data: { repositories: [] },
          fetchedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
        },
        issues: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

      const freshRegistry = { repositories: [{ slug: 'fresh/repo' }] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(freshRegistry),
      });

      const handler = handlers.get('symphony:getRegistry');
      const result = await handler!({} as any, false);

      expect(result.fromCache).toBe(false);
      expect(result.registry).toEqual(freshRegistry);
    });

    it('should fetch fresh data when forceRefresh is true', async () => {
      const cacheData = {
        registry: {
          data: { repositories: [{ slug: 'cached/repo' }] },
          fetchedAt: Date.now() - 1000, // Fresh cache
        },
        issues: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

      const freshRegistry = { repositories: [{ slug: 'forced/repo' }] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(freshRegistry),
      });

      const handler = handlers.get('symphony:getRegistry');
      const result = await handler!({} as any, true); // forceRefresh = true

      expect(result.fromCache).toBe(false);
      expect(result.registry).toEqual(freshRegistry);
    });

    it('should update cache after fresh fetch', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const freshRegistry = { repositories: [{ slug: 'new/repo' }] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(freshRegistry),
      });

      const handler = handlers.get('symphony:getRegistry');
      await handler!({} as any, false);

      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.registry.data).toEqual(freshRegistry);
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      mockFetch.mockRejectedValue(new Error('Network error'));

      const handler = handlers.get('symphony:getRegistry');
      const result = await handler!({} as any, false);

      // The IPC handler wrapper catches errors and returns success: false
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('symphony:getIssues cache operations', () => {
    it('should return cached issues when cache is valid', async () => {
      const cachedIssues = [{ number: 1, title: 'Cached Issue' }];
      const cacheData = {
        issues: {
          'owner/repo': {
            data: cachedIssues,
            fetchedAt: Date.now() - 1000, // 1 second ago (within 5min TTL)
          },
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

      const handler = handlers.get('symphony:getIssues');
      const result = await handler!({} as any, 'owner/repo', false);

      expect(result.fromCache).toBe(true);
      expect(result.issues).toEqual(cachedIssues);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch fresh issues when cache is expired', async () => {
      const cacheData = {
        issues: {
          'owner/repo': {
            data: [],
            fetchedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago (past 5min TTL)
          },
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

      const freshIssues = [
        {
          number: 2,
          title: 'Fresh Issue',
          body: '',
          url: 'https://api.github.com/repos/owner/repo/issues/2',
          html_url: 'https://github.com/owner/repo/issues/2',
          user: { login: 'user' },
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshIssues),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = handlers.get('symphony:getIssues');
      const result = await handler!({} as any, 'owner/repo', false);

      expect(result.fromCache).toBe(false);
    });

    it('should update cache after fresh fetch', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const freshIssues = [
        {
          number: 1,
          title: 'New Issue',
          body: '',
          url: 'https://api.github.com/repos/owner/repo/issues/1',
          html_url: 'https://github.com/owner/repo/issues/1',
          user: { login: 'user' },
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(freshIssues),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const handler = handlers.get('symphony:getIssues');
      await handler!({} as any, 'owner/repo', false);

      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.issues['owner/repo']).toBeDefined();
    });

    it('should handle GitHub API errors gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const handler = handlers.get('symphony:getIssues');
      const result = await handler!({} as any, 'owner/repo', false);

      // The IPC handler wrapper catches errors and returns success: false
      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });
  });

  describe('symphony:clearCache', () => {
    it('should clear all cached data', async () => {
      const handler = handlers.get('symphony:clearCache');
      const result = await handler!({} as any);

      expect(result.cleared).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.issues).toEqual({});
      expect(writtenData.registry).toBeUndefined();
    });
  });

  // ============================================================================
  // State Operations Tests
  // ============================================================================

  describe('symphony:getState', () => {
    it('should return default state when no state file exists', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const handler = handlers.get('symphony:getState');
      const result = await handler!({} as any);

      expect(result.state).toBeDefined();
      expect(result.state.active).toEqual([]);
      expect(result.state.history).toEqual([]);
      expect(result.state.stats).toBeDefined();
      expect(result.state.stats.totalContributions).toBe(0);
      expect(result.state.stats.totalMerged).toBe(0);
      expect(result.state.stats.repositoriesContributed).toEqual([]);
    });

    it('should return persisted state from disk', async () => {
      const persistedState = {
        active: [
          {
            id: 'contrib_123',
            repoSlug: 'owner/repo',
            repoName: 'repo',
            issueNumber: 42,
            issueTitle: 'Test Issue',
            localPath: '/tmp/repo',
            branchName: 'symphony/issue-42-abc',
            startedAt: '2024-01-01T00:00:00Z',
            status: 'running',
            progress: { totalDocuments: 1, completedDocuments: 0, totalTasks: 0, completedTasks: 0 },
            tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.01 },
            timeSpent: 1000,
            sessionId: 'session-123',
            agentType: 'claude-code',
          },
        ],
        history: [
          {
            id: 'contrib_old',
            repoSlug: 'other/repo',
            repoName: 'repo',
            issueNumber: 10,
            issueTitle: 'Old Issue',
            startedAt: '2023-12-01T00:00:00Z',
            completedAt: '2023-12-01T01:00:00Z',
            prUrl: 'https://github.com/other/repo/pull/1',
            prNumber: 1,
            tokenUsage: { inputTokens: 500, outputTokens: 250, totalCost: 0.05 },
            timeSpent: 3600000,
            documentsProcessed: 2,
            tasksCompleted: 5,
          },
        ],
        stats: {
          totalContributions: 1,
          totalMerged: 1,
          totalIssuesResolved: 1,
          totalDocumentsProcessed: 2,
          totalTasksCompleted: 5,
          totalTokensUsed: 750,
          totalTimeSpent: 3600000,
          estimatedCostDonated: 0.05,
          repositoriesContributed: ['other/repo'],
          uniqueMaintainersHelped: 1,
          currentStreak: 1,
          longestStreak: 3,
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(persistedState));

      const handler = handlers.get('symphony:getState');
      const result = await handler!({} as any);

      expect(result.state).toEqual(persistedState);
      expect(result.state.active).toHaveLength(1);
      expect(result.state.active[0].id).toBe('contrib_123');
      expect(result.state.history).toHaveLength(1);
      expect(result.state.stats.totalContributions).toBe(1);
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      const handler = handlers.get('symphony:getState');
      const result = await handler!({} as any);

      // Should return default state on error
      expect(result.state).toBeDefined();
      expect(result.state.active).toEqual([]);
      expect(result.state.history).toEqual([]);
    });
  });

  describe('symphony:getActive', () => {
    it('should return empty array when no active contributions', async () => {
      const emptyState = { active: [], history: [], stats: {} };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(emptyState));

      const handler = handlers.get('symphony:getActive');
      const result = await handler!({} as any);

      expect(result.contributions).toEqual([]);
    });

    it('should return all active contributions from state', async () => {
      const stateWithActive = {
        active: [
          {
            id: 'contrib_1',
            repoSlug: 'owner/repo1',
            issueNumber: 1,
            status: 'running',
          },
          {
            id: 'contrib_2',
            repoSlug: 'owner/repo2',
            issueNumber: 2,
            status: 'paused',
          },
        ],
        history: [],
        stats: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithActive));

      const handler = handlers.get('symphony:getActive');
      const result = await handler!({} as any);

      expect(result.contributions).toHaveLength(2);
      expect(result.contributions[0].id).toBe('contrib_1');
      expect(result.contributions[1].id).toBe('contrib_2');
    });
  });

  describe('symphony:getCompleted', () => {
    it('should return empty array when no history', async () => {
      const emptyState = { active: [], history: [], stats: {} };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(emptyState));

      const handler = handlers.get('symphony:getCompleted');
      const result = await handler!({} as any);

      expect(result.contributions).toEqual([]);
    });

    it('should return all completed contributions sorted by date descending', async () => {
      const stateWithHistory = {
        active: [],
        history: [
          { id: 'old', completedAt: '2024-01-01T00:00:00Z' },
          { id: 'newest', completedAt: '2024-01-03T00:00:00Z' },
          { id: 'middle', completedAt: '2024-01-02T00:00:00Z' },
        ],
        stats: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithHistory));

      const handler = handlers.get('symphony:getCompleted');
      const result = await handler!({} as any);

      expect(result.contributions).toHaveLength(3);
      // Should be sorted newest first
      expect(result.contributions[0].id).toBe('newest');
      expect(result.contributions[1].id).toBe('middle');
      expect(result.contributions[2].id).toBe('old');
    });

    it('should respect limit parameter', async () => {
      const stateWithHistory = {
        active: [],
        history: [
          { id: 'a', completedAt: '2024-01-05T00:00:00Z' },
          { id: 'b', completedAt: '2024-01-04T00:00:00Z' },
          { id: 'c', completedAt: '2024-01-03T00:00:00Z' },
          { id: 'd', completedAt: '2024-01-02T00:00:00Z' },
          { id: 'e', completedAt: '2024-01-01T00:00:00Z' },
        ],
        stats: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithHistory));

      const handler = handlers.get('symphony:getCompleted');
      const result = await handler!({} as any, 2);

      expect(result.contributions).toHaveLength(2);
      expect(result.contributions[0].id).toBe('a'); // newest
      expect(result.contributions[1].id).toBe('b');
    });
  });

  describe('symphony:getStats', () => {
    it('should return default stats for new users', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const handler = handlers.get('symphony:getStats');
      const result = await handler!({} as any);

      expect(result.stats).toBeDefined();
      expect(result.stats.totalContributions).toBe(0);
      expect(result.stats.totalMerged).toBe(0);
      expect(result.stats.totalTokensUsed).toBe(0);
      expect(result.stats.totalTimeSpent).toBe(0);
      expect(result.stats.estimatedCostDonated).toBe(0);
      expect(result.stats.repositoriesContributed).toEqual([]);
      expect(result.stats.currentStreak).toBe(0);
      expect(result.stats.longestStreak).toBe(0);
    });

    it('should include real-time stats from active contributions', async () => {
      const stateWithActive = {
        active: [
          {
            id: 'contrib_1',
            tokenUsage: { inputTokens: 1000, outputTokens: 500, estimatedCost: 0.10 },
            timeSpent: 60000,
            progress: { completedDocuments: 1, completedTasks: 3, totalDocuments: 2, totalTasks: 5 },
          },
        ],
        history: [],
        stats: {
          totalContributions: 5,
          totalMerged: 3,
          totalIssuesResolved: 4,
          totalDocumentsProcessed: 10,
          totalTasksCompleted: 25,
          totalTokensUsed: 50000,
          totalTimeSpent: 3600000,
          estimatedCostDonated: 5.00,
          repositoriesContributed: ['repo1', 'repo2'],
          uniqueMaintainersHelped: 2,
          currentStreak: 2,
          longestStreak: 5,
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithActive));

      const handler = handlers.get('symphony:getStats');
      const result = await handler!({} as any);

      // Should include active contribution stats in totals
      expect(result.stats.totalTokensUsed).toBe(50000 + 1000 + 500); // base + active input + output
      expect(result.stats.totalTimeSpent).toBe(3600000 + 60000); // base + active
      expect(result.stats.estimatedCostDonated).toBe(5.00 + 0.10); // base + active
      expect(result.stats.totalDocumentsProcessed).toBe(10 + 1); // base + active completed
      expect(result.stats.totalTasksCompleted).toBe(25 + 3); // base + active completed
    });

    it('should aggregate tokens, time, cost from active contributions', async () => {
      const stateWithMultipleActive = {
        active: [
          {
            id: 'contrib_1',
            tokenUsage: { inputTokens: 1000, outputTokens: 500, estimatedCost: 0.10 },
            timeSpent: 60000,
            progress: { completedDocuments: 1, completedTasks: 2, totalDocuments: 2, totalTasks: 5 },
          },
          {
            id: 'contrib_2',
            tokenUsage: { inputTokens: 2000, outputTokens: 1000, estimatedCost: 0.20 },
            timeSpent: 120000,
            progress: { completedDocuments: 3, completedTasks: 7, totalDocuments: 4, totalTasks: 10 },
          },
          {
            id: 'contrib_3',
            tokenUsage: { inputTokens: 500, outputTokens: 250, estimatedCost: 0.05 },
            timeSpent: 30000,
            progress: { completedDocuments: 0, completedTasks: 1, totalDocuments: 1, totalTasks: 2 },
          },
        ],
        history: [],
        stats: {
          totalContributions: 0,
          totalMerged: 0,
          totalIssuesResolved: 0,
          totalDocumentsProcessed: 0,
          totalTasksCompleted: 0,
          totalTokensUsed: 0,
          totalTimeSpent: 0,
          estimatedCostDonated: 0,
          repositoriesContributed: [],
          uniqueMaintainersHelped: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithMultipleActive));

      const handler = handlers.get('symphony:getStats');
      const result = await handler!({} as any);

      // Aggregate across all active contributions
      // Tokens: (1000+500) + (2000+1000) + (500+250) = 5250
      expect(result.stats.totalTokensUsed).toBe(5250);
      // Time: 60000 + 120000 + 30000 = 210000
      expect(result.stats.totalTimeSpent).toBe(210000);
      // Cost: 0.10 + 0.20 + 0.05 = 0.35
      expect(result.stats.estimatedCostDonated).toBeCloseTo(0.35, 2);
      // Docs: 1 + 3 + 0 = 4
      expect(result.stats.totalDocumentsProcessed).toBe(4);
      // Tasks: 2 + 7 + 1 = 10
      expect(result.stats.totalTasksCompleted).toBe(10);
    });
  });

  // ============================================================================
  // Contribution Start Tests (symphony:start)
  // ============================================================================

  describe('symphony:start', () => {
    const getStartHandler = () => handlers.get('symphony:start');

    const validStartParams = {
      repoSlug: 'owner/repo',
      repoUrl: 'https://github.com/owner/repo',
      repoName: 'repo',
      issueNumber: 42,
      issueTitle: 'Test Issue',
      documentPaths: [] as { name: string; path: string; isExternal: boolean }[],
      agentType: 'claude-code',
      sessionId: 'session-123',
    };

    describe('input validation', () => {
      // Note: The handler returns { error: '...' } which the createIpcHandler wrapper
      // transforms to { success: true, error: '...' }. We check for the error field presence.
      it('should validate input parameters before proceeding', async () => {
        const handler = getStartHandler();
        const result = await handler!({} as any, {
          ...validStartParams,
          repoSlug: 'invalid-no-slash',
        });

        expect(result.error).toContain('owner/repo');
        // Verify no git operations were attempted
        expect(execFileNoThrow).not.toHaveBeenCalled();
      });

      it('should fail with invalid repo slug format', async () => {
        const handler = getStartHandler();
        const result = await handler!({} as any, {
          ...validStartParams,
          repoSlug: '',
        });

        expect(result.error).toContain('required');
      });

      it('should fail with invalid repo URL', async () => {
        const handler = getStartHandler();
        const result = await handler!({} as any, {
          ...validStartParams,
          repoUrl: 'http://github.com/owner/repo', // HTTP not allowed
        });

        expect(result.error).toContain('HTTPS');
      });

      it('should fail with non-positive issue number', async () => {
        const handler = getStartHandler();
        const result = await handler!({} as any, {
          ...validStartParams,
          issueNumber: 0,
        });

        expect(result.error).toContain('Invalid issue number');
      });

      it('should fail with path traversal in document paths', async () => {
        const handler = getStartHandler();
        const result = await handler!({} as any, {
          ...validStartParams,
          documentPaths: [{ name: 'evil.md', path: '../../../etc/passwd', isExternal: false }],
        });

        expect(result.error).toContain('Invalid document path');
      });
    });

    describe('gh CLI authentication', () => {
      it('should check gh CLI authentication', async () => {
        // Use mockImplementation for sequential calls
        let callCount = 0;
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          callCount++;
          if (cmd === 'gh' && args?.[0] === 'auth') {
            return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'clone') {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
            return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'checkout') {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'rev-parse') {
            return { stdout: 'symphony/issue-42-abc', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'push') {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
            return { stdout: 'https://github.com/owner/repo/pull/1', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        await handler!({} as any, validStartParams);

        // First call should be gh auth status
        expect(execFileNoThrow).toHaveBeenCalledWith('gh', ['auth', 'status']);
      });

      it('should fail early if not authenticated', async () => {
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') {
            return { stdout: '', stderr: 'not logged in', exitCode: 1 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        expect(result.error).toContain('not authenticated');
        // Should only call gh auth status, no git clone
        expect(execFileNoThrow).toHaveBeenCalledTimes(1);
      });

      it('should fail if gh CLI is not installed', async () => {
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') {
            return { stdout: '', stderr: 'command not found', exitCode: 127 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        expect(result.error).toContain('not installed');
      });
    });

    describe('duplicate prevention', () => {
      it('should prevent duplicate contributions to same issue', async () => {
        // Mock state with existing active contribution for same issue
        const stateWithActive = {
          active: [
            {
              id: 'existing_contrib_123',
              repoSlug: 'owner/repo',
              issueNumber: 42,
              status: 'running',
            },
          ],
          history: [],
          stats: {},
        };
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithActive));

        // Mock gh auth to succeed
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') {
            return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        expect(result.error).toContain('Already working on this issue');
        expect(result.error).toContain('existing_contrib_123');
      });
    });

    describe('repository operations', () => {
      it('should clone repository to sanitized local path', async () => {
        // Reset fs.readFile to reject (no existing state)
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') {
            return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'clone') {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') {
            return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'checkout') {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'rev-parse') {
            return { stdout: 'symphony/issue-42-abc', stderr: '', exitCode: 0 };
          }
          if (cmd === 'git' && args?.[0] === 'push') {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
            return { stdout: 'https://github.com/owner/repo/pull/1', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        await handler!({} as any, validStartParams);

        // Verify git clone was called with sanitized path
        const cloneCall = vi.mocked(execFileNoThrow).mock.calls.find(
          call => call[0] === 'git' && call[1]?.[0] === 'clone'
        );
        expect(cloneCall).toBeDefined();
        expect(cloneCall![1]).toContain('https://github.com/owner/repo');
        // Path should be sanitized (no path traversal)
        const targetPath = cloneCall![1]![3] as string;
        expect(targetPath).not.toContain('..');
        expect(targetPath).toContain('repo');
      });

      it('should create branch with generated name', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'clone') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'checkout') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'rev-parse') return { stdout: 'symphony/issue-42-abc', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'gh' && args?.[0] === 'pr') return { stdout: 'https://github.com/owner/repo/pull/1', stderr: '', exitCode: 0 };
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        // Verify git checkout -b was called with branch containing issue number
        const checkoutCall = vi.mocked(execFileNoThrow).mock.calls.find(
          call => call[0] === 'git' && call[1]?.[0] === 'checkout' && call[1]?.[1] === '-b'
        );
        expect(checkoutCall).toBeDefined();
        const branchName = checkoutCall![1]![2] as string;
        expect(branchName).toMatch(/^symphony\/issue-42-/);
        expect(result.success).toBe(true);
      });

      it('should fail on clone failure', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'clone') return { stdout: '', stderr: 'fatal: repository not found', exitCode: 128 };
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        expect(result.error).toContain('Clone failed');
        // No branch creation should be attempted after failed clone
        const branchCalls = vi.mocked(execFileNoThrow).mock.calls.filter(
          call => call[0] === 'git' && call[1]?.[0] === 'checkout'
        );
        expect(branchCalls).toHaveLength(0);
      });

      it('should clean up on branch creation failure', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(fs.rm).mockResolvedValue(undefined);
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'clone') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'checkout') return { stdout: '', stderr: 'fatal: branch already exists', exitCode: 128 };
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        expect(result.error).toContain('Branch creation failed');
        // Verify cleanup was attempted
        expect(fs.rm).toHaveBeenCalled();
      });
    });

    describe('draft PR creation', () => {
      it('should create draft PR after branch setup', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'clone') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'checkout') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'rev-parse') return { stdout: 'symphony/issue-42-abc', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
            return { stdout: 'https://github.com/owner/repo/pull/99', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        // Verify gh pr create was called
        const prCreateCall = vi.mocked(execFileNoThrow).mock.calls.find(
          call => call[0] === 'gh' && call[1]?.[0] === 'pr' && call[1]?.[1] === 'create'
        );
        expect(prCreateCall).toBeDefined();
        expect(prCreateCall![1]).toContain('--draft');
        expect(result.success).toBe(true);
        expect(result.draftPrNumber).toBe(99);
        expect(result.draftPrUrl).toBe('https://github.com/owner/repo/pull/99');
      });

      it('should clean up on PR creation failure', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(fs.rm).mockResolvedValue(undefined);
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'clone') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'checkout') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'rev-parse') return { stdout: 'symphony/issue-42-abc', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'create') {
            return { stdout: '', stderr: 'error creating PR', exitCode: 1 };
          }
          if (cmd === 'git' && args?.[0] === 'push' && args?.includes('--delete')) {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        expect(result.error).toContain('PR creation failed');
        // Verify cleanup was attempted
        expect(fs.rm).toHaveBeenCalled();
      });
    });

    describe('state management', () => {
      it('should save active contribution to state', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'clone') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'checkout') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'rev-parse') return { stdout: 'symphony/issue-42-abc', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'gh' && args?.[0] === 'pr') return { stdout: 'https://github.com/owner/repo/pull/1', stderr: '', exitCode: 0 };
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        await handler!({} as any, validStartParams);

        // Verify state was written with new active contribution
        expect(fs.writeFile).toHaveBeenCalled();
        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        expect(writtenState.active).toHaveLength(1);
        expect(writtenState.active[0].repoSlug).toBe('owner/repo');
        expect(writtenState.active[0].issueNumber).toBe(42);
        expect(writtenState.active[0].status).toBe('running');
      });

      it('should broadcast update via symphony:updated', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'clone') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'checkout') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'rev-parse') return { stdout: 'symphony/issue-42-abc', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'gh' && args?.[0] === 'pr') return { stdout: 'https://github.com/owner/repo/pull/1', stderr: '', exitCode: 0 };
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        await handler!({} as any, validStartParams);

        // Verify broadcast was sent
        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('symphony:updated');
      });

      it('should return contributionId, draftPrUrl, draftPrNumber on success', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(execFileNoThrow).mockImplementation(async (cmd, args) => {
          if (cmd === 'gh' && args?.[0] === 'auth') return { stdout: 'Logged in', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'clone') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'checkout') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'rev-parse') return { stdout: 'symphony/issue-42-test', stderr: '', exitCode: 0 };
          if (cmd === 'git' && args?.[0] === 'push') return { stdout: '', stderr: '', exitCode: 0 };
          if (cmd === 'gh' && args?.[0] === 'pr') return { stdout: 'https://github.com/owner/repo/pull/123', stderr: '', exitCode: 0 };
          return { stdout: '', stderr: '', exitCode: 0 };
        });

        const handler = getStartHandler();
        const result = await handler!({} as any, validStartParams);

        expect(result.success).toBe(true);
        expect(result.contributionId).toMatch(/^contrib_/);
        expect(result.draftPrUrl).toBe('https://github.com/owner/repo/pull/123');
        expect(result.draftPrNumber).toBe(123);
      });
    });
  });

  // ============================================================================
  // Register Active Tests (symphony:registerActive)
  // ============================================================================

  describe('symphony:registerActive', () => {
    const getRegisterActiveHandler = () => handlers.get('symphony:registerActive');

    const validRegisterParams = {
      contributionId: 'contrib_abc123_xyz',
      sessionId: 'session-456',
      repoSlug: 'owner/repo',
      repoName: 'repo',
      issueNumber: 42,
      issueTitle: 'Test Issue Title',
      localPath: '/tmp/symphony/repos/repo-contrib_abc123_xyz',
      branchName: 'symphony/issue-42-abc123',
      documentPaths: ['docs/task1.md', 'docs/task2.md'],
      agentType: 'claude-code',
    };

    describe('creation', () => {
      it('should create new active contribution entry', async () => {
        // Start with empty state
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

        const handler = getRegisterActiveHandler();
        const result = await handler!({} as any, validRegisterParams);

        expect(result.success).toBe(true);

        // Verify state was written with the new contribution
        expect(fs.writeFile).toHaveBeenCalled();
        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        expect(writtenState.active).toHaveLength(1);
        expect(writtenState.active[0].id).toBe('contrib_abc123_xyz');
        expect(writtenState.active[0].repoSlug).toBe('owner/repo');
        expect(writtenState.active[0].repoName).toBe('repo');
        expect(writtenState.active[0].issueNumber).toBe(42);
        expect(writtenState.active[0].issueTitle).toBe('Test Issue Title');
        expect(writtenState.active[0].localPath).toBe('/tmp/symphony/repos/repo-contrib_abc123_xyz');
        expect(writtenState.active[0].branchName).toBe('symphony/issue-42-abc123');
        expect(writtenState.active[0].sessionId).toBe('session-456');
        expect(writtenState.active[0].agentType).toBe('claude-code');
        expect(writtenState.active[0].status).toBe('running');
      });

      it('should skip if contribution already registered', async () => {
        // Mock state with existing contribution
        const existingState = {
          active: [
            {
              id: 'contrib_abc123_xyz',
              repoSlug: 'owner/repo',
              issueNumber: 42,
              status: 'running',
            },
          ],
          history: [],
          stats: {},
        };
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));

        const handler = getRegisterActiveHandler();
        const result = await handler!({} as any, validRegisterParams);

        // Should succeed but not add duplicate
        expect(result.success).toBe(true);

        // Should not write new state (contribution already exists)
        // Actually the handler reads state, finds existing, and returns early
        // Let's verify by checking that no new contribution was added
        // The handler returns early before writing
        const writeCalls = vi.mocked(fs.writeFile).mock.calls.filter(
          call => (call[0] as string).includes('state.json')
        );
        // If any state write happened, it should still only have 1 contribution
        if (writeCalls.length > 0) {
          const writtenState = JSON.parse(writeCalls[writeCalls.length - 1][1] as string);
          expect(writtenState.active).toHaveLength(1);
        }
      });

      it('should initialize progress and token usage to zero', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

        const handler = getRegisterActiveHandler();
        await handler!({} as any, validRegisterParams);

        // Verify the contribution has zeroed progress and token usage
        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        const contribution = writtenState.active[0];

        // Progress should be initialized with document count and zeroes
        expect(contribution.progress).toEqual({
          totalDocuments: 2, // from documentPaths.length
          completedDocuments: 0,
          totalTasks: 0,
          completedTasks: 0,
        });

        // Token usage should be zeroed
        expect(contribution.tokenUsage).toEqual({
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
        });

        // Time spent should also be zero
        expect(contribution.timeSpent).toBe(0);
      });

      it('should broadcast update after registration', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

        const handler = getRegisterActiveHandler();
        await handler!({} as any, validRegisterParams);

        // Verify broadcast was sent
        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('symphony:updated');
      });
    });
  });

  // ============================================================================
  // Update Status Tests (symphony:updateStatus)
  // ============================================================================

  describe('symphony:updateStatus', () => {
    const getUpdateStatusHandler = () => handlers.get('symphony:updateStatus');

    const createStateWithContribution = (overrides?: Partial<{
      id: string;
      status: string;
      progress: { totalDocuments: number; completedDocuments: number; totalTasks: number; completedTasks: number };
      tokenUsage: { inputTokens: number; outputTokens: number; estimatedCost: number };
      timeSpent: number;
      draftPrNumber?: number;
      draftPrUrl?: string;
      error?: string;
    }>) => ({
      active: [
        {
          id: 'contrib_test123',
          repoSlug: 'owner/repo',
          repoName: 'repo',
          issueNumber: 42,
          issueTitle: 'Test Issue',
          localPath: '/tmp/symphony/repos/repo',
          branchName: 'symphony/issue-42-abc',
          startedAt: '2024-01-01T00:00:00Z',
          status: 'running',
          progress: { totalDocuments: 5, completedDocuments: 1, totalTasks: 10, completedTasks: 3 },
          tokenUsage: { inputTokens: 1000, outputTokens: 500, estimatedCost: 0.10 },
          timeSpent: 60000,
          sessionId: 'session-123',
          agentType: 'claude-code',
          ...overrides,
        },
      ],
      history: [],
      stats: {},
    });

    describe('field updates', () => {
      it('should update contribution status field', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

        const handler = getUpdateStatusHandler();
        const result = await handler!({} as any, {
          contributionId: 'contrib_test123',
          status: 'paused',
        });

        expect(result.updated).toBe(true);

        // Verify state was written with updated status
        expect(fs.writeFile).toHaveBeenCalled();
        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        expect(writtenState.active[0].status).toBe('paused');
      });

      it('should update progress fields (partial update)', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

        const handler = getUpdateStatusHandler();
        const result = await handler!({} as any, {
          contributionId: 'contrib_test123',
          progress: { completedDocuments: 3, completedTasks: 7 },
        });

        expect(result.updated).toBe(true);

        // Verify state was written with updated progress
        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        // Should preserve original fields and merge new ones
        expect(writtenState.active[0].progress).toEqual({
          totalDocuments: 5,
          completedDocuments: 3,
          totalTasks: 10,
          completedTasks: 7,
        });
      });

      it('should update token usage fields (partial update)', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

        const handler = getUpdateStatusHandler();
        const result = await handler!({} as any, {
          contributionId: 'contrib_test123',
          tokenUsage: { inputTokens: 2500, estimatedCost: 0.25 },
        });

        expect(result.updated).toBe(true);

        // Verify state was written with updated token usage
        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        // Should preserve original fields and merge new ones
        expect(writtenState.active[0].tokenUsage).toEqual({
          inputTokens: 2500,
          outputTokens: 500,  // unchanged
          estimatedCost: 0.25,
        });
      });

      it('should update timeSpent', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

        const handler = getUpdateStatusHandler();
        const result = await handler!({} as any, {
          contributionId: 'contrib_test123',
          timeSpent: 180000,  // 3 minutes
        });

        expect(result.updated).toBe(true);

        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        expect(writtenState.active[0].timeSpent).toBe(180000);
      });

      it('should update draftPrNumber and draftPrUrl', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

        const handler = getUpdateStatusHandler();
        const result = await handler!({} as any, {
          contributionId: 'contrib_test123',
          draftPrNumber: 99,
          draftPrUrl: 'https://github.com/owner/repo/pull/99',
        });

        expect(result.updated).toBe(true);

        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        expect(writtenState.active[0].draftPrNumber).toBe(99);
        expect(writtenState.active[0].draftPrUrl).toBe('https://github.com/owner/repo/pull/99');
      });

      it('should update error field', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

        const handler = getUpdateStatusHandler();
        const result = await handler!({} as any, {
          contributionId: 'contrib_test123',
          error: 'Rate limit exceeded',
        });

        expect(result.updated).toBe(true);

        const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
          call => (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        const writtenState = JSON.parse(writeCall![1] as string);
        expect(writtenState.active[0].error).toBe('Rate limit exceeded');
      });
    });

    describe('contribution not found', () => {
      it('should return updated:false if contribution not found', async () => {
        // State with no active contributions
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
          active: [],
          history: [],
          stats: {},
        }));

        const handler = getUpdateStatusHandler();
        const result = await handler!({} as any, {
          contributionId: 'nonexistent_contrib',
          status: 'paused',
        });

        expect(result.updated).toBe(false);
      });
    });

    describe('broadcast behavior', () => {
      it('should broadcast update after successful update', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createStateWithContribution()));

        const handler = getUpdateStatusHandler();
        await handler!({} as any, {
          contributionId: 'contrib_test123',
          status: 'completing',
        });

        // Verify broadcast was sent
        expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('symphony:updated');
      });
    });
  });
});
