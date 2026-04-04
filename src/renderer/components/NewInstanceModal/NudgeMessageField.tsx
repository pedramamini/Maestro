import React from 'react';
import type { NudgeMessageFieldProps } from './types';
import { NUDGE_MESSAGE_MAX_LENGTH } from './types';

export const NudgeMessageField = React.memo(function NudgeMessageField({
	theme,
	value,
	onChange,
	maxLength = NUDGE_MESSAGE_MAX_LENGTH,
}: NudgeMessageFieldProps) {
	return (
		<div>
			<div
				className="block text-xs font-bold opacity-70 uppercase mb-2"
				style={{ color: theme.colors.textMain }}
			>
				Nudge Message <span className="font-normal opacity-50">(optional)</span>
			</div>
			<textarea
				value={value}
				onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
				placeholder="Instructions appended to every message you send..."
				className="w-full p-2 rounded border bg-transparent outline-none resize-none text-sm"
				style={{
					borderColor: theme.colors.border,
					color: theme.colors.textMain,
					minHeight: '80px',
				}}
				maxLength={maxLength}
			/>
			<p className="mt-1 text-xs" style={{ color: theme.colors.textDim }}>
				{value.length}/{maxLength} characters. This text is added to every message you send to the
				agent (not visible in chat).
			</p>
		</div>
	);
});
