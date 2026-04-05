import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../cli/output/formatter', () => ({
	formatError: vi.fn((message: string) => `Error: ${message}`),
}));

import { listTemplates } from '../../../cli/commands/list-templates';

describe('list-templates command', () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	it('prints the available templates in human-readable format', () => {
		listTemplates({});

		expect(consoleLogSpy).toHaveBeenNthCalledWith(1, 'Available templates:');
		expect(consoleLogSpy).toHaveBeenNthCalledWith(
			2,
			'- agi-way: Goal-driven execution with a single outcome per checkbox.'
		);
	});

	it('prints templates as JSON when requested', () => {
		listTemplates({ json: true });

		expect(consoleLogSpy).toHaveBeenCalledTimes(1);
		const parsed = JSON.parse(String(consoleLogSpy.mock.calls[0][0]));
		expect(parsed).toEqual([
			{
				name: 'agi-way',
				description: 'Goal-driven execution with a single outcome per checkbox.',
			},
		]);
	});
});
