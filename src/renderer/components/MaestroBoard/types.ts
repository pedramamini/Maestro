import type { LucideIcon } from 'lucide-react';

export type MaestroBoardStatus =
	| 'backlog'
	| 'ready'
	| 'running'
	| 'needs_fix'
	| 'review'
	| 'blocked'
	| 'done';

export type MaestroBoardPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface MaestroBoardOwner {
	id: string;
	name: string;
	initials?: string;
	avatarUrl?: string;
}

export interface MaestroBoardItem {
	id: string;
	title: string;
	status: MaestroBoardStatus;
	type?: string;
	priority?: MaestroBoardPriority;
	projectName?: string;
	owner?: MaestroBoardOwner | null;
	points?: number;
	tags?: string[];
	blockedReason?: string;
	dueDate?: string;
	updatedAt?: string | number | Date;
	metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface MaestroBoardColumnDefinition {
	status: MaestroBoardStatus;
	label: string;
	description?: string;
	icon?: LucideIcon;
}

export interface MaestroProjectHealthMetric {
	id: string;
	label: string;
	value: string | number;
	tone?: 'neutral' | 'good' | 'warning' | 'danger';
	detail?: string;
}

export type MaestroBoardViewMode = 'board' | 'list';
