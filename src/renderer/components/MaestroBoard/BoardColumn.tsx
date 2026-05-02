import { memo } from 'react';
import type { DragEvent } from 'react';
import { Inbox } from 'lucide-react';
import type { Theme } from '../../types';
import { MAESTRO_BOARD_FALLBACK_ICON } from './boardConstants';
import { WorkItemCard } from './WorkItemCard';
import type { MaestroBoardColumnDefinition, MaestroBoardItem } from './types';

export interface BoardColumnProps {
	column: MaestroBoardColumnDefinition;
	items: MaestroBoardItem[];
	theme: Theme;
	selectedItemId?: string | null;
	draggableCards?: boolean;
	onItemSelect?: (item: MaestroBoardItem) => void;
	onCardDragStart?: (event: DragEvent<HTMLDivElement>, item: MaestroBoardItem) => void;
	onColumnDragOver?: (event: DragEvent<HTMLElement>, column: MaestroBoardColumnDefinition) => void;
	onColumnDrop?: (event: DragEvent<HTMLElement>, column: MaestroBoardColumnDefinition) => void;
}

function columnAccent(column: MaestroBoardColumnDefinition, theme: Theme): string {
	switch (column.status) {
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

export const BoardColumn = memo(function BoardColumn({
	column,
	items,
	theme,
	selectedItemId,
	draggableCards = false,
	onItemSelect,
	onCardDragStart,
	onColumnDragOver,
	onColumnDrop,
}: BoardColumnProps) {
	const accent = columnAccent(column, theme);
	const Icon = column.icon ?? MAESTRO_BOARD_FALLBACK_ICON;

	return (
		<section
			className="flex h-full min-h-[220px] w-[280px] shrink-0 flex-col rounded border"
			style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
			onDragOver={onColumnDragOver ? (event) => onColumnDragOver(event, column) : undefined}
			onDrop={onColumnDrop ? (event) => onColumnDrop(event, column) : undefined}
			aria-label={`${column.label} column`}
		>
			<header
				className="flex shrink-0 items-start justify-between gap-3 border-b px-3 py-2.5"
				style={{ borderColor: theme.colors.border }}
			>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
						<h3 className="truncate text-sm font-semibold" style={{ color: theme.colors.textMain }}>
							{column.label}
						</h3>
					</div>
					{column.description && (
						<p className="mt-1 line-clamp-2 text-xs" style={{ color: theme.colors.textDim }}>
							{column.description}
						</p>
					)}
				</div>
				<span
					className="rounded-full px-2 py-0.5 text-[10px] font-bold"
					style={{ backgroundColor: `${accent}18`, color: accent }}
				>
					{items.length}
				</span>
			</header>

			<div className="flex-1 space-y-2 overflow-y-auto p-2">
				{items.length === 0 ? (
					<div
						className="flex h-24 flex-col items-center justify-center gap-2 rounded border border-dashed text-xs"
						style={{ borderColor: theme.colors.border, color: theme.colors.textDim }}
					>
						<Inbox className="h-5 w-5" />
						No work
					</div>
				) : (
					items.map((item) => (
						<WorkItemCard
							key={item.id}
							item={item}
							theme={theme}
							selected={selectedItemId === item.id}
							draggable={draggableCards}
							onSelect={onItemSelect}
							onDragStart={onCardDragStart}
						/>
					))
				)}
			</div>
		</section>
	);
});
