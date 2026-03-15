/**
 * Build a continuation prompt that combines partial agent output with a user's
 * mid-turn interjection. Used when an agent doesn't support native stdin
 * injection and must be interrupted and restarted.
 */
export function buildContinuationPrompt(
	partialOutput: string,
	userInterjection: string
): string {
	const trimmedOutput = partialOutput.trim();
	const parts: string[] = [];

	parts.push('[System context: The user interjected during your previous response.');
	if (trimmedOutput) {
		parts.push('Here is what you had produced so far:]');
		parts.push('');
		parts.push('<partial_output>');
		parts.push(trimmedOutput);
		parts.push('</partial_output>');
	} else {
		parts.push('You had not yet produced any output.]');
	}

	parts.push('');
	parts.push("[The user's interjection:]");
	parts.push(userInterjection);
	parts.push('');
	parts.push('[Continue from where you left off, incorporating the user\'s guidance.]');

	return parts.join('\n');
}
