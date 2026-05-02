import { useCallback, useEffect, useMemo, useState } from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import { buildApiUrl } from '../utils/config';
import type { WorkItem, WorkItemStatus } from '../../shared/work-graph-types';

interface MaestroBoardPanelProps {
	projectPath: string | null | undefined;
}

interface BoardResponse {
	items: WorkItem[];
	total: number;
}

const STATUS_ORDER: WorkItemStatus[] = [
	'backlog',
	'discovered',
	'planned',
	'ready',
	'claimed',
	'in_progress',
	'blocked',
	'review',
	'done',
];

const STATUS_LABELS: Record<WorkItemStatus, string> = {
	backlog: 'Backlog',
	discovered: 'Discovered',
	planned: 'Planned',
	ready: 'Ready',
	claimed: 'Claimed',
	in_progress: 'Running',
	blocked: 'Blocked',
	review: 'Review',
	done: 'Done',
	archived: 'Archived',
	canceled: 'Canceled',
};

function statusAccent(status: WorkItemStatus, colors: ReturnType<typeof useThemeColors>): string {
	if (status === 'ready' || status === 'done') return colors.accent;
	if (status === 'blocked') return colors.error;
	if (status === 'claimed' || status === 'in_progress') return colors.warning;
	if (status === 'review') return '#22d3ee';
	return colors.textDim;
}

function formatUpdated(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

export function MaestroBoardPanel({ projectPath }: MaestroBoardPanelProps) {
	const colors = useThemeColors();
	const [items, setItems] = useState<WorkItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadBoard = useCallback(async () => {
		if (!projectPath) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(buildApiUrl('/agent-dispatch/board'));
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			if (!json.success) throw new Error(json.error ?? 'Unable to load Maestro Board');
			const data = json.data as BoardResponse;
			setItems(data.items.filter((item) => item.projectPath === projectPath));
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [projectPath]);

	useEffect(() => {
		void loadBoard();
	}, [loadBoard]);

	const grouped = useMemo(() => {
		const map = new Map<WorkItemStatus, WorkItem[]>();
		for (const status of STATUS_ORDER) map.set(status, []);
		for (const item of items) {
			const bucket = map.get(item.status) ?? [];
			bucket.push(item);
			map.set(item.status, bucket);
		}
		return map;
	}, [items]);

	if (!projectPath) {
		return (
			<div
				style={{ padding: '24px', textAlign: 'center', color: colors.textDim, fontSize: '13px' }}
			>
				Open a project to view Maestro Board.
			</div>
		);
	}

	return (
		<div style={{ padding: '12px' }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: '12px',
				}}
			>
				<div>
					<div
						style={{
							fontSize: '11px',
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.08em',
							color: colors.textDim,
						}}
					>
						Maestro Board
					</div>
					<div style={{ fontSize: '11px', color: colors.textDim }}>
						{items.length} Work Graph items
					</div>
				</div>
				<button
					onClick={() => void loadBoard()}
					style={{
						background: 'none',
						border: `1px solid ${colors.border}`,
						borderRadius: '6px',
						cursor: 'pointer',
						color: colors.textMain,
						fontSize: '12px',
						padding: '5px 8px',
					}}
					aria-label="Refresh Maestro Board"
				>
					Refresh
				</button>
			</div>

			{loading && <p style={{ color: colors.textDim, fontSize: '13px' }}>Loading…</p>}
			{error && (
				<p style={{ color: colors.error, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
			)}
			{!loading && !error && items.length === 0 && (
				<p style={{ color: colors.textDim, fontSize: '13px' }}>
					No Work Graph items for this project yet. Run `/PM-init`, then create tasks from PM or
					Delivery Planner.
				</p>
			)}

			{STATUS_ORDER.map((status) => {
				const bucket = grouped.get(status) ?? [];
				if (bucket.length === 0) return null;
				const accent = statusAccent(status, colors);
				return (
					<section key={status} style={{ marginBottom: '14px' }}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								marginBottom: '6px',
								color: accent,
								fontSize: '11px',
								fontWeight: 700,
								textTransform: 'uppercase',
								letterSpacing: '0.06em',
							}}
						>
							<span>{STATUS_LABELS[status]}</span>
							<span>{bucket.length}</span>
						</div>
						{bucket.map((item) => (
							<article
								key={item.id}
								style={{
									border: `1px solid ${colors.border}`,
									borderLeft: `3px solid ${accent}`,
									borderRadius: '8px',
									backgroundColor: colors.bgSidebar,
									padding: '10px',
									marginBottom: '8px',
								}}
							>
								<div style={{ fontSize: '13px', fontWeight: 650, color: colors.textMain }}>
									{item.title}
								</div>
								<div style={{ fontSize: '10px', color: colors.textDim, marginTop: '4px' }}>
									<span style={{ fontFamily: 'monospace' }}>{item.id}</span>
									<span> · {item.type}</span>
									{item.pipeline?.currentRole && <span> · {item.pipeline.currentRole}</span>}
								</div>
								{item.claim?.owner?.id && (
									<div style={{ fontSize: '10px', color: colors.warning, marginTop: '4px' }}>
										Claimed by {item.claim.owner.name ?? item.claim.owner.id}
									</div>
								)}
								<div style={{ fontSize: '10px', color: colors.textDim, marginTop: '4px' }}>
									Updated {formatUpdated(item.updatedAt)}
								</div>
							</article>
						))}
					</section>
				);
			})}
		</div>
	);
}

export default MaestroBoardPanel;
