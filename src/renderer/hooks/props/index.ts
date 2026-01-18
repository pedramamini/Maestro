/**
 * Props Hooks Module
 *
 * Exports memoized props hooks for major components.
 * These hooks extract and memoize props objects to prevent React from
 * re-evaluating 50-100 props on every state change in MaestroConsoleInner.
 *
 * Key benefits:
 * - Props objects only change when dependencies change
 * - Uses primitive values in dependency arrays for minimal re-computation
 * - Significantly reduces re-render cascade from parent component
 */

export { useMainPanelProps } from './useMainPanelProps';
export type { UseMainPanelPropsDeps } from './useMainPanelProps';

export { useSessionListProps } from './useSessionListProps';
export type { UseSessionListPropsDeps } from './useSessionListProps';

export { useRightPanelProps } from './useRightPanelProps';
export type { UseRightPanelPropsDeps } from './useRightPanelProps';
