// List templates command

import { formatError } from '../output/formatter';

interface ListTemplatesOptions {
	json?: boolean;
}

const templates = [
	{
		name: 'agi-way',
		description: 'Goal-driven execution with a single outcome per checkbox.',
	},
];

export function listTemplates(options: ListTemplatesOptions): void {
	try {
		if (options.json) {
			console.log(JSON.stringify(templates, null, 2));
			return;
		}

		console.log('Available templates:');
		for (const template of templates) {
			console.log(`- ${template.name}: ${template.description}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		if (options.json) {
			console.error(JSON.stringify({ error: message }));
		} else {
			console.error(formatError(`Failed to list templates: ${message}`));
		}
		process.exit(1);
	}
}
