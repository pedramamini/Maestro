/**
 * Slash Commands Module
 *
 * This module provides handlers for slash commands that are executed
 * by the AI agent or intercepted by Maestro.
 *
 * iOS commands (like /ios.snapshot) are passed to the AI agent which
 * uses these handlers via IPC to execute the actual operations.
 */

// iOS Snapshot Command
export {
  executeSnapshotCommand,
  parseSnapshotArgs,
  snapshotCommandMetadata,
  type SnapshotCommandArgs,
  type SnapshotCommandResult,
} from './ios-snapshot';

// Command registry for all slash commands
export interface SlashCommandMetadata {
  command: string;
  description: string;
  usage: string;
  options: {
    name: string;
    description: string;
    valueHint: string | null;
  }[];
  examples: string[];
}

// Export command metadata for autocomplete
import { snapshotCommandMetadata } from './ios-snapshot';

export const iosSlashCommandMetadata: SlashCommandMetadata[] = [
  snapshotCommandMetadata,
];
