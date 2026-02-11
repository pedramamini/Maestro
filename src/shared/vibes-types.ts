// VIBES v1.0 Standard - Type Definitions
// Mirrors the VIBES specification for AI code audit metadata tracking.

// ============================================================================
// Core Enums / Union Types
// ============================================================================

/** Assurance level controls how much metadata is captured per annotation. */
export type VibesAssuranceLevel = 'low' | 'medium' | 'high';

/** The granularity of an annotation entry. */
export type VibesAnnotationType = 'line' | 'function' | 'session';

/** The action that was performed on the code. */
export type VibesAction = 'create' | 'modify' | 'delete' | 'review';

/** Classification of commands executed by the AI agent. */
export type VibesCommandType =
	| 'shell'
	| 'file_write'
	| 'file_read'
	| 'file_delete'
	| 'api_call'
	| 'tool_use'
	| 'other';

/** Classification of prompts that triggered agent activity. */
export type VibesPromptType =
	| 'user_instruction'
	| 'edit_command'
	| 'chat_message'
	| 'inline_completion'
	| 'review_request'
	| 'refactor_request'
	| 'other';

// ============================================================================
// Configuration
// ============================================================================

/** Project-level VIBES configuration stored in .ai-audit/config.json. */
export interface VibesConfig {
	standard: 'VIBES';
	standard_version: '1.0';
	assurance_level: VibesAssuranceLevel;
	project_name: string;
	tracked_extensions: string[];
	exclude_patterns: string[];
	compress_reasoning_threshold_bytes: number;
	external_blob_threshold_bytes: number;
}

// ============================================================================
// Manifest
// ============================================================================

/** Top-level manifest stored in .ai-audit/manifest.json. */
export interface VibesManifest {
	standard: 'VIBES';
	version: '1.0';
	entries: Record<string, VibesManifestEntry>;
}

/** Discriminated union of all manifest entry types, keyed by `type`. */
export type VibesManifestEntry =
	| VibesEnvironmentEntry
	| VibesCommandEntry
	| VibesPromptEntry
	| VibesReasoningEntry;

/** Records the tool/model environment that produced annotations. */
export interface VibesEnvironmentEntry {
	type: 'environment';
	tool_name: string;
	tool_version: string;
	model_name: string;
	model_version: string;
	model_parameters?: Record<string, unknown>;
	tool_extensions?: string[];
	created_at: string;
}

/** Records a command executed by the agent. */
export interface VibesCommandEntry {
	type: 'command';
	command_text: string;
	command_type: VibesCommandType;
	command_exit_code?: number;
	command_output_summary?: string;
	working_directory?: string;
	created_at: string;
}

/** Records a prompt that triggered agent activity. */
export interface VibesPromptEntry {
	type: 'prompt';
	prompt_text: string;
	prompt_type?: VibesPromptType;
	prompt_context_files?: string[];
	created_at: string;
}

/** Records reasoning / chain-of-thought output from the model. */
export interface VibesReasoningEntry {
	type: 'reasoning';
	reasoning_text?: string;
	reasoning_text_compressed?: string;
	compressed?: boolean;
	external?: boolean;
	blob_path?: string;
	reasoning_token_count?: number;
	reasoning_model?: string;
	created_at: string;
}

// ============================================================================
// Annotations
// ============================================================================

/** Line-level annotation linking code ranges to provenance metadata. */
export interface VibesLineAnnotation {
	type: 'line';
	file_path: string;
	line_start: number;
	line_end: number;
	environment_hash: string;
	command_hash?: string;
	prompt_hash?: string;
	reasoning_hash?: string;
	action: VibesAction;
	timestamp: string;
	commit_hash?: string;
	session_id?: string;
	assurance_level: VibesAssuranceLevel;
}

/** Function-level annotation linking named functions to provenance metadata. */
export interface VibeFunctionAnnotation {
	type: 'function';
	file_path: string;
	function_name: string;
	function_signature?: string;
	environment_hash: string;
	command_hash?: string;
	prompt_hash?: string;
	reasoning_hash?: string;
	action: VibesAction;
	timestamp: string;
	commit_hash?: string;
	session_id?: string;
	assurance_level: VibesAssuranceLevel;
}

/** Session-level record marking the start or end of an agent session. */
export interface VibesSessionRecord {
	type: 'session';
	event: 'start' | 'end';
	session_id: string;
	timestamp: string;
	environment_hash?: string;
	assurance_level?: VibesAssuranceLevel;
	description?: string;
}

/** Union of all annotation types written to .ai-audit/annotations.jsonl. */
export type VibesAnnotation =
	| VibesLineAnnotation
	| VibeFunctionAnnotation
	| VibesSessionRecord;
