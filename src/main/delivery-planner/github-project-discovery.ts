/**
 * GitHub Project Discovery — #447
 *
 * Discovers (or creates) the GitHub Projects v2 project for a given git repository.
 *
 * Flow:
 *   1. Verify `gh` CLI is installed and authenticated.
 *   2. Read `.maestro/project.json`, `.maestro/pm.json`, or `.maestro/github.json`
 *      for explicit owner/repo/projectNumber coordinates when present.
 *   3. Otherwise read `git remote get-url origin` → parse owner/repo (handles https:// and git@ forms)
 *   4. `gh project list --owner <owner> --format json` → find a candidate whose title
 *      contains the repo name (case-insensitive)
 *   5. If nothing matches → create a new project titled `<repo> AI Project`
 *   6. Return { owner, repo, projectNumber, projectId, projectTitle }
 *
 * The settings-store mapping is the persistent cache — this module only runs discovery
 * when a mapping is not yet stored for the given projectPath.
 *
 * All failure modes return a typed DiscoveryError with a structured `code` so the
 * renderer can surface a specific message + action (never silently no-ops).
 */

import { execFileNoThrow } from '../utils/execFile';
import type { ExecResult } from '../utils/execFile';
import type { AgentSshRemoteConfig } from '../../shared/types';
import type { SshRemoteSettingsStore } from '../utils/ssh-remote-resolver';
import { getSshRemoteConfig } from '../utils/ssh-remote-resolver';
import { buildSshCommand } from '../utils/ssh-command-builder';
import * as fs from 'fs/promises';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GithubProjectMapping {
	owner: string;
	repo: string;
	projectNumber: number;
	projectId: string;
	projectTitle: string;
	defaultBranch?: string;
	discoveredAt: string;
}

/** Structured error codes returned by discoverGithubProject on each failure path. */
export type DiscoveryErrorCode =
	| 'GH_CLI_MISSING'
	| 'GH_AUTH_REQUIRED'
	| 'NOT_A_GIT_REPO'
	| 'NO_ORIGIN_REMOTE'
	| 'NOT_GITHUB'
	| 'NO_PROJECT_AND_CANNOT_CREATE'
	| 'MULTIPLE_MATCHES'
	| 'GH_CLI_OUTPUT_UNRECOGNIZED'
	| 'GH_PERMISSION_DENIED';

export interface DiscoveryError {
	code: DiscoveryErrorCode;
	message: string;
	/** Extra detail (e.g. stdout snippet for GH_CLI_OUTPUT_UNRECOGNIZED). */
	detail?: string;
	/** Candidate list returned when code is MULTIPLE_MATCHES. */
	candidates?: RawProject[];
}

/** Discriminated union result — avoids throwing for expected failure modes. */
export type DiscoveryResult =
	| { ok: true; mapping: GithubProjectMapping }
	| { ok: false; error: DiscoveryError };

// ---------------------------------------------------------------------------
// discoverGithubProject
// ---------------------------------------------------------------------------

export interface DiscoverGithubProjectOptions {
	projectPath: string;
	/** When set, git commands are run on the SSH remote instead of the local host. */
	sshRemoteConfig?: AgentSshRemoteConfig;
	/** Required when sshRemoteConfig is provided — used to resolve the SshRemoteConfig. */
	sshStore?: SshRemoteSettingsStore;
}

/**
 * Discover the GitHub Projects v2 project for the git repo rooted at `projectPath`.
 *
 * Returns a DiscoveryResult — never throws for expected failure modes.
 * Does NOT persist the result — callers (IPC handler) are responsible for saving
 * the mapping to the settings store.
 *
 * Pass `sshRemoteConfig` + `sshStore` to probe git on an SSH-remote host instead
 * of the local filesystem (required for sessions whose project lives on a remote).
 * The `gh` CLI calls always run locally — gh holds the user's GitHub auth.
 */
export async function discoverGithubProject(
	optsOrPath: DiscoverGithubProjectOptions | string
): Promise<DiscoveryResult> {
	// Support both legacy string form and new options object
	const opts: DiscoverGithubProjectOptions =
		typeof optsOrPath === 'string' ? { projectPath: optsOrPath } : optsOrPath;
	const { projectPath, sshRemoteConfig, sshStore } = opts;

	// 0. Pre-flight: gh CLI present and authenticated
	const preflight = await checkGhPreflight();
	if (!preflight.ok) return { ok: false, error: preflight.error };

	// 1. Prefer explicit project-local config before guessing from git/project title.
	const configResult = await readGithubProjectConfig(projectPath, sshRemoteConfig, sshStore);
	if (!configResult.ok) return { ok: false, error: configResult.error };
	if (configResult.config) {
		return resolveConfiguredProject(configResult.config);
	}

	// 2. Resolve owner + repo from git remote
	const remoteResult = await parseGitRemote(projectPath, sshRemoteConfig, sshStore);
	if (!remoteResult.ok) return { ok: false, error: remoteResult.error };
	const { owner, repo } = remoteResult.coords;

	// 3. List existing projects for this owner
	const listResult = await listOwnerProjects(owner);
	if (!listResult.ok) return { ok: false, error: listResult.error };
	const projects = listResult.projects;

	// 4. Find matching candidates. Prefer exact/raw repo title matches, then
	// separator/camel-case aliases (e.g. HumpfAI_AIRouter -> AI Router).
	const matches = findMatchingProjects(projects, repo);

	if (matches.length === 1) {
		const candidate = matches[0];
		return {
			ok: true,
			mapping: {
				owner,
				repo,
				projectNumber: candidate.number,
				projectId: candidate.id,
				projectTitle: candidate.title,
				discoveredAt: new Date().toISOString(),
			},
		};
	}

	if (matches.length > 1) {
		return {
			ok: false,
			error: {
				code: 'MULTIPLE_MATCHES',
				message: `Found ${matches.length} matching Projects v2 for "${repo}". Pick one below.`,
				candidates: matches,
			},
		};
	}

	// 5. No matching project — attempt to create one
	const createResult = await createProject(owner, `${repo} AI Project`);
	if (!createResult.ok) return { ok: false, error: createResult.error };

	return {
		ok: true,
		mapping: {
			owner,
			repo,
			projectNumber: createResult.project.number,
			projectId: createResult.project.id,
			projectTitle: createResult.project.title,
			discoveredAt: new Date().toISOString(),
		},
	};
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RemoteCoords {
	owner: string;
	repo: string;
}

type PreflightResult = { ok: true } | { ok: false; error: DiscoveryError };
type RemoteResult = { ok: true; coords: RemoteCoords } | { ok: false; error: DiscoveryError };
type ListResult = { ok: true; projects: RawProject[] } | { ok: false; error: DiscoveryError };
type CreateResult = { ok: true; project: RawProject } | { ok: false; error: DiscoveryError };
type ViewResult = { ok: true; project: RawProject } | { ok: false; error: DiscoveryError };
type ConfigResult =
	| { ok: true; config?: GithubProjectConfig }
	| { ok: false; error: DiscoveryError };

interface GithubProjectConfig extends RemoteCoords {
	projectNumber: number;
	projectId?: string;
	projectTitle?: string;
	defaultBranch?: string;
}

const PROJECT_CONFIG_FILENAMES = ['project.json', 'pm.json', 'github.json'] as const;

/**
 * Verify that the `gh` CLI is present on PATH and that the user is authenticated.
 */
async function checkGhPreflight(): Promise<PreflightResult> {
	// Check for gh CLI presence
	const versionResult = await execFileNoThrow('gh', ['--version']);
	if (versionResult.exitCode === 'ENOENT' || versionResult.exitCode === 'EACCES') {
		return {
			ok: false,
			error: {
				code: 'GH_CLI_MISSING',
				message: 'gh CLI not found. Install from https://cli.github.com/',
			},
		};
	}

	// Check authentication
	const authResult = await execFileNoThrow('gh', ['auth', 'status']);
	if (authResult.exitCode !== 0) {
		return {
			ok: false,
			error: {
				code: 'GH_AUTH_REQUIRED',
				message: 'Run: gh auth login',
				detail: authResult.stderr.trim() || authResult.stdout.trim(),
			},
		};
	}

	return { ok: true };
}

/**
 * Run `git -C <cwd> <args>` either locally or via SSH on a remote host.
 *
 * Returns the same shape as execFileNoThrow so callers are agnostic to local/remote.
 */
async function runGit(
	args: string[],
	cwd: string,
	sshRemoteConfig?: AgentSshRemoteConfig,
	sshStore?: SshRemoteSettingsStore
): Promise<ExecResult> {
	if (sshRemoteConfig?.enabled && sshStore) {
		const sshResult = getSshRemoteConfig(sshStore, { sessionSshConfig: sshRemoteConfig });
		if (sshResult.config) {
			const sshCmd = await buildSshCommand(sshResult.config, {
				command: 'git',
				args: ['-C', cwd, ...args],
			});
			return execFileNoThrow(sshCmd.command, sshCmd.args);
		}
	}
	// Local fallback: use -C flag so we don't need to change cwd
	return execFileNoThrow('git', ['-C', cwd, ...args]);
}

async function readGithubProjectConfig(
	projectPath: string,
	sshRemoteConfig?: AgentSshRemoteConfig,
	sshStore?: SshRemoteSettingsStore
): Promise<ConfigResult> {
	for (const filename of PROJECT_CONFIG_FILENAMES) {
		const configPath = resolveProjectConfigPath(projectPath, filename, sshRemoteConfig);
		const fileResult = await readProjectConfigFile(configPath, sshRemoteConfig, sshStore);
		if (!fileResult.exists) continue;

		const parsed = parseGithubProjectConfig(fileResult.content, configPath);
		if (!parsed.ok) return parsed;
		if (parsed.config) return { ok: true, config: parsed.config };
	}

	return { ok: true };
}

function resolveProjectConfigPath(
	projectPath: string,
	filename: (typeof PROJECT_CONFIG_FILENAMES)[number],
	sshRemoteConfig?: AgentSshRemoteConfig
): string {
	if (sshRemoteConfig?.enabled) {
		return `${projectPath.replace(/\/+$/, '')}/.maestro/${filename}`;
	}

	return path.join(projectPath, '.maestro', filename);
}

async function readProjectConfigFile(
	configPath: string,
	sshRemoteConfig?: AgentSshRemoteConfig,
	sshStore?: SshRemoteSettingsStore
): Promise<{ exists: true; content: string } | { exists: false }> {
	if (sshRemoteConfig?.enabled && sshStore) {
		const sshResult = getSshRemoteConfig(sshStore, { sessionSshConfig: sshRemoteConfig });
		if (sshResult.config) {
			const sshCmd = await buildSshCommand(sshResult.config, {
				command: 'cat',
				args: [configPath],
			});
			const result = await execFileNoThrow(sshCmd.command, sshCmd.args);
			if (result.exitCode === 0) return { exists: true, content: result.stdout };
			return { exists: false };
		}
	}

	try {
		return { exists: true, content: await fs.readFile(configPath, 'utf-8') };
	} catch (err) {
		if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') {
			return { exists: false };
		}
		throw err;
	}
}

function parseGithubProjectConfig(content: string, sourcePath: string): ConfigResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (err) {
		return {
			ok: false,
			error: {
				code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
				message: `GitHub project config is not valid JSON: ${sourcePath}`,
				detail: err instanceof Error ? err.message : String(err),
			},
		};
	}

	const candidate = getGithubConfigCandidate(parsed);
	if (!candidate) return { ok: true };

	const owner = readNonEmptyString(candidate, 'owner');
	const repo = readNonEmptyString(candidate, 'repo');
	const projectNumber = readProjectNumber(candidate);
	const hasAnyGithubField =
		owner !== undefined ||
		repo !== undefined ||
		projectNumber !== undefined ||
		readNonEmptyString(candidate, 'projectId') !== undefined ||
		readNonEmptyString(candidate, 'projectTitle') !== undefined;

	if (!hasAnyGithubField) return { ok: true };

	if (!owner || !repo || projectNumber === undefined) {
		return {
			ok: false,
			error: {
				code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
				message: `GitHub project config must include owner, repo, and projectNumber: ${sourcePath}`,
			},
		};
	}

	return {
		ok: true,
		config: {
			owner,
			repo,
			projectNumber,
			projectId: readNonEmptyString(candidate, 'projectId'),
			projectTitle: readNonEmptyString(candidate, 'projectTitle'),
			defaultBranch: readNonEmptyString(candidate, 'defaultBranch'),
		},
	};
}

function getGithubConfigCandidate(parsed: unknown): Record<string, unknown> | undefined {
	if (!isRecord(parsed)) return undefined;

	if (isRecord(parsed.githubProject)) return parsed.githubProject;
	if (isRecord(parsed.github)) return parsed.github;
	return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(source: Record<string, unknown>, key: string): string | undefined {
	const value = source[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readProjectNumber(source: Record<string, unknown>): number | undefined {
	const value = source.projectNumber;
	if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
	if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
	return undefined;
}

async function resolveConfiguredProject(config: GithubProjectConfig): Promise<DiscoveryResult> {
	if (config.projectId && config.projectTitle) {
		return {
			ok: true,
			mapping: {
				owner: config.owner,
				repo: config.repo,
				projectNumber: config.projectNumber,
				projectId: config.projectId,
				projectTitle: config.projectTitle,
				...(config.defaultBranch && { defaultBranch: config.defaultBranch }),
				discoveredAt: new Date().toISOString(),
			},
		};
	}

	const viewResult = await viewProject(config.owner, config.projectNumber);
	if (!viewResult.ok) return { ok: false, error: viewResult.error };

	return {
		ok: true,
		mapping: {
			owner: config.owner,
			repo: config.repo,
			projectNumber: config.projectNumber,
			projectId: config.projectId ?? viewResult.project.id,
			projectTitle: config.projectTitle ?? viewResult.project.title,
			...(config.defaultBranch && { defaultBranch: config.defaultBranch }),
			discoveredAt: new Date().toISOString(),
		},
	};
}

/**
 * Verify the path is a git repository and parse owner/repo from `git remote get-url origin`.
 *
 * Handles both:
 *   - https://github.com/owner/repo.git
 *   - git@github.com:owner/repo.git
 *
 * When sshRemoteConfig/sshStore are provided, git commands run on the remote host instead
 * of the local filesystem (so we never hit local fs.existsSync false-positives).
 */
async function parseGitRemote(
	cwd: string,
	sshRemoteConfig?: AgentSshRemoteConfig,
	sshStore?: SshRemoteSettingsStore
): Promise<RemoteResult> {
	// Verify the path is a git repo by running `git rev-parse --is-inside-work-tree`.
	// This works both locally and via SSH without needing filesystem access.
	const revParse = await runGit(
		['rev-parse', '--is-inside-work-tree'],
		cwd,
		sshRemoteConfig,
		sshStore
	);
	if (revParse.exitCode !== 0 || revParse.stdout.trim() !== 'true') {
		return {
			ok: false,
			error: {
				code: 'NOT_A_GIT_REPO',
				message: 'Project path is not a git repository',
				detail: `No .git directory found at "${cwd}"`,
			},
		};
	}

	const result = await runGit(['remote', 'get-url', 'origin'], cwd, sshRemoteConfig, sshStore);

	if (result.exitCode !== 0 || !result.stdout.trim()) {
		return {
			ok: false,
			error: {
				code: 'NO_ORIGIN_REMOTE',
				message: 'No origin remote configured. Set with: git remote add origin <url>',
				detail: result.stderr.trim() || 'git remote get-url origin returned no output',
			},
		};
	}

	const url = result.stdout.trim();

	// git@github.com:owner/repo.git  or  git@github.com:owner/repo
	const sshMatch = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
	if (sshMatch) {
		const host = sshMatch[1];
		if (!host.includes('github.com')) {
			return {
				ok: false,
				error: {
					code: 'NOT_GITHUB',
					message: 'Origin remote is not on github.com',
					detail: `Remote URL: ${url}`,
				},
			};
		}
		return { ok: true, coords: { owner: sshMatch[2], repo: sshMatch[3] } };
	}

	// https://github.com/owner/repo.git  or  https://github.com/owner/repo
	const httpsMatch = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
	if (httpsMatch) {
		const host = httpsMatch[1];
		if (!host.includes('github.com')) {
			return {
				ok: false,
				error: {
					code: 'NOT_GITHUB',
					message: 'Origin remote is not on github.com',
					detail: `Remote URL: ${url}`,
				},
			};
		}
		return { ok: true, coords: { owner: httpsMatch[2], repo: httpsMatch[3] } };
	}

	return {
		ok: false,
		error: {
			code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
			message: 'Origin remote is not on github.com',
			detail: `Unrecognised git remote URL format: "${url}"`,
		},
	};
}

function findMatchingProjects(projects: RawProject[], repo: string): RawProject[] {
	const scored = projects
		.map((project) => ({ project, score: scoreProjectMatch(project.title, repo) }))
		.filter((entry) => entry.score > 0);

	if (scored.length === 0) return [];

	const topScore = Math.max(...scored.map((entry) => entry.score));
	return scored.filter((entry) => entry.score === topScore).map((entry) => entry.project);
}

function scoreProjectMatch(title: string, repo: string): number {
	if (typeof title !== 'string') return 0;

	const titleLower = title.toLowerCase();
	const repoLower = repo.toLowerCase();
	if (titleLower.includes(repoLower)) return 100;

	const titleCompact = compactForMatch(title);
	const repoCompact = compactForMatch(repo);
	if (repoCompact && titleCompact.includes(repoCompact)) return 95;

	const aliases = buildRepoAliases(repo);
	for (const alias of aliases) {
		if (alias.compact && titleCompact.includes(alias.compact)) {
			return alias.score;
		}
	}

	return 0;
}

function buildRepoAliases(repo: string): Array<{ compact: string; score: number }> {
	const tokens = tokenizeForMatch(repo);
	const aliases: Array<{ compact: string; score: number }> = [];
	const seen = new Set<string>();

	for (let start = 0; start < tokens.length; start += 1) {
		const suffix = tokens.slice(start);
		if (suffix.length === 0) continue;
		if (suffix.length === 1 && suffix[0].length < 3) continue;

		const compact = suffix.join('');
		if (seen.has(compact)) continue;
		seen.add(compact);
		aliases.push({
			compact,
			score: 40 + suffix.length,
		});
	}

	return aliases.sort((a, b) => b.score - a.score);
}

function compactForMatch(value: string): string {
	return tokenizeForMatch(value).join('');
}

function tokenizeForMatch(value: string): string[] {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

export interface RawProject {
	id: string;
	number: number;
	title: string;
}

/**
 * Return all Projects v2 projects visible to the owner via `gh project list`.
 */
async function listOwnerProjects(owner: string): Promise<ListResult> {
	const result = await execFileNoThrow('gh', [
		'project',
		'list',
		'--owner',
		owner,
		'--format',
		'json',
		'--limit',
		'100',
	]);

	if (result.exitCode !== 0) {
		const stderr = result.stderr.trim();
		// Check for permission denied
		if (
			stderr.includes('permission') ||
			stderr.includes('403') ||
			stderr.includes('Forbidden') ||
			stderr.includes('unauthorized') ||
			stderr.includes('Unauthorized')
		) {
			return {
				ok: false,
				error: {
					code: 'GH_PERMISSION_DENIED',
					message: `Permission denied listing projects for owner "${owner}"`,
					detail: stderr,
				},
			};
		}
		return {
			ok: false,
			error: {
				code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
				message: `gh project list failed for owner "${owner}"`,
				detail: stderr || result.stdout.slice(0, 300),
			},
		};
	}

	const raw = result.stdout.trim();
	try {
		type ListResponse = { projects?: RawProject[] } | RawProject[];
		const parsed = JSON.parse(raw) as ListResponse;
		const projects = Array.isArray(parsed) ? parsed : (parsed.projects ?? []);

		// Validate shape: each item must have id, number, title
		if (
			!projects.every((p) => typeof p === 'object' && p !== null && 'number' in p && 'title' in p)
		) {
			return {
				ok: false,
				error: {
					code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
					message: 'gh project list returned unexpected JSON shape (gh CLI version mismatch?)',
					detail: raw.slice(0, 300),
				},
			};
		}

		return { ok: true, projects };
	} catch {
		return {
			ok: false,
			error: {
				code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
				message: 'gh project list returned invalid JSON',
				detail: raw.slice(0, 300),
			},
		};
	}
}

/**
 * Read one configured Projects v2 project by number.
 */
async function viewProject(owner: string, projectNumber: number): Promise<ViewResult> {
	const result = await execFileNoThrow('gh', [
		'project',
		'view',
		String(projectNumber),
		'--owner',
		owner,
		'--format',
		'json',
	]);

	if (result.exitCode !== 0) {
		const stderr = result.stderr.trim();
		if (
			stderr.includes('permission') ||
			stderr.includes('403') ||
			stderr.includes('Forbidden') ||
			stderr.includes('unauthorized') ||
			stderr.includes('Unauthorized')
		) {
			return {
				ok: false,
				error: {
					code: 'GH_PERMISSION_DENIED',
					message: `Permission denied reading project #${projectNumber} for owner "${owner}"`,
					detail: stderr,
				},
			};
		}
		return {
			ok: false,
			error: {
				code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
				message: `gh project view failed for owner "${owner}", project #${projectNumber}`,
				detail: stderr || result.stdout.slice(0, 300),
			},
		};
	}

	const raw = result.stdout.trim();
	try {
		const parsed = JSON.parse(raw) as RawProject;
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			typeof parsed.id !== 'string' ||
			typeof parsed.number !== 'number' ||
			typeof parsed.title !== 'string'
		) {
			return {
				ok: false,
				error: {
					code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
					message: 'gh project view returned unexpected JSON shape',
					detail: raw.slice(0, 300),
				},
			};
		}

		return { ok: true, project: parsed };
	} catch {
		return {
			ok: false,
			error: {
				code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
				message: 'gh project view returned invalid JSON',
				detail: raw.slice(0, 300),
			},
		};
	}
}

/**
 * Create a new Projects v2 project for the owner.
 */
async function createProject(owner: string, title: string): Promise<CreateResult> {
	const result = await execFileNoThrow('gh', [
		'project',
		'create',
		'--owner',
		owner,
		'--title',
		title,
		'--format',
		'json',
	]);

	if (result.exitCode !== 0) {
		const stderr = result.stderr.trim();
		// Permission denied on create
		if (
			stderr.includes('permission') ||
			stderr.includes('403') ||
			stderr.includes('Forbidden') ||
			stderr.includes('unauthorized') ||
			stderr.includes('Unauthorized')
		) {
			return {
				ok: false,
				error: {
					code: 'NO_PROJECT_AND_CANNOT_CREATE',
					message: 'No Projects v2 found and cannot create one. Check user/org permissions.',
					detail: stderr,
				},
			};
		}
		return {
			ok: false,
			error: {
				code: 'NO_PROJECT_AND_CANNOT_CREATE',
				message: 'No Projects v2 found and cannot create one. Check user/org permissions.',
				detail: stderr || `gh project create failed for owner "${owner}", title "${title}"`,
			},
		};
	}

	const raw = result.stdout.trim();
	try {
		const parsed = JSON.parse(raw) as RawProject;
		if (typeof parsed.number !== 'number' || typeof parsed.title !== 'string') {
			return {
				ok: false,
				error: {
					code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
					message: 'gh project create returned unexpected JSON shape',
					detail: raw.slice(0, 300),
				},
			};
		}
		return { ok: true, project: parsed };
	} catch {
		return {
			ok: false,
			error: {
				code: 'GH_CLI_OUTPUT_UNRECOGNIZED',
				message: 'gh project create returned invalid JSON',
				detail: raw.slice(0, 300),
			},
		};
	}
}
