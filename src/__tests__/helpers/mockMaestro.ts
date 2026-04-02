import { vi } from 'vitest';

/**
 * Reset all window.maestro mocks to defaults.
 * Call in beforeEach/afterEach when test needs clean slate.
 *
 * This resets all vi.fn() mocks on window.maestro namespaces
 * back to their default mock implementations from setup.ts.
 */
export function resetMaestroMocks(): void {
	if (typeof window === 'undefined' || !window.maestro) return;

	Object.values(window.maestro).forEach((namespace) => {
		if (typeof namespace === 'object' && namespace !== null) {
			Object.values(namespace).forEach((fn) => {
				if (typeof fn === 'function' && 'mockReset' in fn) {
					(fn as ReturnType<typeof vi.fn>).mockReset();
				}
			});
		}
	});
}

/**
 * Override specific maestro mocks for a test.
 * Use instead of redefining the entire namespace.
 *
 * @example
 * mockMaestroNamespace('settings', { get: vi.fn().mockResolvedValue('custom') });
 * mockMaestroNamespace('git', { isRepo: vi.fn().mockResolvedValue(false) });
 */
export function mockMaestroNamespace(
	namespace: keyof typeof window.maestro,
	overrides: Record<string, unknown>,
): void {
	const target = window.maestro[namespace];
	if (typeof target === 'object' && target !== null) {
		Object.assign(target, overrides);
	}
}
