import path from 'path';
import { createHash } from 'crypto';
import type { AiWikiChangedFile, AiWikiProjectRequest } from '../../shared/ai-wiki-types';

const GENERATED_VENDOR_SEGMENTS = new Set([
	'.cache',
	'.git',
	'.next',
	'.nuxt',
	'.svelte-kit',
	'.turbo',
	'.vite',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'out',
	'release',
	'target',
	'vendor',
]);

export function sanitizeAiWikiProjectId(projectId: string): string {
	const trimmed = projectId.trim();
	const sanitized = trimmed
		.replace(/[/\\:]+/g, '-')
		.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120);

	if (!sanitized || sanitized === '.' || sanitized === '..') {
		return 'project';
	}

	return sanitized;
}

export function resolveAiWikiProjectId(request: AiWikiProjectRequest): string {
	if (request.projectId?.trim()) {
		return sanitizeAiWikiProjectId(request.projectId);
	}

	const normalizedRoot = normalizeAiWikiProjectRoot(request.projectRoot);
	const basename = path.basename(normalizedRoot) || 'project';
	const hostPrefix = request.sshRemoteId ? `${request.sshRemoteId}-` : '';
	const identityHash = createHash('sha1')
		.update(`${request.sshRemoteId ?? 'local'}:${normalizedRoot}`)
		.digest('hex')
		.slice(0, 10);
	return sanitizeAiWikiProjectId(`${hostPrefix}${basename}-${identityHash}`);
}

export function resolveAiWikiPath(userDataPath: string, projectId: string): string {
	return path.join(userDataPath, 'project-wikis', sanitizeAiWikiProjectId(projectId));
}

export function normalizeAiWikiProjectRoot(projectRoot: string): string {
	const resolved = path.resolve(projectRoot).replace(/[\\/]+$/g, '');
	if (/^[A-Z]:/.test(resolved)) {
		return resolved[0].toLowerCase() + resolved.slice(1);
	}
	return resolved;
}

export function parseGitNameOnlyOutput(stdout: string): string[] {
	return stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

export function parseGitPorcelainChangedFiles(stdout: string): string[] {
	return stdout
		.split(/\r?\n/)
		.map((line) => {
			if (line.length < 4) return '';
			const rawPath = line.slice(3);
			const renameParts = rawPath.split(' -> ');
			return renameParts[renameParts.length - 1] || rawPath;
		})
		.map((line) => line.trim())
		.filter(Boolean);
}

export function shouldIgnoreAiWikiSourcePath(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
	const segments = normalized.split('/').filter(Boolean);
	return segments.some((segment) => GENERATED_VENDOR_SEGMENTS.has(segment));
}

export function mergeAiWikiChangedFiles(
	trackedPaths: string[],
	uncommittedPaths: string[]
): AiWikiChangedFile[] {
	const changes = new Map<string, AiWikiChangedFile>();

	for (const filePath of trackedPaths) {
		if (!filePath || shouldIgnoreAiWikiSourcePath(filePath)) continue;
		changes.set(filePath, { path: filePath, source: 'tracked' });
	}

	for (const filePath of uncommittedPaths) {
		if (!filePath || shouldIgnoreAiWikiSourcePath(filePath)) continue;
		changes.set(filePath, { path: filePath, source: 'uncommitted' });
	}

	return Array.from(changes.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export function getAiWikiFileExtension(filePath: string): string {
	const basename = path.posix.basename(filePath.replace(/\\/g, '/'));
	if (!basename || (basename.startsWith('.') && basename.indexOf('.', 1) === -1)) {
		return '[none]';
	}

	const extension = path.posix.extname(basename).toLowerCase();
	return extension || '[none]';
}

export function getAiWikiTopDirectory(filePath: string): string {
	const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
	const segments = normalized.split('/').filter(Boolean);
	if (segments.length <= 1) return '[root]';
	const [firstSegment] = segments;
	return firstSegment ?? '[root]';
}

export function countAiWikiPathsByExtension(filePaths: string[]): Array<[string, number]> {
	return countSorted(filePaths.map(getAiWikiFileExtension));
}

export function countAiWikiPathsByTopDirectory(filePaths: string[]): Array<[string, number]> {
	return countSorted(filePaths.map(getAiWikiTopDirectory));
}

function countSorted(values: string[]): Array<[string, number]> {
	const counts = new Map<string, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}

	return Array.from(counts.entries()).sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1];
		return a[0].localeCompare(b[0]);
	});
}
