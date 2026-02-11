/**
 * Types for Granola meeting transcript integration.
 *
 * Reads from Granola's local cache at ~/Library/Application Support/Granola/cache-v3.json
 * instead of hitting the API. The cache is maintained by the Granola desktop app.
 */

export interface GranolaDocument {
	id: string;
	title: string;
	createdAt: number; // epoch ms, parsed from cache's created_at
	participants: string[]; // extracted from cache's people array
	hasTranscript: boolean; // whether transcript segments exist in cache
}

export interface GranolaTranscript {
	documentId: string;
	plainText: string; // joined transcript segments
}

export type GranolaResult<T> =
	| { success: true; data: T; cacheAge?: number }
	| { success: false; error: GranolaErrorType };

export type GranolaErrorType = 'not_installed' | 'cache_not_found' | 'cache_parse_error';
