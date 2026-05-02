import { memo, useMemo } from 'react';
import type { DragEvent } from 'react';
import { Columns3, ListFilter, Search } from 'lucide-react';
import type { Theme } from '../../types';
import { MAESTRO_BOARD_COLUMNS, MAESTRO_BOARD_STATUS_LABELS } from './boardConstants';
import { BoardColumn } from './BoardColumn';
import { ProjectHealthStrip } from './ProjectHealthStrip';
import { WorkItemCard } from './WorkItemCard';
import type {
	MaestroBoardColumnDefinition,
	MaestroBoardItem,
	MaestroBoardStatus,
	MaestroBoardViewMode,
	MaestroProjectHealthMetric,
} from './types';

export interface BoardShellProps {
	theme: Theme;
	items: MaestroBoardItem[];
	title?: string;
	subtitle?: string;
	columns?: MaestroBoardColumnDefinition[];
	healthMetrics?: MaestroProjectHealthMetric[];
	viewMode?: MaestroBoardViewMode;
	selectedItemId?: string | null;
	emptyMessage?: string;
	draggableCards?: boolean;
	onItemSelect?: (item: MaestroBoardItem) => void;
	onCardDragStart?: (event: DragEvent<HTMLDivElement>, item: MaestroBoardItem) => void;
	onColumnDragOver?: (event: DragEvent<HTMLElement>, column: MaestroBoardColumnDefinition) => void;
	onColumnDrop?: (event: DragEvent<HTMLElement>, column: MaestroBoardColumnDefinition) => void;
}

function groupItems(
	items: MaestroBoardItem[],
	columns: MaestroBoardColumnDefinition[]
): Record<MaestroBoardStatus, MaestroBoardItem[]> {
	const grouped = columns.reduce(
		(acc, column) => {
			acc[column.status] = [];
			return acc;
		},
		{} as Record<MaestroBoardStatus, MaestroBoardItem[]>
	);

	for (const item of items) {
		if (!grouped[item.status]) grouped[item.status] = [];
		grouped[item.status].push(item);
	}

	return grouped;
}

export const BoardShell = memo(function BoardShell({
	theme,
	items,
	title = 'Maestro Board',
	subtitle,
	columns = MAESTRO_BOARD_COLUMNS,
	healthMetrics = [],
	viewMode = 'board',
	selectedItemId,
	emptyMessage = 'No local work items yet',
	draggableCards = false,
	onItemSelect,
	onCardDragStart,
	onColumnDragOver,
	onColumnDrop,
}: BoardShellProps) {
	const grouped = useMemo(() => groupItems(items, columns), [items, columns]);
	const totalPoints = useMemo(
		() => items.reduce((sum, item) => sum + (typeof item.points === 'number' ? item.points : 0), 0),
		[items]
	);

	return (
		<div
			className="flex h-full min-h-0 flex-col overflow-hidden"
			style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textMain }}
		>
			<header
				className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
				style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
			>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<Columns3 className="h-4 w-4" style={{ color: theme.colors.accent }} />
						<h1 className="truncate text-base font-semibold">{title}</h1>
					</div>
					{subtitle && (
						<p className="mt-1 truncate text-xs" style={{ color: theme.colors.textDim }}>
							{subtitle}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2 text-xs" style={{ color: theme.colors.textDim }}>
					<span className="rounded px-2 py-1" style={{ backgroundColor: theme.colors.bgActivity }}>
						{items.length} items
					</span>
					<span className="rounded px-2 py-1" style={{ backgroundColor: theme.colors.bgActivity }}>
						{totalPoints} pts
					</span>
				</div>
			</header>

			{healthMetrics.length > 0 && <ProjectHealthStrip theme={theme} metrics={healthMetrics} />}

			{items.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<div className="flex max-w-sm flex-col items-center gap-2 text-center">
						<Search className="h-8 w-8" style={{ color: theme.colors.textDim }} />
						<div className="text-sm font-semibold">{emptyMessage}</div>
						<div className="text-xs" style={{ color: theme.colors.textDim }}>
							Pass local PM items into BoardShell to render a board or list.
						</div>
					</div>
				</div>
			) : viewMode === 'list' ? (
				<div className="flex-1 overflow-y-auto p-3">
					<div className="mx-auto flex max-w-4xl flex-col gap-2">
						<div
							className="mb-1 flex items-center gap-2 text-xs font-medium"
							style={{ color: theme.colors.textDim }}
						>
							<ListFilter className="h-4 w-4" />
							Local work list
						</div>
						{items.map((item) => (
							<div key={item.id} className="grid grid-cols-[108px_minmax(0,1fr)] gap-2">
								<div className="pt-3 text-xs font-medium" style={{ color: theme.colors.textDim }}>
									{MAESTRO_BOARD_STATUS_LABELS[item.status]}
								</div>
								<WorkItemCard
									item={item}
									theme={theme}
									selected={selectedItemId === item.id}
									draggable={draggableCards}
									onSelect={onItemSelect}
									onDragStart={onCardDragStart}
								/>
							</div>
						))}
					</div>
				</div>
			) : (
				<div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
					<div className="flex h-full min-w-max gap-3">
						{columns.map((column) => (
							<BoardColumn
								key={column.status}
								column={column}
								items={grouped[column.status] ?? []}
								theme={theme}
								selectedItemId={selectedItemId}
								draggableCards={draggableCards}
								onItemSelect={onItemSelect}
								onCardDragStart={onCardDragStart}
								onColumnDragOver={onColumnDragOver}
								onColumnDrop={onColumnDrop}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
});
