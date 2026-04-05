// Create playbook command
// Creates a new playbook for an agent from CLI

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { normalizePlaybookDraft } from '../../shared/playbookDag';
import type {
	Playbook,
	PlaybookDraft,
	PlaybookDocumentEntry,
	PlaybookTaskGraph,
	PlaybookTaskGraphNode,
} from '../../shared/types';
import { ensureMarkdownFilename } from '../../shared/markdownFilenames';
import { getDefaultPlaybookPrompt } from '../../shared/playbookPromptUtils';
import { formatError } from '../output/formatter';
import { readPlaybooks, resolvePlaybooksFilePath, writePlaybooks } from '../services/playbooks';
import { getSessionById, resolveAgentId } from '../services/storage';

interface CreatePlaybookOptions {
	agent?: string;
	folder?: string;
	docs?: string;
	prompt?: string;
	template?: string;
	description?: string;
	tasks?: string;
	json?: boolean;
	dryRun?: boolean;
	force?: boolean;
	printPath?: boolean;
}

function resolveRepoRoot(candidate: string): string {
	try {
		return fs.realpathSync(candidate);
	} catch {
		return path.resolve(candidate);
	}
}

function detectSourceBranch(repoRoot: string): string {
	try {
		return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
			cwd: repoRoot,
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return 'main';
	}
}

function collectMarkdownFiles(root: string): string[] {
	const results: string[] = [];
	const entries = fs.readdirSync(root, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectMarkdownFiles(fullPath));
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (entry.name.toLowerCase() === 'playbook.md') {
			continue;
		}
		if (entry.name.endsWith('.md')) {
			results.push(fullPath);
		}
	}
	return results;
}

function resolveDocumentList(autoRunFolderPath: string, options: CreatePlaybookOptions): string[] {
	if (options.docs) {
		return options.docs
			.split(',')
			.map((doc) => doc.trim())
			.filter(Boolean)
			.map(ensureMarkdownFilename);
	}

	if (!options.folder) {
		return [];
	}

	const folderPath = path.resolve(options.folder);
	if (!fs.existsSync(folderPath)) {
		throw new Error(`Folder not found: ${options.folder}`);
	}
	const docs = collectMarkdownFiles(folderPath)
		.map((docPath) => path.relative(autoRunFolderPath, docPath))
		.filter((doc) => !doc.startsWith('..'))
		.map(ensureMarkdownFilename);

	return docs.sort((a, b) => a.localeCompare(b));
}

function buildDocuments(autoRunFolderPath: string, documents: string[]): PlaybookDocumentEntry[] {
	const result: PlaybookDocumentEntry[] = [];
	for (const doc of documents) {
		const normalized = ensureMarkdownFilename(doc);
		const absolutePath = path.isAbsolute(normalized)
			? normalized
			: path.join(autoRunFolderPath, normalized);

		if (!fs.existsSync(absolutePath)) {
			throw new Error(`Document not found: ${normalized}`);
		}

		const relative = path.isAbsolute(normalized)
			? path.relative(autoRunFolderPath, normalized)
			: normalized;

		if (relative.startsWith('..')) {
			throw new Error(`Document is outside auto run folder: ${normalized}`);
		}

		result.push({ filename: relative, resetOnCompletion: false });
	}
	return result;
}

function parseTaskGraph(rawTasks: string, documents: PlaybookDocumentEntry[]): PlaybookTaskGraph {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawTasks);
	} catch {
		throw new Error('Invalid JSON passed to --tasks.');
	}

	if (!Array.isArray(parsed)) {
		throw new Error('--tasks must be a JSON array.');
	}

	if (parsed.length !== documents.length) {
		throw new Error('--tasks length must match number of documents in the playbook.');
	}

	const nodes: PlaybookTaskGraphNode[] = parsed.map((entry, index) => {
		if (typeof entry === 'string') {
			return { id: entry, documentIndex: index };
		}
		if (typeof entry === 'object' && entry !== null) {
			const rawNode = entry as Partial<PlaybookTaskGraphNode>;
			const id = typeof rawNode.id === 'string' ? rawNode.id : '';
			if (!id.trim()) {
				throw new Error('Each task node must include a non-empty id.');
			}
			return {
				id,
				documentIndex: typeof rawNode.documentIndex === 'number' ? rawNode.documentIndex : index,
				dependsOn: Array.isArray(rawNode.dependsOn)
					? rawNode.dependsOn.filter((dep) => typeof dep === 'string')
					: undefined,
				isolationMode: rawNode.isolationMode,
			};
		}
		throw new Error('Each task must be a string or an object.');
	});

	const uniqueIds = new Set(nodes.map((node) => node.id));
	if (uniqueIds.size !== nodes.length) {
		throw new Error('Task node ids must be unique.');
	}

	return { nodes };
}

export function createPlaybook(name: string, options: CreatePlaybookOptions): void {
	try {
		if (!options.agent) {
			throw new Error('Agent ID is required. Use --agent <id>.');
		}

		const agentId = resolveAgentId(options.agent);
		const agent = getSessionById(agentId);

		if (!agent) {
			throw new Error(`Agent not found: ${options.agent}`);
		}

		if (!agent.autoRunFolderPath) {
			throw new Error('Auto Run folder path is not set for this agent.');
		}

		const documentList = resolveDocumentList(agent.autoRunFolderPath, options);
		if (documentList.length === 0) {
			if (options.folder) {
				throw new Error(`No Markdown documents found under folder: ${options.folder}.`);
			}
			throw new Error('No documents specified. Use --docs or --folder.');
		}

		const documents = buildDocuments(agent.autoRunFolderPath, documentList);

		const templateName = options.template?.trim();
		const promptText =
			templateName === 'agi-way'
				? 'Goal-driven execution. One checkbox, one outcome. Follow playbook docs.'
				: (options.prompt ?? getDefaultPlaybookPrompt('compact-code'));
		if (templateName && templateName !== 'agi-way') {
			throw new Error(`Unknown template: ${templateName}. Available: agi-way`);
		}

		const description = options.description?.trim();
		const mergedPrompt =
			description && promptText
				? `${promptText}\n\nDescription: ${description}`
				: description
					? description
					: promptText;

		const taskGraph = options.tasks ? parseTaskGraph(options.tasks, documents) : undefined;

		const draft: PlaybookDraft = normalizePlaybookDraft({
			name,
			documents,
			loopEnabled: false,
			maxLoops: null,
			prompt: mergedPrompt,
			taskGraph,
		});

		const now = Date.now();
		const repoRoot = resolveRepoRoot(agent.projectRoot || agent.cwd);
		const newPlaybook: Playbook = {
			id: crypto.randomUUID(),
			createdAt: now,
			updatedAt: now,
			...draft,
			projectMemoryExecution: null,
			projectMemoryBindingIntent:
				agent.toolType === 'codex'
					? {
							policyVersion: '2026-04-04',
							repoRoot,
							sourceBranch: detectSourceBranch(repoRoot),
							bindingPreference: 'shared-branch-serialized',
							sharedCheckoutAllowed: true,
							reuseExistingBinding: true,
							allowRebindIfStale: true,
						}
					: null,
		};

		const playbooks = readPlaybooks(agentId);
		const existing = playbooks.find((playbook) => playbook.name === name);
		if (existing && !options.force) {
			throw new Error(`Playbook already exists: ${name}. Use --force to overwrite.`);
		}

		const nextPlaybooks = existing
			? playbooks.map((playbook) => (playbook.name === name ? newPlaybook : playbook))
			: [...playbooks, newPlaybook];

		const playbookPath = resolvePlaybooksFilePath(agentId);

		if (options.dryRun) {
			if (options.json) {
				console.log(
					JSON.stringify(
						{
							status: 'dry-run',
							agentId,
							agentName: agent.name,
							autoRunFolderPath: agent.autoRunFolderPath,
							playbooksPath: playbookPath,
							playbook: newPlaybook,
						},
						null,
						2
					)
				);
			} else {
				console.log(`Dry run: would create playbook "${name}" for ${agent.name}.`);
			}
			return;
		}

		writePlaybooks(agentId, nextPlaybooks);

		if (options.json) {
			console.log(
				JSON.stringify(
					{
						status: 'created',
						agentId,
						agentName: agent.name,
						playbooksPath: playbookPath,
						playbook: newPlaybook,
					},
					null,
					2
				)
			);
			return;
		}

		console.log(`Created playbook "${name}" for ${agent.name}.`);
		if (options.printPath) {
			console.log(`Playbooks file: ${playbookPath}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		if (options.json) {
			console.error(JSON.stringify({ error: message }));
		} else {
			console.error(formatError(`Failed to create playbook: ${message}`));
		}
		process.exit(1);
	}
}
