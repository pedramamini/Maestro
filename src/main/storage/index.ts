/**
 * Agent Session Storage Module
 *
 * Exports all session storage implementations and provides
 * initialization for the storage registry.
 */

export { ClaudeSessionStorage } from './claude-session-storage';
export { OpenCodeSessionStorage } from './opencode-session-storage';

import { registerSessionStorage } from '../agent-session-storage';
import { ClaudeSessionStorage } from './claude-session-storage';
import { OpenCodeSessionStorage } from './opencode-session-storage';

/**
 * Initialize all session storage implementations.
 * Call this during application startup to register all storage providers.
 */
export function initializeSessionStorages(): void {
  registerSessionStorage(new ClaudeSessionStorage());
  registerSessionStorage(new OpenCodeSessionStorage());
}
