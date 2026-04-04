import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCopyToClipboard } from '../../../renderer/hooks/mainPanel/useCopyToClipboard';

vi.mock('../../../renderer/utils/clipboard', () => ({
	safeClipboardWrite: vi.fn(),
}));

import { safeClipboardWrite } from '../../../renderer/utils/clipboard';
const mockClipboardWrite = vi.mocked(safeClipboardWrite);

describe('useCopyToClipboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts with null notification', () => {
		const { result } = renderHook(() => useCopyToClipboard());
		expect(result.current.copyNotification).toBeNull();
	});

	it('sets default notification on successful copy', async () => {
		mockClipboardWrite.mockResolvedValue(true);

		const { result } = renderHook(() => useCopyToClipboard());

		await act(async () => {
			await result.current.copyToClipboard('text to copy');
		});

		expect(mockClipboardWrite).toHaveBeenCalledWith('text to copy');
		expect(result.current.copyNotification).toBe('Copied to Clipboard');
	});

	it('sets custom notification message', async () => {
		mockClipboardWrite.mockResolvedValue(true);

		const { result } = renderHook(() => useCopyToClipboard());

		await act(async () => {
			await result.current.copyToClipboard('branch-name', '"branch-name" copied');
		});

		expect(result.current.copyNotification).toBe('"branch-name" copied');
	});

	it('clears notification after 2 seconds', async () => {
		mockClipboardWrite.mockResolvedValue(true);

		const { result } = renderHook(() => useCopyToClipboard());

		await act(async () => {
			await result.current.copyToClipboard('text');
		});

		expect(result.current.copyNotification).toBe('Copied to Clipboard');

		act(() => {
			vi.advanceTimersByTime(2000);
		});

		expect(result.current.copyNotification).toBeNull();
	});

	it('does not set notification on failed copy', async () => {
		mockClipboardWrite.mockResolvedValue(false);

		const { result } = renderHook(() => useCopyToClipboard());

		await act(async () => {
			await result.current.copyToClipboard('text');
		});

		expect(result.current.copyNotification).toBeNull();
	});

	it('provides stable copyToClipboard function', () => {
		const { result, rerender } = renderHook(() => useCopyToClipboard());
		const fn1 = result.current.copyToClipboard;
		rerender();
		const fn2 = result.current.copyToClipboard;
		expect(fn1).toBe(fn2);
	});
});
