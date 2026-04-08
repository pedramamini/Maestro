import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
	type CueConfig,
	type CueGitHubState,
	type CueScheduleDay,
	type CueSettings,
	type CueSubscription,
	CUE_GITHUB_STATES,
	CUE_SCHEDULE_DAYS,
	DEFAULT_CUE_SETTINGS,
} from '../../../shared/cue';

export interface PromptSpec {
	inline?: string;
	file?: string;
}

export interface CueSubscriptionDocument extends CueSubscription {
	promptSpec: PromptSpec;
	outputPromptSpec?: PromptSpec;
}

export interface CueConfigDocument {
	subscriptions: CueSubscriptionDocument[];
	settings: CueSettings;
}

function readPromptFile(projectRoot: string, promptFile: string): string | undefined {
	const resolvedPromptPath = path.isAbsolute(promptFile)
		? promptFile
		: path.join(projectRoot, promptFile);
	try {
		return fs.readFileSync(resolvedPromptPath, 'utf-8');
	} catch {
		return undefined;
	}
}

function normalizeFilter(
	filterValue: unknown
): Record<string, string | number | boolean> | undefined {
	if (!filterValue || typeof filterValue !== 'object' || Array.isArray(filterValue)) {
		return undefined;
	}

	const filterObj: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(filterValue as Record<string, unknown>)) {
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			filterObj[key] = value;
			continue;
		}
		return undefined;
	}

	return filterObj;
}

function normalizeSubscription(
	sub: Record<string, unknown>,
	projectRoot: string
): CueSubscriptionDocument {
	const promptSpec: PromptSpec = {
		inline: typeof sub.prompt === 'string' ? sub.prompt : undefined,
		file: typeof sub.prompt_file === 'string' ? sub.prompt_file : undefined,
	};

	const outputPromptSpec: PromptSpec | undefined =
		typeof sub.output_prompt === 'string' || typeof sub.output_prompt_file === 'string'
			? {
					inline: typeof sub.output_prompt === 'string' ? sub.output_prompt : undefined,
					file: typeof sub.output_prompt_file === 'string' ? sub.output_prompt_file : undefined,
				}
			: undefined;

	const prompt =
		promptSpec.inline ??
		(promptSpec.file ? (readPromptFile(projectRoot, promptSpec.file) ?? '') : '');
	const outputPrompt =
		outputPromptSpec?.inline ??
		(outputPromptSpec?.file ? readPromptFile(projectRoot, outputPromptSpec.file) : undefined);

	return {
		name: String(sub.name ?? ''),
		event: String(sub.event ?? '') as CueSubscription['event'],
		enabled: sub.enabled !== false,
		promptSpec,
		outputPromptSpec,
		prompt,
		prompt_file: promptSpec.file,
		output_prompt: outputPrompt,
		output_prompt_file: outputPromptSpec?.file,
		interval_minutes: typeof sub.interval_minutes === 'number' ? sub.interval_minutes : undefined,
		schedule_times:
			Array.isArray(sub.schedule_times) &&
			sub.schedule_times.every((value: unknown) => typeof value === 'string')
				? (sub.schedule_times as string[])
				: undefined,
		schedule_days:
			Array.isArray(sub.schedule_days) &&
			sub.schedule_days.every(
				(value: unknown) =>
					typeof value === 'string' && CUE_SCHEDULE_DAYS.includes(value as CueScheduleDay)
			)
				? (sub.schedule_days as CueScheduleDay[])
				: undefined,
		watch: typeof sub.watch === 'string' ? sub.watch : undefined,
		source_session:
			typeof sub.source_session === 'string' || Array.isArray(sub.source_session)
				? (sub.source_session as string | string[])
				: undefined,
		fan_out: Array.isArray(sub.fan_out) ? sub.fan_out : undefined,
		fan_out_prompts:
			Array.isArray(sub.fan_out_prompts) &&
			sub.fan_out_prompts.every((value: unknown) => typeof value === 'string')
				? (sub.fan_out_prompts as string[])
				: undefined,
		filter: normalizeFilter(sub.filter),
		repo: typeof sub.repo === 'string' ? sub.repo : undefined,
		poll_minutes: typeof sub.poll_minutes === 'number' ? sub.poll_minutes : undefined,
		gh_state:
			typeof sub.gh_state === 'string' && CUE_GITHUB_STATES.includes(sub.gh_state as CueGitHubState)
				? (sub.gh_state as CueGitHubState)
				: undefined,
		agent_id: typeof sub.agent_id === 'string' ? sub.agent_id : undefined,
		label: typeof sub.label === 'string' ? sub.label : undefined,
		fan_in_timeout_minutes:
			typeof sub.fan_in_timeout_minutes === 'number' ? sub.fan_in_timeout_minutes : undefined,
		fan_in_timeout_on_fail:
			sub.fan_in_timeout_on_fail === 'break' || sub.fan_in_timeout_on_fail === 'continue'
				? sub.fan_in_timeout_on_fail
				: undefined,
	};
}

function normalizeSettings(rawSettings: Record<string, unknown> | undefined): CueSettings {
	return {
		timeout_minutes:
			typeof rawSettings?.timeout_minutes === 'number'
				? rawSettings.timeout_minutes
				: DEFAULT_CUE_SETTINGS.timeout_minutes,
		timeout_on_fail:
			rawSettings?.timeout_on_fail === 'break' || rawSettings?.timeout_on_fail === 'continue'
				? rawSettings.timeout_on_fail
				: DEFAULT_CUE_SETTINGS.timeout_on_fail,
		max_concurrent:
			typeof rawSettings?.max_concurrent === 'number'
				? rawSettings.max_concurrent
				: DEFAULT_CUE_SETTINGS.max_concurrent,
		queue_size:
			typeof rawSettings?.queue_size === 'number'
				? rawSettings.queue_size
				: DEFAULT_CUE_SETTINGS.queue_size,
	};
}

export function parseCueConfigDocument(raw: string, projectRoot: string): CueConfigDocument | null {
	const parsed = yaml.load(raw) as Record<string, unknown> | null;
	if (!parsed || typeof parsed !== 'object') {
		return null;
	}

	const subscriptions: CueSubscriptionDocument[] = [];
	const rawSubscriptions = parsed.subscriptions;
	if (Array.isArray(rawSubscriptions)) {
		for (const sub of rawSubscriptions) {
			if (sub && typeof sub === 'object') {
				subscriptions.push(normalizeSubscription(sub as Record<string, unknown>, projectRoot));
			}
		}
	}

	return {
		subscriptions,
		settings: normalizeSettings(parsed.settings as Record<string, unknown> | undefined),
	};
}

export function materializeCueConfig(document: CueConfigDocument): CueConfig {
	return {
		subscriptions: document.subscriptions.map(
			({ promptSpec: _promptSpec, outputPromptSpec: _outputPromptSpec, ...subscription }) =>
				subscription as CueSubscription
		),
		settings: document.settings,
	};
}
