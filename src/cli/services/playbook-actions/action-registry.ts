/**
 * Action Registry
 *
 * Central registry for all available playbook actions.
 * Actions are registered here and can be looked up by name.
 */

import type { ActionDefinition } from './types';

// Registry of all available actions
const registry = new Map<string, ActionDefinition>();

/**
 * Register an action definition
 */
export function registerAction<TInputs = Record<string, unknown>>(
  action: ActionDefinition<TInputs>
): void {
  if (registry.has(action.name)) {
    throw new Error(`Action '${action.name}' is already registered`);
  }
  registry.set(action.name, action as ActionDefinition);
}

/**
 * Get an action by name
 */
export function getAction(name: string): ActionDefinition | undefined {
  return registry.get(name);
}

/**
 * Check if an action exists
 */
export function hasAction(name: string): boolean {
  return registry.has(name);
}

/**
 * List all registered action names
 */
export function listActions(): string[] {
  return Array.from(registry.keys());
}

/**
 * Get all registered actions
 */
export function getAllActions(): ActionDefinition[] {
  return Array.from(registry.values());
}

/**
 * Clear all registered actions (for testing)
 */
export function clearRegistry(): void {
  registry.clear();
}

/**
 * Helper to define an action with type inference
 */
export function defineAction<TInputs = Record<string, unknown>>(
  action: ActionDefinition<TInputs>
): ActionDefinition<TInputs> {
  return action;
}
