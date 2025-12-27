/**
 * SSH Remote Configuration Resolver.
 *
 * Provides utilities for resolving which SSH remote configuration should
 * be used for agent execution. Handles the resolution priority:
 * 1. Agent-specific SSH remote override (per-agent configuration)
 * 2. Global default SSH remote (applies to all agents)
 * 3. Local execution (no SSH remote)
 *
 * This module is used by the process spawn handlers to determine whether
 * an agent command should be executed locally or via SSH on a remote host.
 */

import type { SshRemoteConfig, AgentSshRemoteConfig } from '../../shared/types';

/**
 * Options for resolving SSH remote configuration.
 */
export interface SshRemoteResolveOptions {
  /**
   * Agent-specific SSH remote configuration (optional).
   * If provided and enabled, takes precedence over global default.
   */
  agentSshConfig?: AgentSshRemoteConfig;

  /**
   * The tool type / agent ID.
   * Used for logging and debugging.
   */
  agentId?: string;
}

/**
 * Result of SSH remote configuration resolution.
 */
export interface SshRemoteResolveResult {
  /**
   * The resolved SSH remote configuration, or null for local execution.
   */
  config: SshRemoteConfig | null;

  /**
   * How the configuration was resolved.
   * - 'agent': Agent-specific override was used
   * - 'global': Global default was used
   * - 'disabled': SSH remote is explicitly disabled for this agent
   * - 'none': No SSH remote configured (local execution)
   */
  source: 'agent' | 'global' | 'disabled' | 'none';
}

/**
 * Store interface for accessing SSH remote settings.
 * This allows dependency injection for testing.
 */
export interface SshRemoteSettingsStore {
  /**
   * Get all SSH remote configurations.
   */
  getSshRemotes(): SshRemoteConfig[];

  /**
   * Get the global default SSH remote ID.
   */
  getDefaultSshRemoteId(): string | null;
}

/**
 * Resolve the effective SSH remote configuration for agent execution.
 *
 * Resolution priority:
 * 1. If agentSshConfig is provided and explicitly disabled -> local execution
 * 2. If agentSshConfig is provided with a remoteId -> use that specific remote
 * 3. If global defaultSshRemoteId is set -> use that remote
 * 4. Otherwise -> local execution
 *
 * @param store The settings store to read SSH remote configurations from
 * @param options Resolution options including agent-specific config
 * @returns Resolved SSH remote configuration with source information
 *
 * @example
 * // Using global default (no agent override)
 * const result = getSshRemoteConfig(store, {});
 * if (result.config) {
 *   // Execute via SSH
 * }
 *
 * @example
 * // With agent-specific override
 * const result = getSshRemoteConfig(store, {
 *   agentSshConfig: { enabled: true, remoteId: 'remote-1' },
 *   agentId: 'claude-code'
 * });
 */
export function getSshRemoteConfig(
  store: SshRemoteSettingsStore,
  options: SshRemoteResolveOptions = {}
): SshRemoteResolveResult {
  const { agentSshConfig, agentId: _agentId } = options;

  // Get all available SSH remotes
  const sshRemotes = store.getSshRemotes();

  // Priority 1: Check agent-specific configuration
  if (agentSshConfig) {
    // If explicitly disabled for this agent, return null (local execution)
    if (!agentSshConfig.enabled) {
      return {
        config: null,
        source: 'disabled',
      };
    }

    // If agent has a specific remote ID configured, use it
    if (agentSshConfig.remoteId) {
      const config = sshRemotes.find(
        (r) => r.id === agentSshConfig.remoteId && r.enabled
      );

      if (config) {
        return {
          config,
          source: 'agent',
        };
      }
      // If the specified remote doesn't exist or is disabled, fall through to global default
    }
  }

  // Priority 2: Check global default
  const defaultId = store.getDefaultSshRemoteId();
  if (defaultId) {
    const config = sshRemotes.find((r) => r.id === defaultId && r.enabled);

    if (config) {
      return {
        config,
        source: 'global',
      };
    }
  }

  // Priority 3: No SSH remote configured - local execution
  return {
    config: null,
    source: 'none',
  };
}

/**
 * Create a SshRemoteSettingsStore adapter from an electron-store instance.
 *
 * This adapter wraps an electron-store to provide the SshRemoteSettingsStore
 * interface, allowing the resolver to be used with the actual settings store.
 *
 * @param store The electron-store instance with SSH remote settings
 * @returns A SshRemoteSettingsStore adapter
 *
 * @example
 * const storeAdapter = createStoreAdapter(settingsStore);
 * const result = getSshRemoteConfig(storeAdapter, { agentId: 'claude-code' });
 */
export function createSshRemoteStoreAdapter<
  T extends {
    get(key: 'sshRemotes', defaultValue: SshRemoteConfig[]): SshRemoteConfig[];
    get(key: 'defaultSshRemoteId', defaultValue: null): string | null;
  }
>(store: T): SshRemoteSettingsStore {
  return {
    getSshRemotes: () => store.get('sshRemotes', []),
    getDefaultSshRemoteId: () => store.get('defaultSshRemoteId', null),
  };
}
