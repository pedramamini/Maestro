import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../utils/logger';

/**
 * Parse a data URL and extract base64 data and media type
 */
export function parseDataUrl(dataUrl: string): { base64: string; mediaType: string } | null {
	const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
	if (!match) return null;
	return {
		mediaType: match[1],
		base64: match[2],
	};
}

/**
 * Save a base64 data URL image to a temp file.
 * Returns the full path to the temp file, or null on failure.
 */
export async function saveImageToTempFile(dataUrl: string, index: number): Promise<string | null> {
	const parsed = parseDataUrl(dataUrl);
	if (!parsed) {
		logger.warn('[ProcessManager] Failed to parse data URL for temp file', 'ProcessManager');
		return null;
	}

	const ext = parsed.mediaType.split('/')[1] || 'png';
	const filename = `maestro-image-${Date.now()}-${index}.${ext}`;
	const tempPath = path.join(os.tmpdir(), filename);

	try {
		const buffer = Buffer.from(parsed.base64, 'base64');
		await fsPromises.writeFile(tempPath, buffer);
		logger.debug('[ProcessManager] Saved image to temp file', 'ProcessManager', {
			tempPath,
			size: buffer.length,
		});
		return tempPath;
	} catch (error) {
		logger.error('[ProcessManager] Failed to save image to temp file', 'ProcessManager', {
			error: String(error),
		});
		return null;
	}
}

/**
 * Build a prompt prefix string listing attached image file paths.
 * Returns an empty string if no paths are provided.
 */
export function buildImagePromptPrefix(imagePaths: string[]): string {
	if (imagePaths.length === 0) return '';
	return `[Attached images: ${imagePaths.join(', ')}]\n\n`;
}

/**
 * Clean up temp image files asynchronously.
 * Fire-and-forget to avoid blocking the main thread.
 */
export function cleanupTempFiles(files: string[]): void {
	for (const file of files) {
		fsPromises
			.unlink(file)
			.then(() => {
				logger.debug('[ProcessManager] Cleaned up temp file', 'ProcessManager', { file });
			})
			.catch((error) => {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
					logger.warn('[ProcessManager] Failed to clean up temp file', 'ProcessManager', {
						file,
						error: String(error),
					});
				}
			});
	}
}
