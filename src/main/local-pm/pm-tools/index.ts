import {
	WORK_GRAPH_READY_TAG_DEFINITION,
	type TagDefinition,
	type WorkGraphActor,
	type WorkItem,
	type WorkItemClaim,
	type WorkItemEvent,
	type WorkItemEventCreateInput,
	type WorkItemStatus,
	type WorkItemUpdateInput,
} from '../../../shared/work-graph-types';
import { getWorkGraphItemStore } from '../../work-graph';

export const LOCAL_PM_FIELD_NAMES = [
	'AI Status',
	'AI Role',
	'AI Stage',
	'AI Priority',
	'AI Parent PRD',
	'AI Parent Epic',
	'AI Assigned Slot',
	'AI Last Heartbeat',
	'AI Project',
	'External Mirror ID',
] as const;

const LOCAL_PM_TAG: TagDefinition = {
	name: 'maestro-pm',
	description: 'Marks Work Graph items managed by the local PM board.',
	source: 'agent-dispatch',
	readonly: false,
	canonical: true,
};

const PM_METADATA_KEY = 'localPm';

const AI_STATUS_TO_WORK_ITEM_STATUS: Record<string, WorkItemStatus> = {
	Backlog: 'backlog',
	Idea: 'discovered',
	'PRD Draft': 'planned',
	Refinement: 'planned',
	'Tasks Ready': 'ready',
	'In Progress': 'in_progress',
	'In Review': 'review',
	Blocked: 'blocked',
	Done: 'done',
};

const WORK_ITEM_STATUS_TO_AI_STATUS: Record<WorkItemStatus, string> = {
	backlog: 'Backlog',
	discovered: 'Idea',
	planned: 'Refinement',
	ready: 'Tasks Ready',
	claimed: 'In Progress',
	in_progress: 'In Progress',
	blocked: 'Blocked',
	review: 'In Review',
	done: 'Done',
	archived: 'Done',
	canceled: 'Backlog',
};

export interface LocalPmStore {
	upsertTag(definition: TagDefinition): Promise<TagDefinition>;
	listTags(): Promise<TagDefinition[]>;
	getItem(id: string): Promise<WorkItem | undefined>;
	updateItem(input: WorkItemUpdateInput): Promise<WorkItem>;
	recordEvent(input: WorkItemEventCreateInput): Promise<WorkItemEvent>;
	listActiveClaims(): Promise<WorkItemClaim[]>;
	releaseClaim(
		workItemId: string,
		options?: { note?: string; actor?: WorkGraphActor; revertStatusTo?: WorkItemStatus }
	): Promise<WorkItemClaim | undefined>;
}

export interface LocalPmHelperDependencies {
	store?: LocalPmStore;
	now?: () => number;
}

export interface LocalPmInitInput {
	projectPath?: string;
}

export interface LocalPmInitResult {
	created: string[];
	existing: string[];
	errors: string[];
}

export interface LocalPmSetStatusInput {
	agentSessionId: string;
	status: string;
	projectPath?: string;
	workItemId?: string;
}

export interface LocalPmSetRoleInput {
	agentSessionId: string;
	role: string;
	projectPath?: string;
	workItemId?: string;
}

export interface LocalPmSetBlockedInput {
	agentSessionId: string;
	reason: string;
	projectPath?: string;
	workItemId?: string;
}

export interface LocalPmToolsResult {
	workItemId: string;
	field: string;
	value: string;
}

export type LocalPmToolEnvelope =
	| { success: true; data: LocalPmToolsResult }
	| { success: false; error: string };

export interface LocalPmAuditRunOptions {
	staleClaimMs?: number;
	projectPath?: string;
	projectRoleSlots?: Partial<Record<string, string>>;
}

export interface LocalPmAuditFinding {
	workItemId: string;
	checkId: string;
	message: string;
	severity: 'auto-fix' | 'needs-attention';
}

export interface LocalPmAuditReport {
	totalAudited: number;
	autoFixed: LocalPmAuditFinding[];
	needsAttention: LocalPmAuditFinding[];
	errors: Array<{ workItemId: string; error: string }>;
}

export type LocalPmAuditEnvelope =
	| { success: true; data: LocalPmAuditReport }
	| { success: false; error: string };

interface LocalPmMetadata {
	fields?: Record<string, string>;
	comments?: Array<{ body: string; actor: string; createdAt: string }>;
}

export async function initializeLocalPmProject(
	input: LocalPmInitInput = {},
	deps: LocalPmHelperDependencies = {}
): Promise<LocalPmInitResult> {
	const store = resolveStore(deps);
	const result: LocalPmInitResult = {
		created: [],
		existing: [...LOCAL_PM_FIELD_NAMES],
		errors: [],
	};

	try {
		const tags = await store.listTags();
		const existingTags = new Set(tags.map((tag) => tag.name));
		for (const tag of [WORK_GRAPH_READY_TAG_DEFINITION, LOCAL_PM_TAG]) {
			await store.upsertTag(tag);
			if (existingTags.has(tag.name)) {
				result.existing.push(`tag:${tag.name}`);
			} else {
				result.created.push(`tag:${tag.name}`);
			}
		}
		if (input.projectPath) {
			result.existing.push(`project:${input.projectPath}`);
		}
	} catch (err) {
		result.errors.push(err instanceof Error ? err.message : String(err));
	}

	return result;
}

export async function setLocalPmStatus(
	input: LocalPmSetStatusInput,
	deps: LocalPmHelperDependencies = {}
): Promise<LocalPmToolEnvelope> {
	try {
		const store = resolveStore(deps);
		const status = AI_STATUS_TO_WORK_ITEM_STATUS[input.status];
		if (!status) {
			return { success: false, error: `Unsupported AI Status value: ${input.status}` };
		}

		const { item, claim } = await resolveOwnedLocalPmItem(store, input);
		const updated = await store.updateItem({
			id: item.id,
			actor: actorForAgent(input.agentSessionId),
			patch: {
				status,
				completedAt:
					status === 'done' ? new Date(resolveNow(deps)).toISOString() : item.completedAt,
				metadata: withPmField(item, 'AI Status', input.status),
			},
		});

		await store.recordEvent({
			workItemId: updated.id,
			type: 'status_changed',
			actor: actorForAgent(input.agentSessionId),
			priorState: { 'AI Status': getAiStatus(item), claimId: claim.id },
			newState: { 'AI Status': input.status },
		});

		return {
			success: true,
			data: { workItemId: updated.id, field: 'AI Status', value: input.status },
		};
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

export async function setLocalPmRole(
	input: LocalPmSetRoleInput,
	deps: LocalPmHelperDependencies = {}
): Promise<LocalPmToolEnvelope> {
	try {
		const store = resolveStore(deps);
		const { item, claim } = await resolveOwnedLocalPmItem(store, input);
		const updated = await store.updateItem({
			id: item.id,
			actor: actorForAgent(input.agentSessionId),
			patch: {
				metadata: withPmField(item, 'AI Role', input.role),
			},
		});

		await store.recordEvent({
			workItemId: updated.id,
			type: 'updated',
			actor: actorForAgent(input.agentSessionId),
			priorState: { 'AI Role': getAiRole(item), claimId: claim.id },
			newState: { 'AI Role': input.role },
		});

		return { success: true, data: { workItemId: updated.id, field: 'AI Role', value: input.role } };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

export async function setLocalPmBlocked(
	input: LocalPmSetBlockedInput,
	deps: LocalPmHelperDependencies = {}
): Promise<LocalPmToolEnvelope> {
	try {
		const store = resolveStore(deps);
		const { item, claim } = await resolveOwnedLocalPmItem(store, input);
		const actor = actorForAgent(input.agentSessionId);
		const comment = `**Blocked** - ${input.reason}`;
		const updated = await store.updateItem({
			id: item.id,
			actor,
			patch: {
				status: 'blocked',
				metadata: withPmComment(
					{ ...item, metadata: withPmField(item, 'AI Status', 'Blocked') },
					comment,
					input.agentSessionId,
					new Date(resolveNow(deps)).toISOString()
				),
			},
		});

		await store.recordEvent({
			workItemId: updated.id,
			type: 'status_changed',
			actor,
			message: comment,
			priorState: { 'AI Status': getAiStatus(item), claimId: claim.id },
			newState: { 'AI Status': 'Blocked' },
			reason: input.reason,
		});

		return {
			success: true,
			data: { workItemId: updated.id, field: 'AI Status', value: 'Blocked' },
		};
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

export async function runLocalPmAudit(
	opts: LocalPmAuditRunOptions = {},
	deps: LocalPmHelperDependencies = {}
): Promise<LocalPmAuditEnvelope> {
	try {
		const store = resolveStore(deps);
		const now = resolveNow(deps);
		const staleClaimMs = opts.staleClaimMs ?? 5 * 60 * 1000;
		const claims = await store.listActiveClaims();
		const report: LocalPmAuditReport = {
			totalAudited: 0,
			autoFixed: [],
			needsAttention: [],
			errors: [],
		};
		const titles = new Map<string, string>();

		for (const claim of claims) {
			const item = await store.getItem(claim.workItemId);
			if (!item) {
				report.errors.push({
					workItemId: claim.workItemId,
					error: 'Claim references missing item',
				});
				continue;
			}
			if (opts.projectPath && item.projectPath !== opts.projectPath) continue;

			report.totalAudited += 1;
			await auditStaleClaim(store, item, claim, now, staleClaimMs, report);
			auditClaimRole(item, report);
			auditOrphanedSlot(item, claim, opts.projectRoleSlots, report);
			auditDuplicateTitle(item, titles, report);
		}

		return { success: true, data: report };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

async function auditStaleClaim(
	store: LocalPmStore,
	item: WorkItem,
	claim: WorkItemClaim,
	now: number,
	staleClaimMs: number,
	report: LocalPmAuditReport
): Promise<void> {
	const heartbeat = claim.lastHeartbeat ?? claim.claimedAt;
	const heartbeatMs = new Date(heartbeat).getTime();
	if (!Number.isFinite(heartbeatMs) || now - heartbeatMs <= staleClaimMs) return;

	const finding: LocalPmAuditFinding = {
		workItemId: item.id,
		checkId: 'STALE_CLAIM',
		message: `Local claim ${claim.id} heartbeat is stale by ${Math.round((now - heartbeatMs) / 1000)}s.`,
		severity: 'auto-fix',
	};

	try {
		await store.releaseClaim(item.id, {
			note: 'PM audit released stale local claim',
			actor: { type: 'system', id: 'local-pm-audit' },
			revertStatusTo: 'ready',
		});
		await store.updateItem({
			id: item.id,
			actor: { type: 'system', id: 'local-pm-audit' },
			patch: {
				status: 'ready',
				metadata: withPmField(item, 'AI Status', 'Tasks Ready'),
			},
		});
		report.autoFixed.push(finding);
	} catch (err) {
		report.needsAttention.push({
			...finding,
			severity: 'needs-attention',
			message: `${finding.message} [auto-fix failed: ${err instanceof Error ? err.message : String(err)}]`,
		});
	}
}

function auditClaimRole(item: WorkItem, report: LocalPmAuditReport): void {
	if (item.status !== 'in_progress' && item.status !== 'claimed') return;
	if (getAiRole(item)) return;
	report.needsAttention.push({
		workItemId: item.id,
		checkId: 'IN_PROGRESS_NO_ROLE',
		message: `"${item.title}" is in progress but has no AI Role.`,
		severity: 'needs-attention',
	});
}

function auditOrphanedSlot(
	item: WorkItem,
	claim: WorkItemClaim,
	projectRoleSlots: Partial<Record<string, string>> | undefined,
	report: LocalPmAuditReport
): void {
	if (!projectRoleSlots) return;
	const agentId = claim.owner.agentId ?? claim.owner.providerSessionId ?? claim.owner.id;
	const knownAgent = Object.values(projectRoleSlots).some((slotAgentId) => slotAgentId === agentId);
	if (knownAgent) return;
	report.needsAttention.push({
		workItemId: item.id,
		checkId: 'ORPHANED_SLOT_AGENT',
		message: `Local claim owner "${agentId}" is not present in projectRoleSlots.`,
		severity: 'needs-attention',
	});
}

function auditDuplicateTitle(
	item: WorkItem,
	titles: Map<string, string>,
	report: LocalPmAuditReport
): void {
	if (item.status === 'done' || item.status === 'backlog') return;
	const key = item.title.trim().toLowerCase();
	if (!key) return;
	const first = titles.get(key);
	if (!first) {
		titles.set(key, item.id);
		return;
	}
	report.needsAttention.push({
		workItemId: item.id,
		checkId: 'DUPLICATE_TITLE',
		message: `"${item.title}" duplicates local item ${first}.`,
		severity: 'needs-attention',
	});
}

async function resolveOwnedLocalPmItem(
	store: LocalPmStore,
	input: { agentSessionId: string; projectPath?: string; workItemId?: string }
): Promise<{ item: WorkItem; claim: WorkItemClaim }> {
	const claims = await store.listActiveClaims();
	const claim = claims.find((candidate) => {
		if (input.workItemId && candidate.workItemId !== input.workItemId) return false;
		return claimIsOwnedBy(candidate, input.agentSessionId);
	});
	if (!claim) {
		return Promise.reject(
			new Error(`Agent session "${input.agentSessionId}" has no active local PM claim`)
		);
	}

	const item = await store.getItem(claim.workItemId);
	if (!item) {
		throw new Error(`Local PM claim ${claim.id} references missing item ${claim.workItemId}`);
	}
	if (input.projectPath && item.projectPath !== input.projectPath) {
		throw new Error(
			`Local PM claim ${claim.id} belongs to ${item.projectPath}, not ${input.projectPath}`
		);
	}

	return { item, claim };
}

function claimIsOwnedBy(claim: WorkItemClaim, agentSessionId: string): boolean {
	return (
		claim.owner.id === agentSessionId ||
		claim.owner.agentId === agentSessionId ||
		claim.owner.providerSessionId === agentSessionId
	);
}

function actorForAgent(agentSessionId: string): WorkGraphActor {
	return { type: 'agent', id: agentSessionId, providerSessionId: agentSessionId };
}

function getAiStatus(item: WorkItem): string {
	const metadataStatus = getPmMetadata(item).fields?.['AI Status'];
	return metadataStatus ?? WORK_ITEM_STATUS_TO_AI_STATUS[item.status] ?? item.status;
}

function getAiRole(item: WorkItem): string {
	return getPmMetadata(item).fields?.['AI Role'] ?? item.pipeline?.currentRole ?? '';
}

function withPmField(item: WorkItem, field: string, value: string): Record<string, unknown> {
	const metadata = item.metadata ?? {};
	const pm = getPmMetadata(item);
	return {
		...metadata,
		[PM_METADATA_KEY]: {
			...pm,
			fields: {
				...(pm.fields ?? {}),
				[field]: value,
			},
		},
	};
}

function withPmComment(
	item: WorkItem,
	body: string,
	actor: string,
	createdAt: string
): Record<string, unknown> {
	const metadata = item.metadata ?? {};
	const pm = getPmMetadata(item);
	return {
		...metadata,
		[PM_METADATA_KEY]: {
			...pm,
			comments: [...(pm.comments ?? []), { body, actor, createdAt }],
		},
	};
}

function getPmMetadata(item: WorkItem): LocalPmMetadata {
	const value = item.metadata?.[PM_METADATA_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value as LocalPmMetadata;
}

function resolveStore(deps: LocalPmHelperDependencies): LocalPmStore {
	return deps.store ?? getWorkGraphItemStore();
}

function resolveNow(deps: LocalPmHelperDependencies): number {
	return deps.now?.() ?? Date.now();
}
