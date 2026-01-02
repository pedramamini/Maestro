/**
 * Playbook Actions Module
 *
 * Provides a YAML-based action system for playbooks.
 * Allows defining declarative playbooks with steps like:
 *
 * ```yaml
 * name: iOS Testing Playbook
 * steps:
 *   - action: ios.snapshot
 *     inputs:
 *       simulator: "iPhone 15 Pro"
 *       app: com.example.myapp
 *     store_as: snapshot_result
 * ```
 */

// Export types
export * from './types';

// Export registry functions
export {
  registerAction,
  getAction,
  hasAction,
  listActions,
  getAllActions,
  defineAction,
  clearRegistry,
} from './action-registry';

// Export parser functions
export {
  parseYamlPlaybook,
  parseYamlPlaybookFile,
  parseShorthandStep,
  PlaybookParseError,
} from './yaml-parser';

// Export executor functions
export {
  executePlaybook,
  executeAction,
  type ExecutorOptions,
} from './executor';

// Import and register all actions
import { registerAction } from './action-registry';
import { iosSnapshotAction } from './actions/ios-snapshot';

// Register built-in actions
registerAction(iosSnapshotAction);

// Export action definitions for reference
export { iosSnapshotAction } from './actions/ios-snapshot';
export type { IosSnapshotInputs } from './actions/ios-snapshot';
