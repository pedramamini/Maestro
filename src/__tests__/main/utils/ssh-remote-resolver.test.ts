/**
 * Tests for SSH Remote Configuration Resolver.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getSshRemoteConfig,
  createSshRemoteStoreAdapter,
  SshRemoteSettingsStore,
} from '../../../main/utils/ssh-remote-resolver';
import type { SshRemoteConfig } from '../../../shared/types';

describe('getSshRemoteConfig', () => {
  // Test fixtures
  const remote1: SshRemoteConfig = {
    id: 'remote-1',
    name: 'Dev Server',
    host: 'dev.example.com',
    port: 22,
    username: 'user',
    privateKeyPath: '~/.ssh/id_ed25519',
    enabled: true,
  };

  const remote2: SshRemoteConfig = {
    id: 'remote-2',
    name: 'Production Server',
    host: 'prod.example.com',
    port: 22,
    username: 'admin',
    privateKeyPath: '~/.ssh/id_rsa',
    enabled: true,
  };

  const disabledRemote: SshRemoteConfig = {
    id: 'remote-disabled',
    name: 'Disabled Server',
    host: 'disabled.example.com',
    port: 22,
    username: 'user',
    privateKeyPath: '~/.ssh/id_ed25519',
    enabled: false,
  };

  /**
   * Create a mock store with specified configuration.
   */
  function createMockStore(
    sshRemotes: SshRemoteConfig[] = [],
    defaultSshRemoteId: string | null = null
  ): SshRemoteSettingsStore {
    return {
      getSshRemotes: vi.fn(() => sshRemotes),
      getDefaultSshRemoteId: vi.fn(() => defaultSshRemoteId),
    };
  }

  describe('when no SSH remotes are configured', () => {
    it('returns null config with source "none"', () => {
      const store = createMockStore([], null);
      const result = getSshRemoteConfig(store, {});

      expect(result.config).toBeNull();
      expect(result.source).toBe('none');
    });

    it('returns null even with agent-specific config when no remotes exist', () => {
      const store = createMockStore([], null);
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: true, remoteId: 'remote-1' },
        agentId: 'claude-code',
      });

      expect(result.config).toBeNull();
      expect(result.source).toBe('none');
    });
  });

  describe('when using global default SSH remote', () => {
    it('returns the global default config with source "global"', () => {
      const store = createMockStore([remote1, remote2], 'remote-1');
      const result = getSshRemoteConfig(store, {});

      expect(result.config).toEqual(remote1);
      expect(result.source).toBe('global');
    });

    it('returns null when global default points to disabled remote', () => {
      const store = createMockStore([disabledRemote], 'remote-disabled');
      const result = getSshRemoteConfig(store, {});

      expect(result.config).toBeNull();
      expect(result.source).toBe('none');
    });

    it('returns null when global default points to non-existent remote', () => {
      const store = createMockStore([remote1], 'non-existent');
      const result = getSshRemoteConfig(store, {});

      expect(result.config).toBeNull();
      expect(result.source).toBe('none');
    });
  });

  describe('when using agent-specific SSH remote override', () => {
    it('returns agent-specific config with source "agent" when enabled', () => {
      const store = createMockStore([remote1, remote2], 'remote-1');
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: true, remoteId: 'remote-2' },
        agentId: 'claude-code',
      });

      expect(result.config).toEqual(remote2);
      expect(result.source).toBe('agent');
    });

    it('returns null with source "disabled" when agent SSH is explicitly disabled', () => {
      const store = createMockStore([remote1, remote2], 'remote-1');
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: false, remoteId: null },
        agentId: 'claude-code',
      });

      expect(result.config).toBeNull();
      expect(result.source).toBe('disabled');
    });

    it('overrides global default even when agent points to same remote', () => {
      const store = createMockStore([remote1], 'remote-1');
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: true, remoteId: 'remote-1' },
        agentId: 'claude-code',
      });

      expect(result.config).toEqual(remote1);
      expect(result.source).toBe('agent');
    });

    it('falls back to global default when agent remote ID not found', () => {
      const store = createMockStore([remote1, remote2], 'remote-1');
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: true, remoteId: 'non-existent' },
        agentId: 'claude-code',
      });

      expect(result.config).toEqual(remote1);
      expect(result.source).toBe('global');
    });

    it('falls back to global default when agent remote is disabled', () => {
      const store = createMockStore([remote1, disabledRemote], 'remote-1');
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: true, remoteId: 'remote-disabled' },
        agentId: 'claude-code',
      });

      expect(result.config).toEqual(remote1);
      expect(result.source).toBe('global');
    });

    it('returns null when agent enabled but no remoteId and no global default', () => {
      const store = createMockStore([remote1], null);
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: true, remoteId: null },
        agentId: 'claude-code',
      });

      expect(result.config).toBeNull();
      expect(result.source).toBe('none');
    });
  });

  describe('priority ordering', () => {
    it('agent-specific disabled takes precedence over global default', () => {
      const store = createMockStore([remote1], 'remote-1');
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: false, remoteId: null },
      });

      expect(result.config).toBeNull();
      expect(result.source).toBe('disabled');
    });

    it('agent-specific remote takes precedence over global default', () => {
      const store = createMockStore([remote1, remote2], 'remote-1');
      const result = getSshRemoteConfig(store, {
        agentSshConfig: { enabled: true, remoteId: 'remote-2' },
      });

      expect(result.config).toEqual(remote2);
      expect(result.source).toBe('agent');
    });
  });
});

describe('createSshRemoteStoreAdapter', () => {
  const remote1: SshRemoteConfig = {
    id: 'remote-1',
    name: 'Dev Server',
    host: 'dev.example.com',
    port: 22,
    username: 'user',
    privateKeyPath: '~/.ssh/id_ed25519',
    enabled: true,
  };

  it('creates adapter that delegates to store.get for sshRemotes', () => {
    const mockGet = vi.fn().mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'sshRemotes') return [remote1];
      if (key === 'defaultSshRemoteId') return 'remote-1';
      return defaultValue;
    });
    const mockStore = { get: mockGet };

    const adapter = createSshRemoteStoreAdapter(mockStore);
    const remotes = adapter.getSshRemotes();

    expect(remotes).toEqual([remote1]);
    expect(mockGet).toHaveBeenCalledWith('sshRemotes', []);
  });

  it('creates adapter that delegates to store.get for defaultSshRemoteId', () => {
    const mockGet = vi.fn().mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'sshRemotes') return [];
      if (key === 'defaultSshRemoteId') return 'remote-1';
      return defaultValue;
    });
    const mockStore = { get: mockGet };

    const adapter = createSshRemoteStoreAdapter(mockStore);
    const defaultId = adapter.getDefaultSshRemoteId();

    expect(defaultId).toBe('remote-1');
    expect(mockGet).toHaveBeenCalledWith('defaultSshRemoteId', null);
  });

  it('returns null for defaultSshRemoteId when not set', () => {
    const mockGet = vi.fn().mockImplementation((_key: string, defaultValue: unknown) => {
      return defaultValue;
    });
    const mockStore = { get: mockGet };

    const adapter = createSshRemoteStoreAdapter(mockStore);
    const defaultId = adapter.getDefaultSshRemoteId();

    expect(defaultId).toBeNull();
  });

  it('returns empty array for sshRemotes when not set', () => {
    const mockGet = vi.fn().mockImplementation((_key: string, defaultValue: unknown) => {
      return defaultValue;
    });
    const mockStore = { get: mockGet };

    const adapter = createSshRemoteStoreAdapter(mockStore);
    const remotes = adapter.getSshRemotes();

    expect(remotes).toEqual([]);
  });
});

describe('integration with getSshRemoteConfig', () => {
  const remote1: SshRemoteConfig = {
    id: 'remote-1',
    name: 'Dev Server',
    host: 'dev.example.com',
    port: 22,
    username: 'user',
    privateKeyPath: '~/.ssh/id_ed25519',
    enabled: true,
  };

  it('works end-to-end with store adapter', () => {
    const mockGet = vi.fn().mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'sshRemotes') return [remote1];
      if (key === 'defaultSshRemoteId') return 'remote-1';
      return defaultValue;
    });
    const mockStore = { get: mockGet };

    const adapter = createSshRemoteStoreAdapter(mockStore);
    const result = getSshRemoteConfig(adapter, {});

    expect(result.config).toEqual(remote1);
    expect(result.source).toBe('global');
  });
});
