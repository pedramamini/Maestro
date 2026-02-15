/**
 * Tests for useFilteredAndSortedSessions hook
 *
 * Validates filtering, sorting, and search result lookup functionality
 * including the O(1) Map-based getSearchResultInfo optimization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
	useFilteredAndSortedSessions,
	type SearchResult,
	type UseFilteredAndSortedSessionsDeps,
} from '../../../renderer/hooks/agent/useFilteredAndSortedSessions';
import type { ClaudeSession } from '../../../renderer/hooks/agent/useSessionViewer';

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
	return {
		sessionId: overrides.sessionId ?? `session-${Math.random().toString(36).slice(2, 10)}`,
		projectPath: '/test/project',
		timestamp: '2025-01-01T00:00:00Z',
		modifiedAt: overrides.modifiedAt ?? '2025-01-01T00:00:00Z',
		firstMessage: overrides.firstMessage ?? 'Hello',
		messageCount: 1,
		sizeBytes: 100,
		inputTokens: 10,
		outputTokens: 20,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
		durationSeconds: 5,
		sessionName: overrides.sessionName,
		origin: overrides.origin,
	};
}

function defaultDeps(overrides: Partial<UseFilteredAndSortedSessionsDeps> = {}): UseFilteredAndSortedSessionsDeps {
	return {
		sessions: overrides.sessions ?? [],
		search: overrides.search ?? '',
		searchMode: overrides.searchMode ?? 'title',
		searchResults: overrides.searchResults ?? [],
		isSearching: overrides.isSearching ?? false,
		starredSessions: overrides.starredSessions ?? new Set<string>(),
		showAllSessions: overrides.showAllSessions ?? true,
		namedOnly: overrides.namedOnly ?? false,
	};
}

describe('useFilteredAndSortedSessions', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe('getSearchResultInfo', () => {
		it('should return search result for a matching sessionId', () => {
			const searchResults: SearchResult[] = [
				{ sessionId: 'abc-123', matchType: 'user', matchPreview: 'test query', matchCount: 3 },
				{ sessionId: 'def-456', matchType: 'assistant', matchPreview: 'response', matchCount: 1 },
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ searchResults }))
			);

			const info = result.current.getSearchResultInfo('abc-123');
			expect(info).toBeDefined();
			expect(info!.sessionId).toBe('abc-123');
			expect(info!.matchType).toBe('user');
			expect(info!.matchPreview).toBe('test query');
			expect(info!.matchCount).toBe(3);
		});

		it('should return undefined for a non-matching sessionId', () => {
			const searchResults: SearchResult[] = [
				{ sessionId: 'abc-123', matchType: 'user', matchPreview: 'test', matchCount: 1 },
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ searchResults }))
			);

			expect(result.current.getSearchResultInfo('nonexistent')).toBeUndefined();
		});

		it('should return undefined when searchResults is empty', () => {
			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ searchResults: [] }))
			);

			expect(result.current.getSearchResultInfo('any-id')).toBeUndefined();
		});

		it('should update when searchResults change', () => {
			const initialResults: SearchResult[] = [
				{ sessionId: 'abc-123', matchType: 'user', matchPreview: 'old', matchCount: 1 },
			];

			const { result, rerender } = renderHook(
				(props: { searchResults: SearchResult[] }) =>
					useFilteredAndSortedSessions(defaultDeps({ searchResults: props.searchResults })),
				{ initialProps: { searchResults: initialResults } }
			);

			expect(result.current.getSearchResultInfo('abc-123')?.matchPreview).toBe('old');

			const updatedResults: SearchResult[] = [
				{ sessionId: 'abc-123', matchType: 'assistant', matchPreview: 'new', matchCount: 5 },
				{ sessionId: 'xyz-789', matchType: 'title', matchPreview: 'added', matchCount: 2 },
			];

			rerender({ searchResults: updatedResults });

			expect(result.current.getSearchResultInfo('abc-123')?.matchPreview).toBe('new');
			expect(result.current.getSearchResultInfo('abc-123')?.matchCount).toBe(5);
			expect(result.current.getSearchResultInfo('xyz-789')).toBeDefined();
		});

		it('should handle many search results efficiently via Map lookup', () => {
			const searchResults: SearchResult[] = Array.from({ length: 1000 }, (_, i) => ({
				sessionId: `session-${i}`,
				matchType: 'user' as const,
				matchPreview: `match ${i}`,
				matchCount: i + 1,
			}));

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ searchResults }))
			);

			// First item
			expect(result.current.getSearchResultInfo('session-0')?.matchCount).toBe(1);
			// Last item
			expect(result.current.getSearchResultInfo('session-999')?.matchCount).toBe(1000);
			// Middle item
			expect(result.current.getSearchResultInfo('session-500')?.matchCount).toBe(501);
			// Non-existent
			expect(result.current.getSearchResultInfo('session-1000')).toBeUndefined();
		});
	});

	describe('isSessionVisible', () => {
		it('should show all sessions when showAllSessions is true', () => {
			const sessions = [
				makeSession({ sessionId: 'agent-test-1' }),
				makeSession({ sessionId: 'uuid-style-session' }),
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ sessions, showAllSessions: true }))
			);

			expect(result.current.filteredSessions).toHaveLength(2);
		});

		it('should hide agent- prefix sessions when showAllSessions is false', () => {
			const sessions = [
				makeSession({ sessionId: 'agent-test-1' }),
				makeSession({ sessionId: 'uuid-style-session' }),
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ sessions, showAllSessions: false }))
			);

			expect(result.current.filteredSessions).toHaveLength(1);
			expect(result.current.filteredSessions[0].sessionId).toBe('uuid-style-session');
		});

		it('should filter to only named sessions when namedOnly is true', () => {
			const sessions = [
				makeSession({ sessionId: 'session-1', sessionName: 'My Session' }),
				makeSession({ sessionId: 'session-2' }),
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ sessions, namedOnly: true }))
			);

			expect(result.current.filteredSessions).toHaveLength(1);
			expect(result.current.filteredSessions[0].sessionId).toBe('session-1');
		});
	});

	describe('filtering by search', () => {
		it('should return all visible sessions when search is empty', () => {
			const sessions = [makeSession(), makeSession(), makeSession()];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ sessions }))
			);

			expect(result.current.filteredSessions).toHaveLength(3);
		});

		it('should filter by firstMessage in title mode', () => {
			const sessions = [
				makeSession({ sessionId: 'a', firstMessage: 'Fix the login bug' }),
				makeSession({ sessionId: 'b', firstMessage: 'Add new feature' }),
				makeSession({ sessionId: 'c', firstMessage: 'Update login page' }),
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ sessions, search: 'login', searchMode: 'title' }))
			);

			expect(result.current.filteredSessions).toHaveLength(2);
			const ids = result.current.filteredSessions.map((s) => s.sessionId);
			expect(ids).toContain('a');
			expect(ids).toContain('c');
		});

		it('should filter by sessionName in title mode', () => {
			const sessions = [
				makeSession({ sessionId: 'a', sessionName: 'My Auth Work' }),
				makeSession({ sessionId: 'b', sessionName: 'Database Stuff' }),
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ sessions, search: 'auth', searchMode: 'title' }))
			);

			expect(result.current.filteredSessions).toHaveLength(1);
			expect(result.current.filteredSessions[0].sessionId).toBe('a');
		});
	});

	describe('sorting', () => {
		it('should sort starred sessions to the top', () => {
			const sessions = [
				makeSession({ sessionId: 'old', modifiedAt: '2025-01-01T00:00:00Z' }),
				makeSession({ sessionId: 'new', modifiedAt: '2025-06-01T00:00:00Z' }),
				makeSession({ sessionId: 'starred-old', modifiedAt: '2024-01-01T00:00:00Z' }),
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(
					defaultDeps({ sessions, starredSessions: new Set(['starred-old']) })
				)
			);

			expect(result.current.filteredSessions[0].sessionId).toBe('starred-old');
		});

		it('should sort by most recent within same starred status', () => {
			const sessions = [
				makeSession({ sessionId: 'old', modifiedAt: '2025-01-01T00:00:00Z' }),
				makeSession({ sessionId: 'newest', modifiedAt: '2025-06-01T00:00:00Z' }),
				makeSession({ sessionId: 'middle', modifiedAt: '2025-03-01T00:00:00Z' }),
			];

			const { result } = renderHook(() =>
				useFilteredAndSortedSessions(defaultDeps({ sessions }))
			);

			expect(result.current.filteredSessions[0].sessionId).toBe('newest');
			expect(result.current.filteredSessions[1].sessionId).toBe('middle');
			expect(result.current.filteredSessions[2].sessionId).toBe('old');
		});
	});
});
