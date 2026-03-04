import { describe, it, expect, afterEach } from 'vitest';
import { isWindows, isMacOS, isLinux, getWhichCommand } from '../../shared/platformDetection';

describe('platformDetection', () => {
	const originalPlatform = process.platform;

	afterEach(() => {
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
			configurable: true,
		});
	});

	describe('isWindows', () => {
		it('returns true on win32', () => {
			Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
			expect(isWindows()).toBe(true);
		});

		it('returns false on darwin', () => {
			Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
			expect(isWindows()).toBe(false);
		});

		it('returns false on linux', () => {
			Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
			expect(isWindows()).toBe(false);
		});
	});

	describe('isMacOS', () => {
		it('returns true on darwin', () => {
			Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
			expect(isMacOS()).toBe(true);
		});

		it('returns false on win32', () => {
			Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
			expect(isMacOS()).toBe(false);
		});

		it('returns false on linux', () => {
			Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
			expect(isMacOS()).toBe(false);
		});
	});

	describe('isLinux', () => {
		it('returns true on linux', () => {
			Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
			expect(isLinux()).toBe(true);
		});

		it('returns false on darwin', () => {
			Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
			expect(isLinux()).toBe(false);
		});

		it('returns false on win32', () => {
			Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
			expect(isLinux()).toBe(false);
		});
	});

	describe('getWhichCommand', () => {
		it('returns "where" on Windows', () => {
			Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
			expect(getWhichCommand()).toBe('where');
		});

		it('returns "which" on macOS', () => {
			Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
			expect(getWhichCommand()).toBe('which');
		});

		it('returns "which" on Linux', () => {
			Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
			expect(getWhichCommand()).toBe('which');
		});
	});
});
