import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
	PipelineContextMenu,
	type PipelineContextMenuProps,
	type ContextMenuState,
} from '../../../../renderer/components/CuePipelineEditor/PipelineContextMenu';

describe('PipelineContextMenu', () => {
	const defaultContextMenu: ContextMenuState = {
		x: 200,
		y: 150,
		nodeId: 'node-1',
		pipelineId: 'pipeline-1',
		nodeType: 'trigger',
	};

	let onConfigure: ReturnType<typeof vi.fn>;
	let onDelete: ReturnType<typeof vi.fn>;
	let onDuplicate: ReturnType<typeof vi.fn>;

	function renderMenu(overrides: Partial<PipelineContextMenuProps> = {}) {
		const props: PipelineContextMenuProps = {
			contextMenu: defaultContextMenu,
			onConfigure,
			onDelete,
			onDuplicate,
			...overrides,
		};
		return render(<PipelineContextMenu {...props} />);
	}

	beforeEach(() => {
		onConfigure = vi.fn();
		onDelete = vi.fn();
		onDuplicate = vi.fn();
	});

	it('renders at the correct position from contextMenu x/y', () => {
		const { container } = renderMenu({
			contextMenu: { ...defaultContextMenu, x: 300, y: 400 },
		});
		const outer = container.firstElementChild as HTMLElement;
		expect(outer.style.left).toBe('300px');
		expect(outer.style.top).toBe('400px');
	});

	it('shows a Configure button', () => {
		renderMenu();
		expect(screen.getByText('Configure')).toBeInTheDocument();
	});

	it('calls onConfigure when Configure is clicked', () => {
		renderMenu();
		fireEvent.click(screen.getByText('Configure'));
		expect(onConfigure).toHaveBeenCalledTimes(1);
	});

	it('shows Duplicate button for trigger nodeType', () => {
		renderMenu({
			contextMenu: { ...defaultContextMenu, nodeType: 'trigger' },
		});
		expect(screen.getByText('Duplicate')).toBeInTheDocument();
	});

	it('does NOT show Duplicate button for agent nodeType', () => {
		renderMenu({
			contextMenu: { ...defaultContextMenu, nodeType: 'agent' },
		});
		expect(screen.queryByText('Duplicate')).not.toBeInTheDocument();
	});

	it('calls onDuplicate when Duplicate is clicked', () => {
		renderMenu({
			contextMenu: { ...defaultContextMenu, nodeType: 'trigger' },
		});
		fireEvent.click(screen.getByText('Duplicate'));
		expect(onDuplicate).toHaveBeenCalledTimes(1);
	});

	it('shows Delete button with red color', () => {
		renderMenu();
		const deleteBtn = screen.getByText('Delete');
		expect(deleteBtn).toBeInTheDocument();
		expect(deleteBtn.style.color).toBe('rgb(239, 68, 68)');
	});

	it('calls onDelete when Delete is clicked', () => {
		renderMenu();
		fireEvent.click(screen.getByText('Delete'));
		expect(onDelete).toHaveBeenCalledTimes(1);
	});
});
