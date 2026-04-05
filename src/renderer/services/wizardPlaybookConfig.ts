import { buildImplicitTaskGraph, DEFAULT_AUTORUN_SKILLS } from '../../shared/playbookDag';
import { getPlaybookParallelismWarning } from '../../shared/playbookParallelism';
import type { PlaybookDocumentEntry, PlaybookDraft, PlaybookTaskGraph } from '../../shared/types';
import type {
	ProjectMemoryBindingIntent,
	ProjectMemoryExecutionContext,
} from '../../shared/projectMemory';

const AGI_WAY_WIZARD_SKILLS = [
	...DEFAULT_AUTORUN_SKILLS,
	'maestro-openclaw-consult',
	'openclaw-agent-sync',
	'communication-protocol',
] as const;

const AGI_WAY_DEFINITION_OF_DONE = [
	'The active checkbox goal is completed without spilling into the next major checkbox.',
	'Relevant validation passed, or the blocker and evidence are recorded explicitly.',
	'Any new architectural gotcha or repeated failure pattern is captured in handoff or failure memory.',
] as const;

const AGI_WAY_VERIFICATION_STEPS = [
	'Read CLAUDE.md, AGENTS.md, handoff.md, and Working/failure-memory.md when present before editing.',
	'Use context-and-impact or GitNexus blast-radius analysis before non-trivial edits.',
	'Consult OpenClaw main through the canonical communication path when Wizard, Auto Run, playbook, DAG, scheduler, analytics, or OpenClaw behavior is unclear or repeatedly failing.',
] as const;

export interface WizardPlaybookDocumentLike {
	filename: string;
	content: string;
	savedPath?: string;
}

export interface WizardExecutionGraphPreviewNode {
	id: string;
	filename: string;
	label: string;
	dependsOn: string[];
}

export interface WizardExecutionGraphPreview {
	mode: 'sequential' | 'parallel-final-join';
	maxParallelism: number;
	summary: string;
	reason: string;
	parallelismWarning: string | null;
	nodes: WizardExecutionGraphPreviewNode[];
	dependencyDescriptions: string[];
}

export interface WizardPlaybookPackTargetSession {
	id: string;
	name: string;
}

export interface WizardPlaybookPackDraft {
	sessionId: string;
	sessionName: string;
	playbookName: string;
	dependsOnPlaybookNames: string[];
	documents: WizardPlaybookDocumentLike[];
	draft: PlaybookDraft;
}

type InferredWizardExecutionGraph = {
	maxParallelism: number;
	taskGraph: PlaybookTaskGraph;
	strategy: 'parallel-final-join' | 'root-fanout-final-join';
};

const DAG_JOIN_LAST_KEYWORDS = [
	'integration',
	'integrate',
	'merge',
	'verification',
	'verify',
	'validation',
	'review',
	'qa',
	'final',
	'summary',
	'polish',
	'wrap-up',
	'wrap up',
];

const DAG_ROOT_FIRST_KEYWORDS = [
	'setup',
	'bootstrap',
	'foundation',
	'foundational',
	'planning',
	'plan',
	'prepare',
	'initial',
	'initialize',
	'init',
	'scaffold',
];

type SameBranchPackTarget = {
	sessionName: string;
	playbookName: string;
	matchers: string[];
	dependsOnPlaybookNames: string[];
};

const SAME_BRANCH_PACK_TARGETS: SameBranchPackTarget[] = [
	{
		sessionName: 'PM-Lead',
		playbookName: 'PM-SB-01 Contract Freeze',
		matchers: ['contract-freeze', 'readiness', 'runtime-contract', 'setup'],
		dependsOnPlaybookNames: [],
	},
	{
		sessionName: 'PM-Desktop',
		playbookName: 'PM-SB-02 Desktop Lane',
		matchers: ['desktop', 'renderer'],
		dependsOnPlaybookNames: ['PM-SB-01 Contract Freeze'],
	},
	{
		sessionName: 'PM-CLI',
		playbookName: 'PM-SB-03 CLI Lane',
		matchers: ['cli', 'batch-processor'],
		dependsOnPlaybookNames: ['PM-SB-01 Contract Freeze'],
	},
	{
		sessionName: 'PM-UI',
		playbookName: 'PM-SB-04 Visibility Lane',
		matchers: ['visibility', 'recovery-surface', 'project-memory-status', 'ui'],
		dependsOnPlaybookNames: ['PM-SB-01 Contract Freeze'],
	},
	{
		sessionName: 'PM-Integrator',
		playbookName: 'PM-SB-05 Shared Runtime Join',
		matchers: ['shared-checkout-runtime-join', 'runtime-join', 'join'],
		dependsOnPlaybookNames: [
			'PM-SB-02 Desktop Lane',
			'PM-SB-03 CLI Lane',
			'PM-SB-04 Visibility Lane',
		],
	},
	{
		sessionName: 'PM-Recovery',
		playbookName: 'PM-SB-06 Recovery Lane',
		matchers: ['recovery', 'stale', 'rebind'],
		dependsOnPlaybookNames: ['PM-SB-05 Shared Runtime Join'],
	},
	{
		sessionName: 'PM-Wizard',
		playbookName: 'PM-SB-07 Wizard Lane',
		matchers: ['wizard', 'task-generation-bridge', 'playbook-bridge'],
		dependsOnPlaybookNames: ['PM-SB-06 Recovery Lane'],
	},
	{
		sessionName: 'PM-Validator',
		playbookName: 'PM-SB-08 Final Join And Validate',
		matchers: ['validation-and-promotion', 'final-validation', 'promotion', 'handoff'],
		dependsOnPlaybookNames: ['PM-SB-07 Wizard Lane'],
	},
];

function normalizePathForComparison(value: string): string {
	return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function slugifyFilenameForMatching(filename: string): string {
	return filename
		.toLowerCase()
		.replace(/\\/g, '/')
		.replace(/^.*\//, '')
		.replace(/\.md$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function appendUniqueLines(existing: string[] | undefined, additions: string[]): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const value of [...(existing ?? []), ...additions]) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		merged.push(trimmed);
	}
	return merged;
}

function findSameBranchPackTarget(
	document: WizardPlaybookDocumentLike
): SameBranchPackTarget | null {
	const slug = slugifyFilenameForMatching(document.filename);
	for (const target of SAME_BRANCH_PACK_TARGETS) {
		if (target.matchers.some((matcher) => slug.includes(matcher))) {
			return target;
		}
	}
	return null;
}

export function getWizardDocumentRelativePath(
	autoRunFolderPath: string,
	document: WizardPlaybookDocumentLike,
	fallbackSubfolder?: string
): string {
	const normalizedRoot = normalizePathForComparison(autoRunFolderPath).replace(/\/$/, '');
	const normalizedSavedPath = document.savedPath
		? normalizePathForComparison(document.savedPath)
		: undefined;

	if (normalizedSavedPath && normalizedSavedPath.startsWith(`${normalizedRoot}/`)) {
		return normalizedSavedPath.slice(normalizedRoot.length + 1);
	}

	return fallbackSubfolder ? `${fallbackSubfolder}/${document.filename}` : document.filename;
}

export function buildWizardPlaybookDocumentEntries(
	autoRunFolderPath: string,
	documents: WizardPlaybookDocumentLike[],
	fallbackSubfolder?: string
): PlaybookDocumentEntry[] {
	return documents.map((document) => ({
		filename: getWizardDocumentRelativePath(autoRunFolderPath, document, fallbackSubfolder),
		resetOnCompletion: false,
	}));
}

function looksLikeJoinLastDocument(document: WizardPlaybookDocumentLike): boolean {
	const text = `${document.filename}\n${document.content}`.toLowerCase();
	return DAG_JOIN_LAST_KEYWORDS.some((keyword) => text.includes(keyword));
}

function looksLikeRootFirstDocument(document: WizardPlaybookDocumentLike): boolean {
	const text = `${document.filename}\n${document.content}`.toLowerCase();
	return DAG_ROOT_FIRST_KEYWORDS.some((keyword) => text.includes(keyword));
}

function buildExecutionGraphPreviewNodes(
	documentEntries: PlaybookDocumentEntry[],
	taskGraph: PlaybookTaskGraph
): WizardExecutionGraphPreviewNode[] {
	const labelByNodeId = new Map(
		taskGraph.nodes.map((node) => {
			const filename = documentEntries[node.documentIndex]?.filename ?? node.id;
			return [node.id, filename.replace(/^.*\//, '').replace(/\.md$/i, '')];
		})
	);

	return taskGraph.nodes.map((node) => {
		const filename = documentEntries[node.documentIndex]?.filename ?? node.id;
		const dependsOn = Array.isArray(node.dependsOn) ? node.dependsOn : [];
		return {
			id: node.id,
			filename,
			label: labelByNodeId.get(node.id) ?? filename,
			dependsOn: dependsOn.map((dependencyId) => labelByNodeId.get(dependencyId) ?? dependencyId),
		};
	});
}

export function inferWizardPlaybookExecutionGraph(
	documentEntries: PlaybookDocumentEntry[],
	documents: WizardPlaybookDocumentLike[]
): InferredWizardExecutionGraph | null {
	if (documents.length < 3) {
		return null;
	}

	const lastDocument = documents.at(-1);
	if (!lastDocument || !looksLikeJoinLastDocument(lastDocument)) {
		return null;
	}

	const implicitGraph = buildImplicitTaskGraph(documentEntries);
	const lastNodeId = implicitGraph.nodes.at(-1)?.id;
	if (!lastNodeId) {
		return null;
	}

	const joinDependencies = implicitGraph.nodes.slice(0, -1).map((node) => node.id);
	if (joinDependencies.length < 2) {
		return null;
	}

	const firstDocument = documents[0];
	const middleNodes = implicitGraph.nodes.slice(1, -1);
	if (
		firstDocument &&
		looksLikeRootFirstDocument(firstDocument) &&
		middleNodes.length >= 2 &&
		middleNodes.length <= 3
	) {
		const rootNodeId = implicitGraph.nodes[0]?.id;
		if (!rootNodeId) {
			return null;
		}

		return {
			maxParallelism: Math.max(2, middleNodes.length),
			strategy: 'root-fanout-final-join',
			taskGraph: {
				nodes: implicitGraph.nodes.map((node, index) => {
					if (index === 0) {
						return { ...node, dependsOn: [] };
					}
					if (index === implicitGraph.nodes.length - 1) {
						return {
							...node,
							dependsOn: middleNodes.map((middleNode) => middleNode.id),
						};
					}
					return {
						...node,
						dependsOn: [rootNodeId],
					};
				}),
			},
		};
	}

	return {
		maxParallelism: Math.max(2, joinDependencies.length),
		strategy: 'parallel-final-join',
		taskGraph: {
			nodes: implicitGraph.nodes.map((node) => ({
				...node,
				dependsOn: node.id === lastNodeId ? joinDependencies : [],
			})),
		},
	};
}

export function buildWizardExecutionGraphPreview(
	autoRunFolderPath: string,
	documents: WizardPlaybookDocumentLike[],
	fallbackSubfolder?: string
): WizardExecutionGraphPreview {
	const documentEntries = buildWizardPlaybookDocumentEntries(
		autoRunFolderPath,
		documents,
		fallbackSubfolder
	);
	const inferredGraph = inferWizardPlaybookExecutionGraph(documentEntries, documents);
	const taskGraph = inferredGraph?.taskGraph ?? buildImplicitTaskGraph(documentEntries);
	const nodes = buildExecutionGraphPreviewNodes(documentEntries, taskGraph);
	const parallelismWarning =
		getPlaybookParallelismWarning(taskGraph, inferredGraph?.maxParallelism ?? 1)?.message ?? null;

	if (inferredGraph) {
		const joinNode = nodes.at(-1);
		const rootNode = nodes[0];
		const fanOutNodes =
			inferredGraph.strategy === 'root-fanout-final-join' ? nodes.slice(1, -1) : [];

		if (inferredGraph.strategy === 'root-fanout-final-join') {
			return {
				mode: 'parallel-final-join',
				maxParallelism: inferredGraph.maxParallelism,
				summary: `AI inferred a shared setup root, ${fanOutNodes.length} parallel work documents, then a final join step.`,
				reason:
					'The first document looks like setup or planning work, and the last document looks like integration or review work, so the middle documents can branch after setup and merge in the final pass.',
				parallelismWarning,
				nodes,
				dependencyDescriptions: [
					...(fanOutNodes.length > 0 && rootNode
						? fanOutNodes.map((node) => `${node.label} waits for ${rootNode.label}.`)
						: []),
					...(joinNode ? [`${joinNode.label} waits for ${joinNode.dependsOn.join(', ')}.`] : []),
				],
			};
		}

		const parallelCount = Math.max(0, nodes.length - 1);

		return {
			mode: 'parallel-final-join',
			maxParallelism: inferredGraph.maxParallelism,
			summary: `AI inferred ${parallelCount} parallel setup documents, then a final join step.`,
			reason:
				'The last document looks like integration, review, or final verification work, so earlier documents can finish before the final pass starts.',
			parallelismWarning,
			nodes,
			dependencyDescriptions: joinNode
				? [`${joinNode.label} waits for ${joinNode.dependsOn.join(', ')}.`]
				: [],
		};
	}

	return {
		mode: 'sequential',
		maxParallelism: 1,
		summary: `AI inferred a sequential execution order for ${nodes.length} documents.`,
		reason:
			'No final integration or review document was detected, so each document runs after the previous one.',
		parallelismWarning,
		nodes,
		dependencyDescriptions: nodes
			.filter((node) => node.dependsOn.length > 0)
			.map((node) => `${node.label} waits for ${node.dependsOn.join(', ')}.`),
	};
}

export function buildWizardPlaybookDraft(
	projectName: string,
	autoRunFolderPath: string,
	documents: WizardPlaybookDocumentLike[],
	fallbackSubfolder?: string,
	projectMemoryExecution?: ProjectMemoryExecutionContext | null,
	projectMemoryBindingIntent?: ProjectMemoryBindingIntent | null
): PlaybookDraft {
	const documentEntries = buildWizardPlaybookDocumentEntries(
		autoRunFolderPath,
		documents,
		fallbackSubfolder
	);
	const inferredGraph = inferWizardPlaybookExecutionGraph(documentEntries, documents);

	return {
		name: projectName,
		documents: documentEntries,
		loopEnabled: false,
		taskTimeoutMs: 60000,
		prompt: '',
		skills: [...AGI_WAY_WIZARD_SKILLS],
		definitionOfDone: [...AGI_WAY_DEFINITION_OF_DONE],
		verificationSteps: [...AGI_WAY_VERIFICATION_STEPS],
		promptProfile: 'full',
		documentContextMode: 'active-task-only',
		skillPromptMode: 'full',
		agentStrategy: 'single',
		maxParallelism: inferredGraph?.maxParallelism,
		taskGraph: inferredGraph?.taskGraph,
		projectMemoryExecution: projectMemoryExecution ?? null,
		projectMemoryBindingIntent: projectMemoryBindingIntent ?? null,
	};
}

export function buildWizardPlaybookPackDrafts(
	projectName: string,
	autoRunFolderPath: string,
	documents: WizardPlaybookDocumentLike[],
	targetSessions: WizardPlaybookPackTargetSession[],
	fallbackSubfolder?: string,
	projectMemoryExecution?: ProjectMemoryExecutionContext | null,
	projectMemoryBindingIntent?: ProjectMemoryBindingIntent | null
): WizardPlaybookPackDraft[] | null {
	if (documents.length < 2 || targetSessions.length === 0) {
		return null;
	}

	const sessionByName = new Map(targetSessions.map((session) => [session.name, session]));
	const grouped = new Map<
		string,
		{
			target: SameBranchPackTarget;
			documents: WizardPlaybookDocumentLike[];
		}
	>();

	for (const document of documents) {
		const target = findSameBranchPackTarget(document);
		if (!target) {
			return null;
		}

		const session = sessionByName.get(target.sessionName);
		if (!session) {
			return null;
		}

		const existing = grouped.get(target.playbookName);
		if (existing) {
			existing.documents.push(document);
			continue;
		}

		grouped.set(target.playbookName, {
			target,
			documents: [document],
		});
	}

	if (grouped.size < 2) {
		return null;
	}

	return SAME_BRANCH_PACK_TARGETS.flatMap((target) => {
		const bucket = grouped.get(target.playbookName);
		const session = sessionByName.get(target.sessionName);
		if (!bucket || !session) {
			return [];
		}

		const baseDraft = buildWizardPlaybookDraft(
			target.playbookName,
			autoRunFolderPath,
			bucket.documents,
			fallbackSubfolder,
			projectMemoryExecution,
			projectMemoryBindingIntent
		);

		return [
			{
				sessionId: session.id,
				sessionName: session.name,
				playbookName: target.playbookName,
				dependsOnPlaybookNames: target.dependsOnPlaybookNames,
				documents: bucket.documents,
				draft: {
					...baseDraft,
					name: target.playbookName,
					verificationSteps: appendUniqueLines(baseDraft.verificationSteps, [
						target.dependsOnPlaybookNames.length > 0
							? `Pack dependency: wait for ${target.dependsOnPlaybookNames.join(', ')} before starting this playbook.`
							: 'Pack dependency: this playbook is the initial entry point for the same-branch orchestration pack.',
						`Pack owner: run this playbook on ${target.sessionName}.`,
					]),
				},
			},
		];
	});
}
