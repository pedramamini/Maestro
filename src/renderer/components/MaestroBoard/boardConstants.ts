import {
	AlertTriangle,
	CheckCircle2,
	Circle,
	CircleDot,
	Clock3,
	Inbox,
	PlayCircle,
	RotateCcw,
} from 'lucide-react';
import type { MaestroBoardColumnDefinition, MaestroBoardStatus } from './types';

export const MAESTRO_BOARD_COLUMNS: MaestroBoardColumnDefinition[] = [
	{ status: 'backlog', label: 'Backlog', icon: Inbox },
	{ status: 'ready', label: 'Ready', icon: CircleDot },
	{ status: 'running', label: 'Running', icon: PlayCircle },
	{ status: 'needs_fix', label: 'Needs Fix', icon: RotateCcw },
	{ status: 'review', label: 'Review', icon: Clock3 },
	{ status: 'blocked', label: 'Blocked', icon: AlertTriangle },
	{ status: 'done', label: 'Done', icon: CheckCircle2 },
];

export const MAESTRO_BOARD_STATUS_LABELS: Record<MaestroBoardStatus, string> = {
	backlog: 'Backlog',
	ready: 'Ready',
	running: 'Running',
	needs_fix: 'Needs Fix',
	review: 'Review',
	blocked: 'Blocked',
	done: 'Done',
};

export const MAESTRO_BOARD_FALLBACK_ICON = Circle;
