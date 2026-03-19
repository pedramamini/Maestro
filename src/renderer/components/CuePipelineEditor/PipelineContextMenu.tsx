/**
 * PipelineContextMenu — Right-click context menu for pipeline nodes.
 *
 * Purely presentational: renders Configure, Duplicate (triggers only), and Delete actions.
 */

import React, { useRef, useEffect } from 'react';

export interface ContextMenuState {
	x: number;
	y: number;
	nodeId: string;
	pipelineId: string;
	nodeType: 'trigger' | 'agent';
}

export interface PipelineContextMenuProps {
	contextMenu: ContextMenuState;
	onConfigure: () => void;
	onDelete: () => void;
	onDuplicate: () => void;
}

const menuItemStyle: React.CSSProperties = {
	display: 'block',
	width: '100%',
	textAlign: 'left',
	padding: '6px 12px',
	fontSize: 12,
	color: '#e4e4e7',
	backgroundColor: 'transparent',
	border: 'none',
	cursor: 'pointer',
};

export const PipelineContextMenu = React.memo(function PipelineContextMenu({
	contextMenu,
	onConfigure,
	onDelete,
	onDuplicate,
}: PipelineContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	// Auto-focus on mount so keyboard users can reach the menu actions
	useEffect(() => {
		menuRef.current?.focus();
	}, []);

	return (
		<div
			ref={menuRef}
			className="fixed outline-none"
			tabIndex={-1}
			style={{
				left: contextMenu.x,
				top: contextMenu.y,
				zIndex: 50,
			}}
		>
			<div
				style={{
					backgroundColor: '#1e1e2e',
					border: '1px solid #444',
					borderRadius: 6,
					boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
					padding: '4px 0',
					minWidth: 140,
				}}
			>
				<button
					onClick={onConfigure}
					style={menuItemStyle}
					onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a3e')}
					onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
				>
					Configure
				</button>
				{contextMenu.nodeType === 'trigger' && (
					<button
						onClick={onDuplicate}
						style={menuItemStyle}
						onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a3e')}
						onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
					>
						Duplicate
					</button>
				)}
				<div
					style={{
						height: 1,
						backgroundColor: '#333',
						margin: '4px 0',
					}}
				/>
				<button
					onClick={onDelete}
					style={{ ...menuItemStyle, color: '#ef4444' }}
					onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a3e')}
					onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
				>
					Delete
				</button>
			</div>
		</div>
	);
});
