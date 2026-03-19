import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriggerNode } from '../../../../../renderer/components/CuePipelineEditor/nodes/TriggerNode';
import { ReactFlowProvider } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { TriggerNodeDataProps } from '../../../../../renderer/components/CuePipelineEditor/nodes/TriggerNode';

const defaultData: TriggerNodeDataProps = {
	compositeId: 'pipeline-1:trigger-0',
	eventType: 'time.heartbeat',
	label: 'Heartbeat',
	configSummary: 'every 5min',
};

function renderTriggerNode(overrides: Partial<TriggerNodeDataProps> = {}, selected = false) {
	const data = { ...defaultData, ...overrides };
	const props = {
		id: 'test-trigger',
		data,
		type: 'trigger',
		selected,
		isConnectable: true,
		xPos: 0,
		yPos: 0,
		zIndex: 0,
		dragging: false,
	} as NodeProps<TriggerNodeDataProps>;

	return render(
		<ReactFlowProvider>
			<TriggerNode {...props} />
		</ReactFlowProvider>
	);
}

describe('TriggerNode', () => {
	it('should render label and config summary', () => {
		renderTriggerNode();

		expect(screen.getByText('Heartbeat')).toBeInTheDocument();
		expect(screen.getByText('every 5min')).toBeInTheDocument();
	});

	it('should render a drag handle', () => {
		const { container } = renderTriggerNode();
		const dragHandle = container.querySelector('.drag-handle');
		expect(dragHandle).not.toBeNull();
	});

	it('should render a gear icon for configuration', () => {
		const { container } = renderTriggerNode();
		const gearButton = container.querySelector('[title="Configure"]');
		expect(gearButton).not.toBeNull();
	});

	it('should show title tooltip on the label span', () => {
		renderTriggerNode({ label: 'My Custom Label' });

		const labelSpan = screen.getByText('My Custom Label');
		expect(labelSpan).toHaveAttribute('title', 'My Custom Label');
	});

	it('should show title tooltip on the config summary span', () => {
		renderTriggerNode({ configSummary: 'every 10min' });

		const summarySpan = screen.getByText('every 10min');
		expect(summarySpan).toHaveAttribute('title', 'every 10min');
	});

	it('should show tooltip with full text for long labels', () => {
		const longLabel = 'This is a very long trigger label that will be truncated';
		renderTriggerNode({ label: longLabel });

		const labelSpan = screen.getByText(longLabel);
		expect(labelSpan).toHaveAttribute('title', longLabel);
	});

	it('should show tooltip with full text for long config summaries', () => {
		const longSummary = 'Mon, Tue, Wed, Thu, Fri at 09:00, 12:00, 15:00, 18:00';
		renderTriggerNode({ configSummary: longSummary });

		const summarySpan = screen.getByText(longSummary);
		expect(summarySpan).toHaveAttribute('title', longSummary);
	});

	it('should use minWidth and maxWidth instead of fixed width', () => {
		const { container } = renderTriggerNode();

		const rootDiv = container.querySelector('div[style*="min-width: 220px"]') as HTMLElement;
		expect(rootDiv).not.toBeNull();
		expect(rootDiv.style.maxWidth).toBe('320px');
		// Ensure no fixed width is set
		expect(rootDiv.style.width).toBe('');
	});

	it('should not render config summary when empty', () => {
		renderTriggerNode({ configSummary: '' });

		// The summary span should not be in the DOM
		expect(screen.queryByText('every 5min')).not.toBeInTheDocument();
	});

	it('should call onConfigure when gear icon is clicked', () => {
		const onConfigure = vi.fn();
		const { container } = renderTriggerNode({
			onConfigure,
			compositeId: 'pipeline-1:trigger-0',
		});

		const gearButton = container.querySelector('[title="Configure"]') as HTMLElement;
		gearButton.click();

		expect(onConfigure).toHaveBeenCalledWith('pipeline-1:trigger-0');
	});

	it('should apply selection styling when selected', () => {
		const { container: selectedContainer } = renderTriggerNode({}, true);
		const { container: unselectedContainer } = renderTriggerNode({}, false);

		const selectedRoot = selectedContainer.querySelector(
			'div[style*="min-width: 220px"]'
		) as HTMLElement;
		const unselectedRoot = unselectedContainer.querySelector(
			'div[style*="min-width: 220px"]'
		) as HTMLElement;

		// Selected and unselected should have different border colors
		expect(selectedRoot.style.borderColor).not.toBe(unselectedRoot.style.borderColor);
		// Selected should have a box shadow, unselected should not
		expect(selectedRoot.style.boxShadow).toBeTruthy();
		expect(unselectedRoot.style.boxShadow).toBeFalsy();
	});

	it('should use correct color for each event type', () => {
		const eventColors: Record<string, string> = {
			'time.heartbeat': '#f59e0b',
			'time.scheduled': '#8b5cf6',
			'file.changed': '#3b82f6',
			'agent.completed': '#22c55e',
			'github.pull_request': '#a855f7',
			'github.issue': '#f97316',
			'task.pending': '#06b6d4',
		};

		for (const [eventType, expectedColor] of Object.entries(eventColors)) {
			const { unmount } = renderTriggerNode({
				eventType: eventType as TriggerNodeDataProps['eventType'],
				label: eventType,
			});

			const labelSpan = screen.getByText(eventType);
			expect(labelSpan).toHaveStyle({ color: expectedColor });

			unmount();
		}
	});
});
