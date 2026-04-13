/**
 * CliOutputConfigPanel — Configuration panel for CLI Output nodes in the pipeline.
 *
 * Allows configuring the target session ID (or template variable) for
 * routing agent output via `maestro-cli send --live`.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Theme } from '../../../types';
import type { CliOutputNodeData } from '../../../../shared/cue-pipeline-types';
import { useDebouncedCallback } from '../../../hooks/utils';
import { getInputStyle, getLabelStyle } from './triggers/triggerConfigStyles';

interface CliOutputConfigPanelProps {
	nodeId: string;
	data: CliOutputNodeData;
	theme: Theme;
	onUpdateNode: (nodeId: string, data: Partial<CliOutputNodeData>) => void;
	expanded?: boolean;
}

export function CliOutputConfigPanel({
	nodeId,
	data,
	theme,
	onUpdateNode,
}: CliOutputConfigPanelProps) {
	const [target, setTarget] = useState(data.target || '');

	useEffect(() => {
		setTarget(data.target || '');
	}, [data.target]);

	const debouncedSave = useDebouncedCallback(
		(value: string) => {
			onUpdateNode(nodeId, { target: value });
		},
		300,
		[nodeId, onUpdateNode]
	);

	const handleTargetChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setTarget(value);
			debouncedSave(value);
		},
		[debouncedSave]
	);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
			<div>
				<label style={getLabelStyle(theme)}>Target</label>
				<input
					type="text"
					value={target}
					onChange={handleTargetChange}
					placeholder="{{CUE_SOURCE_AGENT_ID}}"
					style={{
						...getInputStyle(theme),
						width: '100%',
						fontFamily: 'monospace',
						fontSize: 12,
					}}
				/>
				<span
					style={{
						display: 'block',
						marginTop: 4,
						fontSize: 11,
						color: theme.colors.textDim,
						lineHeight: 1.4,
					}}
				>
					Session ID to send output to via <code style={{ fontSize: 10 }}>maestro-cli send --live</code>.
					Use <code style={{ fontSize: 10 }}>{'{{CUE_SOURCE_AGENT_ID}}'}</code> for cli.trigger events.
				</span>
			</div>
		</div>
	);
}
