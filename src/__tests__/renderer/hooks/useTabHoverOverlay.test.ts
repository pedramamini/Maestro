import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabHoverOverlay } from '../../../renderer/hooks/tabs/useTabHoverOverlay';

describe('useTabHoverOverlay', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns correct initial state', () => {
		const { result } = renderHook(() => useTabHoverOverlay());
		expect(result.current.isHovered).toBe(false);
		expect(result.current.overlayOpen).toBe(false);
		expect(result.current.overlayPosition).toBe(null);
		expect(result.current.isOverOverlayRef.current).toBe(false);
	});

	it('sets isHovered on mouse enter', () => {
		const { result } = renderHook(() => useTabHoverOverlay());
		act(() => {
			result.current.handleMouseEnter();
		});
		expect(result.current.isHovered).toBe(true);
	});

	it('opens overlay after 400ms delay on mouse enter', () => {
		const { result } = renderHook(() => useTabHoverOverlay());

		// Mock getBoundingClientRect on the tabRef
		const mockElement = { getBoundingClientRect: () => ({ bottom: 100, left: 50, width: 120 }) };
		(result.current.tabRef as React.MutableRefObject<HTMLDivElement | null>).current =
			mockElement as unknown as HTMLDivElement;

		act(() => {
			result.current.handleMouseEnter();
		});
		expect(result.current.overlayOpen).toBe(false);

		act(() => {
			vi.advanceTimersByTime(400);
		});
		expect(result.current.overlayOpen).toBe(true);
		expect(result.current.overlayPosition).toEqual({ top: 100, left: 50, tabWidth: 120 });
	});

	it('clears hover and closes overlay on mouse leave', () => {
		const { result } = renderHook(() => useTabHoverOverlay());

		act(() => {
			result.current.handleMouseEnter();
		});
		expect(result.current.isHovered).toBe(true);

		act(() => {
			result.current.handleMouseLeave();
		});
		expect(result.current.isHovered).toBe(false);

		act(() => {
			vi.advanceTimersByTime(100);
		});
		expect(result.current.overlayOpen).toBe(false);
	});

	it('does NOT close overlay on mouse leave when mouse is over overlay', () => {
		const { result } = renderHook(() => useTabHoverOverlay());

		const mockElement = { getBoundingClientRect: () => ({ bottom: 100, left: 50, width: 120 }) };
		(result.current.tabRef as React.MutableRefObject<HTMLDivElement | null>).current =
			mockElement as unknown as HTMLDivElement;

		// Open the overlay
		act(() => {
			result.current.handleMouseEnter();
		});
		act(() => {
			vi.advanceTimersByTime(400);
		});
		expect(result.current.overlayOpen).toBe(true);

		// Mouse enters overlay
		act(() => {
			result.current.overlayMouseEnter();
		});

		// Mouse leaves tab
		act(() => {
			result.current.handleMouseLeave();
		});
		act(() => {
			vi.advanceTimersByTime(100);
		});

		// Overlay should stay open because mouse is over it
		expect(result.current.overlayOpen).toBe(true);
	});

	it('closes overlay when mouse leaves the overlay portal', () => {
		const { result } = renderHook(() => useTabHoverOverlay());

		const mockElement = { getBoundingClientRect: () => ({ bottom: 100, left: 50, width: 120 }) };
		(result.current.tabRef as React.MutableRefObject<HTMLDivElement | null>).current =
			mockElement as unknown as HTMLDivElement;

		// Open overlay
		act(() => {
			result.current.handleMouseEnter();
		});
		act(() => {
			vi.advanceTimersByTime(400);
		});
		expect(result.current.overlayOpen).toBe(true);

		// Mouse enters then leaves overlay
		act(() => {
			result.current.overlayMouseEnter();
		});
		act(() => {
			result.current.overlayMouseLeave();
		});

		expect(result.current.overlayOpen).toBe(false);
		expect(result.current.isHovered).toBe(false);
		expect(result.current.isOverOverlayRef.current).toBe(false);
	});

	it('respects shouldOpen guard — does not open when guard returns false', () => {
		const { result } = renderHook(() => useTabHoverOverlay({ shouldOpen: () => false }));

		const mockElement = { getBoundingClientRect: () => ({ bottom: 100, left: 50, width: 120 }) };
		(result.current.tabRef as React.MutableRefObject<HTMLDivElement | null>).current =
			mockElement as unknown as HTMLDivElement;

		act(() => {
			result.current.handleMouseEnter();
		});
		// isHovered should be set regardless
		expect(result.current.isHovered).toBe(true);

		act(() => {
			vi.advanceTimersByTime(400);
		});
		// But overlay should NOT open
		expect(result.current.overlayOpen).toBe(false);
	});

	it('opens when shouldOpen guard returns true', () => {
		const { result } = renderHook(() => useTabHoverOverlay({ shouldOpen: () => true }));

		const mockElement = { getBoundingClientRect: () => ({ bottom: 100, left: 50, width: 120 }) };
		(result.current.tabRef as React.MutableRefObject<HTMLDivElement | null>).current =
			mockElement as unknown as HTMLDivElement;

		act(() => {
			result.current.handleMouseEnter();
		});
		act(() => {
			vi.advanceTimersByTime(400);
		});
		expect(result.current.overlayOpen).toBe(true);
	});

	it('calls registerRef when setTabRef is invoked', () => {
		const registerRef = vi.fn();
		const { result } = renderHook(() => useTabHoverOverlay({ registerRef }));

		const mockEl = document.createElement('div');
		act(() => {
			result.current.setTabRef(mockEl);
		});

		expect(registerRef).toHaveBeenCalledWith(mockEl);
		expect(result.current.tabRef.current).toBe(mockEl);
	});

	it('calls registerRef with null on cleanup', () => {
		const registerRef = vi.fn();
		const { result } = renderHook(() => useTabHoverOverlay({ registerRef }));

		act(() => {
			result.current.setTabRef(null);
		});

		expect(registerRef).toHaveBeenCalledWith(null);
		expect(result.current.tabRef.current).toBe(null);
	});

	it('cancels pending timeout on rapid mouse leave', () => {
		const { result } = renderHook(() => useTabHoverOverlay());

		const mockElement = { getBoundingClientRect: () => ({ bottom: 100, left: 50, width: 120 }) };
		(result.current.tabRef as React.MutableRefObject<HTMLDivElement | null>).current =
			mockElement as unknown as HTMLDivElement;

		// Mouse enter (starts 400ms timer)
		act(() => {
			result.current.handleMouseEnter();
		});

		// Mouse leave before 400ms (should cancel the open timer)
		act(() => {
			vi.advanceTimersByTime(200);
		});
		act(() => {
			result.current.handleMouseLeave();
		});

		// Advance past original 400ms — overlay should NOT open
		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(result.current.overlayOpen).toBe(false);
	});

	it('overlayMouseEnter clears pending close timeout', () => {
		const { result } = renderHook(() => useTabHoverOverlay());

		const mockElement = { getBoundingClientRect: () => ({ bottom: 100, left: 50, width: 120 }) };
		(result.current.tabRef as React.MutableRefObject<HTMLDivElement | null>).current =
			mockElement as unknown as HTMLDivElement;

		// Open overlay
		act(() => {
			result.current.handleMouseEnter();
		});
		act(() => {
			vi.advanceTimersByTime(400);
		});
		expect(result.current.overlayOpen).toBe(true);

		// Mouse leaves tab (starts 100ms close timer)
		act(() => {
			result.current.handleMouseLeave();
		});

		// Mouse enters overlay before 100ms (should cancel close timer)
		act(() => {
			vi.advanceTimersByTime(50);
		});
		act(() => {
			result.current.overlayMouseEnter();
		});

		// Advance past 100ms — overlay should still be open
		act(() => {
			vi.advanceTimersByTime(100);
		});
		expect(result.current.overlayOpen).toBe(true);
	});
});
