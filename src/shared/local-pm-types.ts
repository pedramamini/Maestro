import type {
	WorkGraphActor,
	WorkGraphListResult,
	WorkItem,
	WorkItemClaim,
	WorkItemEvent,
	WorkItemStatus,
	WorkItemType,
} from './work-graph-types';

export type LocalPmRole = 'owner' | 'runner' | 'fixer' | 'reviewer' | 'merger' | string;

export type LocalPmWorkStatus = Exclude<WorkItemStatus, 'backlog'>;

export type LocalPmStatusCategory = 'todo' | 'active' | 'blocked' | 'done' | 'terminal';

export interface LocalPmStatusDefinition {
	id: LocalPmWorkStatus;
	name: string;
	category: LocalPmStatusCategory;
	sortOrder: number;
	terminal: boolean;
}

export interface LocalPmProject {
	path: string;
	name: string;
	health: LocalPmProjectHealth;
}

export interface LocalPmProjectHealth {
	projectPath: string;
	total: number;
	ready: number;
	claimed: number;
	inProgress: number;
	blocked: number;
	review: number;
	done: number;
	activeClaims: number;
	staleClaims: number;
	statusCounts: Partial<Record<LocalPmWorkStatus, number>>;
	generatedAt: string;
}

export type LocalPmWorkItem = WorkItem;
export type LocalPmClaim = WorkItemClaim;
export type LocalPmAuditEvent = WorkItemEvent;

export interface LocalPmListReadyOptions {
	limit?: number;
	role?: LocalPmRole;
	agentCapabilities?: string[];
	includePlanned?: boolean;
}

export interface LocalPmCreateWorkInput {
	projectPath: string;
	gitPath?: string;
	type: WorkItemType;
	title: string;
	description?: string;
	status?: LocalPmWorkStatus;
	parentWorkItemId?: string;
	tags?: string[];
	priority?: number;
	dueAt?: string;
	metadata?: Record<string, unknown>;
}

export interface LocalPmUpdateWorkInput {
	projectPath: string;
	workItemId: string;
	patch: Partial<
		Pick<
			WorkItem,
			| 'type'
			| 'title'
			| 'description'
			| 'status'
			| 'tags'
			| 'priority'
			| 'dueAt'
			| 'metadata'
			| 'parentWorkItemId'
		>
	>;
	actor?: WorkGraphActor;
	reason?: string;
}

export interface LocalPmClaimWorkInput {
	projectPath: string;
	workItemId: string;
	agentId: string;
	role: LocalPmRole;
	agentName?: string;
	expiresAt?: string;
	note?: string;
}

export interface LocalPmReleaseClaimInput {
	projectPath: string;
	workItemId: string;
	claimId?: string;
	agentId?: string;
	note?: string;
	revertStatusTo?: LocalPmWorkStatus;
}

export interface LocalPmUpdateStatusInput {
	projectPath: string;
	workItemId: string;
	status: LocalPmWorkStatus;
	actor?: WorkGraphActor;
	reason?: string;
	artifactLink?: string;
}

export interface LocalPmHeartbeatInput {
	projectPath: string;
	workItemId: string;
	claimId?: string;
	agentId: string;
	role?: LocalPmRole;
	expiresAt?: string;
	note?: string;
}

export interface LocalPmHeartbeatResult {
	workItemId: string;
	claimId: string;
	agentId: string;
	lastHeartbeat: string;
	expiresAt?: string;
}

export interface LocalPmReadyWorkResult extends WorkGraphListResult {
	items: LocalPmWorkItem[];
}
