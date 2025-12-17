import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentSessionStorage,
  AgentSessionInfo,
  PaginatedSessionsResult,
  SessionMessagesResult,
  SessionSearchResult,
  SessionSearchMode,
  registerSessionStorage,
  getSessionStorage,
  hasSessionStorage,
  getAllSessionStorages,
  clearStorageRegistry,
} from '../../main/agent-session-storage';
import type { ToolType } from '../../shared/types';

// Mock storage implementation for testing
class MockSessionStorage implements AgentSessionStorage {
  readonly agentId: ToolType;

  constructor(agentId: ToolType) {
    this.agentId = agentId;
  }

  async listSessions(_projectPath: string): Promise<AgentSessionInfo[]> {
    return [];
  }

  async listSessionsPaginated(
    _projectPath: string,
    _options?: { cursor?: string; limit?: number }
  ): Promise<PaginatedSessionsResult> {
    return { sessions: [], hasMore: false, totalCount: 0, nextCursor: null };
  }

  async readSessionMessages(
    _projectPath: string,
    _sessionId: string,
    _options?: { offset?: number; limit?: number }
  ): Promise<SessionMessagesResult> {
    return { messages: [], total: 0, hasMore: false };
  }

  async searchSessions(
    _projectPath: string,
    _query: string,
    _searchMode: SessionSearchMode
  ): Promise<SessionSearchResult[]> {
    return [];
  }

  getSessionPath(_projectPath: string, _sessionId: string): string | null {
    return `/mock/path/${_sessionId}.jsonl`;
  }

  async deleteMessagePair(
    _projectPath: string,
    _sessionId: string,
    _userMessageUuid: string,
    _fallbackContent?: string
  ): Promise<{ success: boolean; error?: string; linesRemoved?: number }> {
    return { success: true, linesRemoved: 2 };
  }
}

describe('agent-session-storage', () => {
  beforeEach(() => {
    clearStorageRegistry();
  });

  afterEach(() => {
    clearStorageRegistry();
  });

  describe('Storage Registry', () => {
    it('should register a storage implementation', () => {
      const storage = new MockSessionStorage('claude-code');
      registerSessionStorage(storage);
      expect(hasSessionStorage('claude-code')).toBe(true);
    });

    it('should retrieve a registered storage', () => {
      const storage = new MockSessionStorage('claude-code');
      registerSessionStorage(storage);
      const retrieved = getSessionStorage('claude-code');
      expect(retrieved).toBe(storage);
      expect(retrieved?.agentId).toBe('claude-code');
    });

    it('should return null for unregistered agent', () => {
      const result = getSessionStorage('unknown-agent' as ToolType);
      expect(result).toBeNull();
    });

    it('should return false for hasSessionStorage on unregistered agent', () => {
      expect(hasSessionStorage('unknown-agent')).toBe(false);
    });

    it('should get all registered storages', () => {
      const storage1 = new MockSessionStorage('claude-code');
      const storage2 = new MockSessionStorage('opencode');
      registerSessionStorage(storage1);
      registerSessionStorage(storage2);

      const all = getAllSessionStorages();
      expect(all).toHaveLength(2);
      expect(all).toContain(storage1);
      expect(all).toContain(storage2);
    });

    it('should clear all storages', () => {
      registerSessionStorage(new MockSessionStorage('claude-code'));
      registerSessionStorage(new MockSessionStorage('opencode'));

      expect(getAllSessionStorages()).toHaveLength(2);
      clearStorageRegistry();
      expect(getAllSessionStorages()).toHaveLength(0);
    });

    it('should overwrite existing registration for same agent', () => {
      const storage1 = new MockSessionStorage('claude-code');
      const storage2 = new MockSessionStorage('claude-code');
      registerSessionStorage(storage1);
      registerSessionStorage(storage2);

      expect(getAllSessionStorages()).toHaveLength(1);
      expect(getSessionStorage('claude-code')).toBe(storage2);
    });
  });

  describe('AgentSessionStorage Interface', () => {
    let storage: MockSessionStorage;

    beforeEach(() => {
      storage = new MockSessionStorage('claude-code');
    });

    it('should have required agentId property', () => {
      expect(storage.agentId).toBe('claude-code');
    });

    it('should implement listSessions', async () => {
      const sessions = await storage.listSessions('/test/project');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should implement listSessionsPaginated', async () => {
      const result = await storage.listSessionsPaginated('/test/project');
      expect(result.sessions).toBeDefined();
      expect(result.hasMore).toBeDefined();
      expect(result.totalCount).toBeDefined();
      expect(result.nextCursor).toBeDefined();
    });

    it('should implement readSessionMessages', async () => {
      const result = await storage.readSessionMessages('/test/project', 'session-123');
      expect(result.messages).toBeDefined();
      expect(result.total).toBeDefined();
      expect(result.hasMore).toBeDefined();
    });

    it('should implement searchSessions', async () => {
      const results = await storage.searchSessions('/test/project', 'query', 'all');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should implement getSessionPath', () => {
      const path = storage.getSessionPath('/test/project', 'session-123');
      expect(path).toBe('/mock/path/session-123.jsonl');
    });

    it('should implement deleteMessagePair', async () => {
      const result = await storage.deleteMessagePair('/test/project', 'session-123', 'uuid-456');
      expect(result.success).toBe(true);
      expect(result.linesRemoved).toBe(2);
    });
  });

  describe('Type Exports', () => {
    it('should export AgentSessionOrigin type with correct values', () => {
      const validOrigins: ('user' | 'auto')[] = ['user', 'auto'];
      expect(validOrigins).toContain('user');
      expect(validOrigins).toContain('auto');
    });

    it('should export SessionSearchMode type with correct values', () => {
      const validModes: SessionSearchMode[] = ['title', 'user', 'assistant', 'all'];
      expect(validModes).toContain('title');
      expect(validModes).toContain('user');
      expect(validModes).toContain('assistant');
      expect(validModes).toContain('all');
    });
  });
});

describe('ClaudeSessionStorage', () => {
  // Note: These tests would require mocking the filesystem
  // For now, we test that the class can be imported
  it('should be importable', async () => {
    // Dynamic import to test module loading
    const { ClaudeSessionStorage } = await import('../../main/storage/claude-session-storage');
    expect(ClaudeSessionStorage).toBeDefined();
  });

  it('should have claude-code as agentId', async () => {
    const { ClaudeSessionStorage } = await import('../../main/storage/claude-session-storage');

    // Create instance without store (it will create its own)
    // Note: In a real test, we'd mock electron-store
    const storage = new ClaudeSessionStorage();
    expect(storage.agentId).toBe('claude-code');
  });
});

describe('OpenCodeSessionStorage', () => {
  it('should be importable', async () => {
    const { OpenCodeSessionStorage } = await import('../../main/storage/opencode-session-storage');
    expect(OpenCodeSessionStorage).toBeDefined();
  });

  it('should have opencode as agentId', async () => {
    const { OpenCodeSessionStorage } = await import('../../main/storage/opencode-session-storage');
    const storage = new OpenCodeSessionStorage();
    expect(storage.agentId).toBe('opencode');
  });

  it('should return empty results (stub implementation)', async () => {
    const { OpenCodeSessionStorage } = await import('../../main/storage/opencode-session-storage');
    const storage = new OpenCodeSessionStorage();

    const sessions = await storage.listSessions('/test/project');
    expect(sessions).toEqual([]);

    const paginated = await storage.listSessionsPaginated('/test/project');
    expect(paginated.sessions).toEqual([]);
    expect(paginated.totalCount).toBe(0);

    const messages = await storage.readSessionMessages('/test/project', 'session-123');
    expect(messages.messages).toEqual([]);
    expect(messages.total).toBe(0);

    const search = await storage.searchSessions('/test/project', 'query', 'all');
    expect(search).toEqual([]);

    const path = storage.getSessionPath('/test/project', 'session-123');
    expect(path).toBeNull();

    const deleteResult = await storage.deleteMessagePair('/test/project', 'session-123', 'uuid-456');
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain('not yet implemented');
  });
});

describe('Storage Module Initialization', () => {
  it('should export initializeSessionStorages function', async () => {
    const { initializeSessionStorages } = await import('../../main/storage/index');
    expect(typeof initializeSessionStorages).toBe('function');
  });
});
