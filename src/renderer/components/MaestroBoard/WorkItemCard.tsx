import { memo, useCallback } from 'react';
import type { DragEvent } from 'react';
import {
	AlertTriangle,
	CalendarDays,
	CheckCircle2,
	CircleDot,
	Clock3,
	Flame,
	Inbox,
	PlayCircle,
	RotateCcw,
	Tag,
	UserRound,
} from 'lucide-react';
import type { Theme } from '../../types';
import { formatRelativeTime } from '../../../shared/formatters';
import { MAESTRO_BOARD_STATUS_LABELS } from './boardConstants';
import type { MaestroBoardItem, MaestroBoardStatus } from './types';

export interface WorkItemCardProps {
	item: MaestroBoardItem;
	theme: Theme;
	selected?: boolean;
	draggable?: boolean;
	onSelect?: (item: MaestroBoardItem) => void;
	onDragStart?: (event: DragEvent<HTMLDivElement>, item: MaestroBoardItem) => void;
}

function statusColor(status: MaestroBoardStatus, theme: Theme): string {
	switch (status) {
		case 'ready':
		case 'done':
			return theme.colors.success;
		case 'running':
		case 'review':
			return theme.colors.accent;
		case 'needs_fix':
			return theme.colors.warning;
		case 'blocked':
			return theme.colors.error;
		case 'backlog':
		default:
			return theme.colors.textDim;
	}
}

function priorityColor(priority: MaestroBoardItem['priority'], theme: Theme): string {
	switch (priority) {
		case 'urgent':
			return theme.colors.error;
		case 'high':
			return theme.colors.warning;
		case 'medium':
			return theme.colors.accent;
		case 'low':
		default:
			return theme.colors.textDim;
	}
}

function getStatusIcon(status: MaestroBoardStatus) {
	switch (status) {
		case 'backlog':
			return Inbox;
		case 'ready':
			return CircleDot;
		case 'running':
			return PlayCircle;
		case 'needs_fix':
			return RotateCcw;
		case 'review':
			return Clock3;
		case 'blocked':
			return AlertTriangle;
		case 'done':
			return CheckCircle2;
	}
}

function formatDueDate(value?: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join('');
}

export const WorkItemCard = memo(function WorkItemCard({
	item,
	theme,
	selected = false,
	draggable = false,
	onSelect,
	onDragStart,
}: WorkItemCardProps) {
	const accent = statusColor(item.status, theme);
	const StatusIcon = getStatusIcon(item.status);
	const dueDate = formatDueDate(item.dueDate);
	const tags = item.tags ?? [];
	const updatedAt = item.updatedAt ? formatRelativeTime(item.updatedAt) : null;
	const ownerInitials =
		item.owner?.initials ?? (item.owner?.name ? getInitials(item.owner.name) : null);

	const handleSelect = useCallback(() => {
		onSelect?.(item);
	}, [item, onSelect]);

	const handleDragStart = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.dataTransfer.setData('maestroBoardItemId', item.id);
			event.dataTransfer.effectAllowed = 'move';
			onDragStart?.(event, item);
		},
		[item, onDragStart]
	);

	return (
		<div
			role={onSelect ? 'button' : 'article'}
			tabIndex={onSelect ? 0 : undefined}
			draggable={draggable}
			aria-label={item.title}
			data-maestro-board-item-id={item.id}
			onClick={onSelect ? handleSelect : undefined}
			onKeyDown={(event) => {
				if (!onSelect) return;
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					handleSelect();
				}
			}}
			onDragStart={draggable ? handleDragStart : undefined}
			className="rounded border px-3 py-2.5 outline-none transition-colors"
			style={{
				backgroundColor: selected ? `${accent}12` : theme.colors.bgActivity,
				borderColor: selected ? accent : theme.colors.border,
				color: theme.colors.textMain,
				cursor: onSelect ? 'pointer' : draggable ? 'grab' : 'default',
			}}
		>
			<div className="flex items-start gap-2">
				<StatusIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-2">
						<h4 className="min-w-0 text-xs font-semibold leading-snug line-clamp-2">
							{item.title}
						</h4>
						<span
							className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
							style={{ backgroundColor: `${accent}18`, color: accent }}
						>
							{MAESTRO_BOARD_STATUS_LABELS[item.status]}
						</span>
					</div>

					<div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
						{item.type && <span style={{ color: theme.colors.textDim }}>{item.type}</span>}
						{item.priority && (
							<span
								className="inline-flex items-center gap-1"
								style={{ color: priorityColor(item.priority, theme) }}
							>
								<Flame className="h-3 w-3" />
								{item.priority}
							</span>
						)}
						{typeof item.points === 'number' && (
							<span style={{ color: theme.colors.textDim }}>{item.points} pts</span>
						)}
						{dueDate && (
							<span
								className="inline-flex items-center gap-1"
								style={{ color: theme.colors.textDim }}
							>
								<CalendarDays className="h-3 w-3" />
								{dueDate}
							</span>
						)}
						{updatedAt && (
							<span className="ml-auto shrink-0" style={{ color: theme.colors.textDim }}>
								{updatedAt}
							</span>
						)}
					</div>

					{item.blockedReason && (
						<div
							className="mt-2 flex items-start gap-1.5 rounded px-2 py-1 text-[10px]"
							style={{ backgroundColor: `${theme.colors.error}12`, color: theme.colors.error }}
						>
							<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
							<span className="min-w-0 line-clamp-2">{item.blockedReason}</span>
						</div>
					)}

					{tags.length > 0 && (
						<div className="mt-2 flex flex-wrap gap-1">
							{tags.slice(0, 4).map((tag) => (
								<span
									key={tag}
									className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
									style={{
										backgroundColor: `${theme.colors.accent}12`,
										color: theme.colors.accentText,
									}}
								>
									<Tag className="h-2.5 w-2.5" />
									{tag}
								</span>
							))}
							{tags.length > 4 && (
								<span className="text-[10px]" style={{ color: theme.colors.textDim }}>
									+{tags.length - 4}
								</span>
							)}
						</div>
					)}

					{(item.owner || item.projectName) && (
						<div className="mt-2 flex items-center justify-between gap-2">
							{item.projectName && (
								<span
									className="truncate text-[10px] font-medium"
									style={{ color: theme.colors.textDim }}
								>
									{item.projectName}
								</span>
							)}
							{item.owner && (
								<span
									className="ml-auto inline-flex items-center gap-1 text-[10px]"
									style={{ color: theme.colors.textDim }}
								>
									<span
										className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold"
										style={{
											backgroundColor: `${theme.colors.accent}18`,
											color: theme.colors.accent,
										}}
									>
										{item.owner.avatarUrl ? (
											<img
												src={item.owner.avatarUrl}
												alt=""
												className="h-full w-full object-cover"
											/>
										) : (
											ownerInitials || <UserRound className="h-3 w-3" />
										)}
									</span>
									{item.owner.name}
								</span>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
});
