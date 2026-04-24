/**
 * useIsMobile hook for Maestro web interface
 *
 * Thin wrapper around `useBreakpoint()` retained for backward compatibility.
 * Returns `true` when the viewport is at the phone tier (width <
 * `BREAKPOINTS.tablet`, i.e. 600px). Tier boundaries live in
 * `src/web/mobile/constants.ts` and are shared with `useBreakpoint()` and the
 * `--bp-*` CSS custom properties in `src/web/index.css`.
 *
 * @deprecated Prefer `useBreakpoint()` for new code — it exposes the full
 * tier (phone / tablet / desktop), viewport dimensions, and a short-viewport
 * flag rather than collapsing everything to a single boolean.
 */

import { useBreakpoint } from './useBreakpoint';

/**
 * Returns `true` when the viewport tier is `'phone'`.
 *
 * @param _breakpoint - Ignored. Retained so the original signature
 *   (`useIsMobile(breakpoint?: number)`) still type-checks at every call
 *   site. Tier boundaries are now centralized in `BREAKPOINTS`
 *   (`src/web/mobile/constants.ts`); pass-through custom thresholds are no
 *   longer supported.
 */
export function useIsMobile(_breakpoint?: number): boolean {
	const { isPhone } = useBreakpoint();
	return isPhone;
}
