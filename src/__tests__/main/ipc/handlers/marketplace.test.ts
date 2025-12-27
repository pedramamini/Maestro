/**
 * Tests for the marketplace IPC handlers
 *
 * These tests verify the marketplace operations including:
 * - Cache creation and TTL validation
 * - Force refresh bypassing cache
 * - Document and README fetching
 * - Playbook import with correct folder structure
 * - Default prompt fallback for null prompts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain, App } from 'electron';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
  registerMarketplaceHandlers,
  MarketplaceHandlerDependencies,
} from '../../../../main/ipc/handlers/marketplace';
import type { MarketplaceManifest, MarketplaceCache } from '../../../../shared/marketplace-types';

// Mock electron's ipcMain
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  app: {
    getPath: vi.fn(),
  },
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Mock crypto
vi.mock('crypto', () => ({
  default: {
    randomUUID: vi.fn(),
  },
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

describe('marketplace IPC handlers', () => {
  let handlers: Map<string, Function>;
  let mockApp: App;
  let mockDeps: MarketplaceHandlerDependencies;

  // Sample test data
  const sampleManifest: MarketplaceManifest = {
    lastUpdated: '2024-01-15',
    playbooks: [
      {
        id: 'test-playbook-1',
        title: 'Test Playbook',
        description: 'A test playbook',
        category: 'Development',
        author: 'Test Author',
        lastUpdated: '2024-01-15',
        path: 'playbooks/test-playbook-1',
        documents: [
          { filename: 'phase-1', resetOnCompletion: false },
          { filename: 'phase-2', resetOnCompletion: true },
        ],
        loopEnabled: false,
        maxLoops: null,
        prompt: null, // Uses Maestro default
      },
      {
        id: 'test-playbook-2',
        title: 'Custom Prompt Playbook',
        description: 'A playbook with custom prompt',
        category: 'Security',
        author: 'Test Author',
        lastUpdated: '2024-01-15',
        path: 'playbooks/test-playbook-2',
        documents: [{ filename: 'security-check', resetOnCompletion: false }],
        loopEnabled: true,
        maxLoops: 3,
        prompt: 'Custom instructions here',
      },
    ],
  };

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

    // Setup dependencies
    mockDeps = {
      app: mockApp,
    };

    // Default mock for crypto.randomUUID
    vi.mocked(crypto.randomUUID).mockReturnValue('test-uuid-123');

    // Register handlers
    registerMarketplaceHandlers(mockDeps);
  });

  afterEach(() => {
    handlers.clear();
  });

  describe('registration', () => {
    it('should register all marketplace handlers', () => {
      const expectedChannels = [
        'marketplace:getManifest',
        'marketplace:refreshManifest',
        'marketplace:getDocument',
        'marketplace:getReadme',
        'marketplace:importPlaybook',
      ];

      for (const channel of expectedChannels) {
        expect(handlers.has(channel)).toBe(true);
      }
    });
  });

  describe('marketplace:getManifest', () => {
    it('should create cache file in userData after first fetch', async () => {
      // No existing cache
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Mock successful fetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleManifest),
      });

      const handler = handlers.get('marketplace:getManifest');
      const result = await handler!({} as any);

      // Verify cache was written
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/mock/userData/marketplace-cache.json',
        expect.any(String),
        'utf-8'
      );

      // Verify cache content structure
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenCache = JSON.parse(writeCall[1] as string) as MarketplaceCache;
      expect(writtenCache.fetchedAt).toBeDefined();
      expect(typeof writtenCache.fetchedAt).toBe('number');
      expect(writtenCache.manifest).toEqual(sampleManifest);

      // Verify response indicates not from cache
      expect(result.fromCache).toBe(false);
      expect(result.manifest).toEqual(sampleManifest);
    });

    it('should use cache when within TTL', async () => {
      const cacheAge = 1000 * 60 * 60; // 1 hour ago (within 6 hour TTL)
      const cachedData: MarketplaceCache = {
        fetchedAt: Date.now() - cacheAge,
        manifest: sampleManifest,
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cachedData));

      const handler = handlers.get('marketplace:getManifest');
      const result = await handler!({} as any);

      // Should not fetch from network
      expect(mockFetch).not.toHaveBeenCalled();

      // Should return cached data
      expect(result.fromCache).toBe(true);
      expect(result.cacheAge).toBeDefined();
      expect(result.cacheAge).toBeGreaterThanOrEqual(cacheAge);
      expect(result.manifest).toEqual(sampleManifest);
    });

    it('should fetch fresh data when cache is expired', async () => {
      const cacheAge = 1000 * 60 * 60 * 7; // 7 hours ago (past 6 hour TTL)
      const expiredCache: MarketplaceCache = {
        fetchedAt: Date.now() - cacheAge,
        manifest: {
          lastUpdated: '2024-01-01',
          playbooks: [],
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(expiredCache));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleManifest),
      });

      const handler = handlers.get('marketplace:getManifest');
      const result = await handler!({} as any);

      // Should have fetched from network
      expect(mockFetch).toHaveBeenCalled();

      // Should return fresh data
      expect(result.fromCache).toBe(false);
      expect(result.manifest).toEqual(sampleManifest);
    });

    it('should handle invalid cache structure gracefully', async () => {
      // Invalid cache - missing playbooks array
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ fetchedAt: Date.now(), manifest: { invalid: true } })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleManifest),
      });

      const handler = handlers.get('marketplace:getManifest');
      const result = await handler!({} as any);

      // Should have fetched fresh data due to invalid cache
      expect(mockFetch).toHaveBeenCalled();
      expect(result.fromCache).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const handler = handlers.get('marketplace:getManifest');
      const result = await handler!({} as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle HTTP error responses', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const handler = handlers.get('marketplace:getManifest');
      const result = await handler!({} as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch manifest');
    });
  });

  describe('marketplace:refreshManifest', () => {
    it('should bypass cache and fetch fresh data', async () => {
      // Valid cache exists
      const validCache: MarketplaceCache = {
        fetchedAt: Date.now() - 1000, // 1 second ago (well within TTL)
        manifest: {
          lastUpdated: '2024-01-01',
          playbooks: [],
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validCache));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleManifest),
      });

      const handler = handlers.get('marketplace:refreshManifest');
      const result = await handler!({} as any);

      // Should have fetched from network despite valid cache
      expect(mockFetch).toHaveBeenCalled();

      // Should return fresh data
      expect(result.fromCache).toBe(false);
      expect(result.manifest).toEqual(sampleManifest);

      // Should have updated cache
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('marketplace:getDocument', () => {
    it('should fetch document from GitHub', async () => {
      const docContent = '# Phase 1\n\n- [ ] Task 1\n- [ ] Task 2';

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(docContent),
      });

      const handler = handlers.get('marketplace:getDocument');
      const result = await handler!({} as any, 'playbooks/test-playbook', 'phase-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('playbooks/test-playbook/phase-1.md')
      );
      expect(result.content).toBe(docContent);
    });

    it('should handle 404 for missing documents', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const handler = handlers.get('marketplace:getDocument');
      const result = await handler!({} as any, 'playbooks/missing', 'doc');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Document not found');
    });
  });

  describe('marketplace:getReadme', () => {
    it('should fetch README from GitHub', async () => {
      const readmeContent = '# Test Playbook\n\nThis is a description.';

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(readmeContent),
      });

      const handler = handlers.get('marketplace:getReadme');
      const result = await handler!({} as any, 'playbooks/test-playbook');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('playbooks/test-playbook/README.md')
      );
      expect(result.content).toBe(readmeContent);
    });

    it('should return null for missing README (404)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const handler = handlers.get('marketplace:getReadme');
      const result = await handler!({} as any, 'playbooks/no-readme');

      expect(result.content).toBeNull();
    });
  });

  describe('marketplace:importPlaybook', () => {
    it('should create correct folder structure', async () => {
      // Setup cache with manifest
      const validCache: MarketplaceCache = {
        fetchedAt: Date.now(),
        manifest: sampleManifest,
      };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(validCache)) // Cache read
        .mockRejectedValueOnce({ code: 'ENOENT' }); // No existing playbooks
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Mock document fetches
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('# Phase 1 Content'),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('# Phase 2 Content'),
        });

      const handler = handlers.get('marketplace:importPlaybook');
      const result = await handler!(
        {} as any,
        'test-playbook-1',
        'My Test Playbook',
        '/autorun/folder',
        'session-123'
      );

      // Verify target folder was created
      expect(fs.mkdir).toHaveBeenCalledWith('/autorun/folder/My Test Playbook', {
        recursive: true,
      });

      // Verify documents were written
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/autorun/folder/My Test Playbook/phase-1.md',
        '# Phase 1 Content',
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/autorun/folder/My Test Playbook/phase-2.md',
        '# Phase 2 Content',
        'utf-8'
      );

      // Verify playbook was saved
      expect(result.playbook).toBeDefined();
      expect(result.playbook.name).toBe('Test Playbook');
      expect(result.importedDocs).toEqual(['phase-1', 'phase-2']);
    });

    it('should store empty string for null prompt (Maestro default fallback)', async () => {
      // Setup cache with playbook that has prompt: null
      const validCache: MarketplaceCache = {
        fetchedAt: Date.now(),
        manifest: sampleManifest,
      };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(validCache))
        .mockRejectedValueOnce({ code: 'ENOENT' });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('# Content'),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('# Content 2'),
        });

      const handler = handlers.get('marketplace:importPlaybook');
      const result = await handler!(
        {} as any,
        'test-playbook-1', // This playbook has prompt: null
        'Imported',
        '/autorun',
        'session-123'
      );

      // Verify prompt is empty string (not null)
      expect(result.playbook.prompt).toBe('');
      expect(typeof result.playbook.prompt).toBe('string');
    });

    it('should preserve custom prompt when provided', async () => {
      const validCache: MarketplaceCache = {
        fetchedAt: Date.now(),
        manifest: sampleManifest,
      };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(validCache))
        .mockRejectedValueOnce({ code: 'ENOENT' });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('# Content'),
      });

      const handler = handlers.get('marketplace:importPlaybook');
      const result = await handler!(
        {} as any,
        'test-playbook-2', // This playbook has a custom prompt
        'Custom',
        '/autorun',
        'session-123'
      );

      expect(result.playbook.prompt).toBe('Custom instructions here');
    });

    it('should save playbook to session storage', async () => {
      const validCache: MarketplaceCache = {
        fetchedAt: Date.now(),
        manifest: sampleManifest,
      };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(validCache))
        .mockRejectedValueOnce({ code: 'ENOENT' }); // No existing playbooks
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Content'),
      });

      const handler = handlers.get('marketplace:importPlaybook');
      await handler!(
        {} as any,
        'test-playbook-2',
        'Test',
        '/autorun',
        'session-123'
      );

      // Verify playbooks directory was created
      expect(fs.mkdir).toHaveBeenCalledWith('/mock/userData/playbooks', {
        recursive: true,
      });

      // Verify playbook was saved to session file
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/mock/userData/playbooks/session-123.json',
        expect.any(String),
        'utf-8'
      );

      // Verify playbook data structure
      const playbooksWriteCall = vi.mocked(fs.writeFile).mock.calls.find((call) =>
        (call[0] as string).includes('session-123.json')
      );
      const writtenData = JSON.parse(playbooksWriteCall![1] as string);
      expect(writtenData.playbooks).toHaveLength(1);
      expect(writtenData.playbooks[0].id).toBe('test-uuid-123');
    });

    it('should append to existing playbooks', async () => {
      const existingPlaybooks = [{ id: 'existing-1', name: 'Existing' }];
      const validCache: MarketplaceCache = {
        fetchedAt: Date.now(),
        manifest: sampleManifest,
      };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(validCache))
        .mockResolvedValueOnce(JSON.stringify({ playbooks: existingPlaybooks }));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('# Content'),
      });

      const handler = handlers.get('marketplace:importPlaybook');
      await handler!(
        {} as any,
        'test-playbook-2',
        'New',
        '/autorun',
        'session-123'
      );

      const playbooksWriteCall = vi.mocked(fs.writeFile).mock.calls.find((call) =>
        (call[0] as string).includes('session-123.json')
      );
      const writtenData = JSON.parse(playbooksWriteCall![1] as string);
      expect(writtenData.playbooks).toHaveLength(2);
    });

    it('should return error for non-existent playbook', async () => {
      const validCache: MarketplaceCache = {
        fetchedAt: Date.now(),
        manifest: sampleManifest,
      };

      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(validCache));

      const handler = handlers.get('marketplace:importPlaybook');
      const result = await handler!(
        {} as any,
        'non-existent-playbook',
        'Test',
        '/autorun',
        'session-123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Playbook not found');
    });

    it('should continue importing when individual document fetch fails', async () => {
      const validCache: MarketplaceCache = {
        fetchedAt: Date.now(),
        manifest: sampleManifest,
      };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(validCache))
        .mockRejectedValueOnce({ code: 'ENOENT' });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // First doc fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('# Phase 2 Content'),
        });

      const handler = handlers.get('marketplace:importPlaybook');
      const result = await handler!(
        {} as any,
        'test-playbook-1',
        'Partial',
        '/autorun',
        'session-123'
      );

      // Should have imported the second doc
      expect(result.importedDocs).toEqual(['phase-2']);
    });
  });

  describe('cache TTL validation', () => {
    it('should correctly identify cache as valid within TTL', async () => {
      const testCases = [
        { age: 0, expected: true, desc: 'just created' },
        { age: 1000 * 60 * 60 * 3, expected: true, desc: '3 hours old' },
        { age: 1000 * 60 * 60 * 5.9, expected: true, desc: '5.9 hours old' },
        { age: 1000 * 60 * 60 * 6, expected: false, desc: 'exactly 6 hours old' },
        { age: 1000 * 60 * 60 * 7, expected: false, desc: '7 hours old' },
        { age: 1000 * 60 * 60 * 24, expected: false, desc: '24 hours old' },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();

        const cache: MarketplaceCache = {
          fetchedAt: Date.now() - testCase.age,
          manifest: sampleManifest,
        };

        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cache));
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(sampleManifest),
        });

        const handler = handlers.get('marketplace:getManifest');
        const result = await handler!({} as any);

        if (testCase.expected) {
          expect(result.fromCache).toBe(true);
          expect(mockFetch).not.toHaveBeenCalled();
        } else {
          expect(result.fromCache).toBe(false);
          expect(mockFetch).toHaveBeenCalled();
        }
      }
    });
  });
});
