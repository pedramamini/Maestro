import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Terminal, GripVertical, Settings } from 'lucide-react';
import type { Theme } from '../../../types';

export interface CliOutputNodeDataProps {
	compositeId: string;
	target: string;
	pipelineColor: string;
	pipelineCount: number;
	pipelineColors: string[];
	onConfigure?: (compositeId: string) => void;
	theme?: Theme;
}

export const CliOutputNode = memo(function CliOutputNode({
	data,
	selected,
}: NodeProps<CliOutputNodeDataProps>) {
	const theme = data.theme;
	const accentColor = data.pipelineColor;

	return (
		<div
			style={{
				minWidth: 160,
				maxWidth: 280,
				height: 64,
				borderRadius: 8,
				willChange: 'transform',
				backgroundColor: theme?.colors.bgMain ?? '#1e1e2e',
				border: `2px solid ${selected ? accentColor : (theme?.colors.border ?? '#333')}`,
				boxShadow: selected ? `0 4px 16px ${accentColor}30` : '0 2px 8px rgba(0,0,0,0.3)',
				animation: selected ? 'pipeline-node-pulse 2s ease-in-out infinite' : undefined,
				['--node-color-40' as string]: `${accentColor}40`,
				['--node-color-60' as string]: `${accentColor}60`,
				['--node-color-30' as string]: `${accentColor}30`,
				display: 'flex',
				flexDirection: 'row',
				overflow: 'visible',
				cursor: 'default',
				transition: 'border-color 0.15s, box-shadow 0.15s',
				position: 'relative',
				opacity: 0.9,
			}}
		>
			{/* Drag handle */}
			<div
				className="drag-handle"
				style={{
					width: 28,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					cursor: 'grab',
					color: theme?.colors.textDim ?? '#555',
					flexShrink: 0,
					backgroundColor: `${accentColor}80`,
					borderRadius: '6px 0 0 6px',
					transition: 'color 0.15s, filter 0.15s',
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.color = theme?.colors.accentForeground ?? '#fff';
					e.currentTarget.style.filter = 'brightness(1.3)';
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.color = theme?.colors.textDim ?? '#555';
					e.currentTarget.style.filter = 'brightness(1)';
				}}
				title="Drag to move"
			>
				<GripVertical size={14} />
			</div>

			{/* Content */}
			<div
				style={{
					flex: 1,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					padding: '6px 10px',
					overflow: 'hidden',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
					<Terminal
						size={13}
						style={{ color: theme?.colors.textDim ?? '#9ca3af', flexShrink: 0 }}
					/>
					<span
						style={{
							color: theme?.colors.textMain ?? '#e4e4e7',
							fontSize: 12,
							fontWeight: 600,
							whiteSpace: 'nowrap',
						}}
					>
						CLI Output
					</span>
				</div>
				<span
					style={{
						color: theme?.colors.textDim ?? '#6b7280',
						fontSize: 10,
						marginTop: 2,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{data.target || 'No target'}
				</span>
			</div>

			{/* Gear icon */}
			<div
				onClick={(e) => {
					e.stopPropagation();
					data.onConfigure?.(data.compositeId);
				}}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					cursor: 'pointer',
					color: selected ? accentColor : (theme?.colors.textDim ?? '#555'),
					flexShrink: 0,
					padding: '0 6px',
					marginRight: 10,
					borderRadius: 4,
					transition: 'color 0.15s',
				}}
				onMouseEnter={(e) => (e.currentTarget.style.color = accentColor)}
				onMouseLeave={(e) =>
					(e.currentTarget.style.color = selected ? accentColor : (theme?.colors.textDim ?? '#555'))
				}
				title="Configure"
			>
				<Settings size={13} />
			</div>

			<Handle
				type="target"
				position={Position.Left}
				style={{
					backgroundColor: accentColor,
					border: `3px solid ${theme?.colors.bgMain ?? '#1e1e2e'}`,
					boxShadow: `0 0 0 2px ${accentColor}`,
					width: 14,
					height: 14,
					zIndex: 10,
					left: -7,
				}}
			/>
		</div>
	);
});
