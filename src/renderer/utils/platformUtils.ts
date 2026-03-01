/**
 * Returns the platform-appropriate label for the "reveal in file manager" action.
 *   darwin (and other/unknown) → "Reveal in Finder" (macOS default)
 *   win32               → "Reveal in Explorer" (Windows)
 *   linux               → "Reveal in File Manager" (Linux)
 */
export function getRevealLabel(platform: string): string {
	if (platform === 'win32') return 'Reveal in Explorer';
	if (platform === 'linux') return 'Reveal in File Manager';
	return 'Reveal in Finder';
}
