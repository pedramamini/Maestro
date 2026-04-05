const MARKDOWN_EXTENSION = '.md';

export function ensureMarkdownFilename(filename: string): string {
	return filename.toLowerCase().endsWith(MARKDOWN_EXTENSION)
		? filename
		: `${filename}${MARKDOWN_EXTENSION}`;
}

export function stripMarkdownFilename(filename: string): string {
	return filename.toLowerCase().endsWith(MARKDOWN_EXTENSION)
		? filename.slice(0, -MARKDOWN_EXTENSION.length)
		: filename;
}

export function buildMarkdownFilePath(folderPath: string, filename: string): string {
	const normalizedFolderPath = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
	return `${normalizedFolderPath}/${ensureMarkdownFilename(filename)}`;
}
