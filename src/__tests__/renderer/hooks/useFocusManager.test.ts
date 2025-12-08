import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFocusManager, FocusArea, FocusState, FocusManagerAPI } from '../../../renderer/hooks/useFocusManager';
import { createRef } from 'react';

describe('useFocusManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('FocusArea type', () => {
    it('should accept valid focus areas', () => {
      const areas: FocusArea[] = ['sidebar', 'main', 'right', 'modal'];
      expect(areas).toHaveLength(4);
    });
  });

  describe('initial state', () => {
    it('should initialize with main area as default focus', () => {
      const { result } = renderHook(() => useFocusManager());

      expect(result.current.currentFocus).toEqual({ area: 'main' });
    });

    it('should initialize with a single item in focus stack', () => {
      const { result } = renderHook(() => useFocusManager());

      expect(result.current.focusStack).toHaveLength(1);
      expect(result.current.focusStack[0]).toEqual({ area: 'main' });
    });

    it('should return FocusManagerAPI interface', () => {
      const { result } = renderHook(() => useFocusManager());
      const api: FocusManagerAPI = result.current;

      expect(api.currentFocus).toBeDefined();
      expect(api.pushFocus).toBeInstanceOf(Function);
      expect(api.popFocus).toBeInstanceOf(Function);
      expect(api.focusStack).toBeInstanceOf(Array);
    });
  });

  describe('pushFocus', () => {
    it('should push a new focus state onto the stack', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'modal' });
      });

      expect(result.current.focusStack).toHaveLength(2);
      expect(result.current.currentFocus).toEqual({ area: 'modal' });
    });

    it('should push multiple focus states', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar' });
        result.current.pushFocus({ area: 'modal' });
        result.current.pushFocus({ area: 'right' });
      });

      expect(result.current.focusStack).toHaveLength(4);
      expect(result.current.currentFocus).toEqual({ area: 'right' });
    });

    it('should push focus state with ref', () => {
      const { result } = renderHook(() => useFocusManager());
      const ref = createRef<HTMLElement>();

      act(() => {
        result.current.pushFocus({ area: 'modal', ref });
      });

      expect(result.current.currentFocus.ref).toBe(ref);
    });

    it('should push focus state with fallback', () => {
      const { result } = renderHook(() => useFocusManager());
      const fallback = vi.fn();

      act(() => {
        result.current.pushFocus({ area: 'sidebar', fallback });
      });

      expect(result.current.currentFocus.fallback).toBe(fallback);
    });

    it('should push focus state with both ref and fallback', () => {
      const { result } = renderHook(() => useFocusManager());
      const ref = createRef<HTMLElement>();
      const fallback = vi.fn();

      act(() => {
        result.current.pushFocus({ area: 'modal', ref, fallback });
      });

      expect(result.current.currentFocus).toEqual({ area: 'modal', ref, fallback });
    });

    it('should maintain stack order (LIFO)', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar' });
        result.current.pushFocus({ area: 'modal' });
      });

      expect(result.current.focusStack[0]).toEqual({ area: 'main' });
      expect(result.current.focusStack[1]).toEqual({ area: 'sidebar' });
      expect(result.current.focusStack[2]).toEqual({ area: 'modal' });
    });
  });

  describe('popFocus', () => {
    it('should pop the top focus state', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'modal' });
      });
      act(() => {
        result.current.popFocus();
      });

      expect(result.current.focusStack).toHaveLength(1);
      expect(result.current.currentFocus).toEqual({ area: 'main' });
    });

    it('should not pop below single item in stack', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.popFocus();
      });

      expect(result.current.focusStack).toHaveLength(1);
      expect(result.current.currentFocus).toEqual({ area: 'main' });
    });

    it('should not pop multiple times below single item', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.popFocus();
        result.current.popFocus();
        result.current.popFocus();
      });

      expect(result.current.focusStack).toHaveLength(1);
    });

    it('should restore focus to previous state with ref', () => {
      const mockFocus = vi.fn();
      const mockElement = { focus: mockFocus } as unknown as HTMLElement;
      const ref = { current: mockElement };
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar', ref: ref as any });
        result.current.pushFocus({ area: 'modal' });
      });

      act(() => {
        result.current.popFocus();
      });

      // Focus is called in setTimeout
      act(() => {
        vi.runAllTimers();
      });

      expect(mockFocus).toHaveBeenCalledTimes(1);
    });

    it('should call fallback when ref is not available', () => {
      const fallback = vi.fn();
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar', fallback });
        result.current.pushFocus({ area: 'modal' });
      });

      act(() => {
        result.current.popFocus();
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should prefer ref over fallback when both available', () => {
      const mockFocus = vi.fn();
      const mockElement = { focus: mockFocus } as unknown as HTMLElement;
      const ref = { current: mockElement };
      const fallback = vi.fn();
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar', ref: ref as any, fallback });
        result.current.pushFocus({ area: 'modal' });
      });

      act(() => {
        result.current.popFocus();
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(mockFocus).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should call fallback when ref.current is null', () => {
      const ref = { current: null };
      const fallback = vi.fn();
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar', ref: ref as any, fallback });
        result.current.pushFocus({ area: 'modal' });
      });

      act(() => {
        result.current.popFocus();
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should not call anything when neither ref nor fallback available', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar' });
        result.current.pushFocus({ area: 'modal' });
      });

      act(() => {
        result.current.popFocus();
      });

      act(() => {
        vi.runAllTimers();
      });

      // No error thrown, just moves on
      expect(result.current.currentFocus).toEqual({ area: 'sidebar' });
    });

    it('should handle sequential pop operations correctly', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar' });
        result.current.pushFocus({ area: 'modal' });
        result.current.pushFocus({ area: 'right' });
      });

      expect(result.current.focusStack).toHaveLength(4);

      act(() => {
        result.current.popFocus();
      });
      expect(result.current.currentFocus).toEqual({ area: 'modal' });

      act(() => {
        result.current.popFocus();
      });
      expect(result.current.currentFocus).toEqual({ area: 'sidebar' });

      act(() => {
        result.current.popFocus();
      });
      expect(result.current.currentFocus).toEqual({ area: 'main' });
    });
  });

  describe('currentFocus', () => {
    it('should always return the top item of the stack', () => {
      const { result } = renderHook(() => useFocusManager());

      expect(result.current.currentFocus).toEqual({ area: 'main' });

      act(() => {
        result.current.pushFocus({ area: 'modal' });
      });

      expect(result.current.currentFocus).toEqual({ area: 'modal' });
    });

    it('should update when stack changes', () => {
      const { result } = renderHook(() => useFocusManager());

      const initialFocus = result.current.currentFocus;
      expect(initialFocus.area).toBe('main');

      act(() => {
        result.current.pushFocus({ area: 'sidebar' });
      });

      expect(result.current.currentFocus.area).toBe('sidebar');

      act(() => {
        result.current.popFocus();
      });

      expect(result.current.currentFocus.area).toBe('main');
    });
  });

  describe('focusStack', () => {
    it('should expose the full stack for debugging', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar' });
        result.current.pushFocus({ area: 'modal' });
      });

      expect(result.current.focusStack).toEqual([
        { area: 'main' },
        { area: 'sidebar' },
        { area: 'modal' },
      ]);
    });

    it('should be an array', () => {
      const { result } = renderHook(() => useFocusManager());
      expect(Array.isArray(result.current.focusStack)).toBe(true);
    });
  });

  describe('FocusState interface', () => {
    it('should allow minimal focus state', () => {
      const state: FocusState = { area: 'main' };
      expect(state.area).toBe('main');
      expect(state.ref).toBeUndefined();
      expect(state.fallback).toBeUndefined();
    });

    it('should allow focus state with ref', () => {
      const ref = createRef<HTMLElement>();
      const state: FocusState = { area: 'modal', ref };
      expect(state.ref).toBe(ref);
    });

    it('should allow focus state with fallback', () => {
      const fallback = () => {};
      const state: FocusState = { area: 'sidebar', fallback };
      expect(state.fallback).toBe(fallback);
    });

    it('should allow focus state with all properties', () => {
      const ref = createRef<HTMLElement>();
      const fallback = () => {};
      const state: FocusState = { area: 'right', ref, fallback };
      expect(state.area).toBe('right');
      expect(state.ref).toBe(ref);
      expect(state.fallback).toBe(fallback);
    });
  });

  describe('complex scenarios', () => {
    it('should handle push-pop-push sequence', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'modal' });
      });
      act(() => {
        result.current.popFocus();
      });
      act(() => {
        result.current.pushFocus({ area: 'sidebar' });
      });

      expect(result.current.focusStack).toHaveLength(2);
      expect(result.current.currentFocus).toEqual({ area: 'sidebar' });
    });

    it('should handle rapid pushes', () => {
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.pushFocus({ area: 'modal' });
        }
      });

      expect(result.current.focusStack).toHaveLength(101);
    });

    it('should handle alternating areas', () => {
      const { result } = renderHook(() => useFocusManager());
      const areas: FocusArea[] = ['sidebar', 'modal', 'right', 'sidebar', 'modal'];

      act(() => {
        areas.forEach((area) => {
          result.current.pushFocus({ area });
        });
      });

      expect(result.current.focusStack).toHaveLength(6);

      // Pop all the way back
      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.popFocus();
        }
      });

      expect(result.current.focusStack).toHaveLength(1);
      expect(result.current.currentFocus.area).toBe('main');
    });

    it('should handle multiple refs and fallbacks', () => {
      const mockFocus1 = vi.fn();
      const mockFocus2 = vi.fn();
      const fallback1 = vi.fn();
      const fallback2 = vi.fn();

      const ref1 = { current: { focus: mockFocus1 } as unknown as HTMLElement };
      const ref2 = { current: { focus: mockFocus2 } as unknown as HTMLElement };

      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar', ref: ref1 as any, fallback: fallback1 });
        result.current.pushFocus({ area: 'modal', ref: ref2 as any, fallback: fallback2 });
        result.current.pushFocus({ area: 'right' });
      });

      // Pop to modal (ref2)
      act(() => {
        result.current.popFocus();
      });
      act(() => {
        vi.runAllTimers();
      });

      expect(mockFocus2).toHaveBeenCalledTimes(1);
      expect(mockFocus1).not.toHaveBeenCalled();

      // Pop to sidebar (ref1)
      act(() => {
        result.current.popFocus();
      });
      act(() => {
        vi.runAllTimers();
      });

      expect(mockFocus1).toHaveBeenCalledTimes(1);
    });

    it('should handle hook re-renders correctly', () => {
      const { result, rerender } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'modal' });
      });

      rerender();

      expect(result.current.focusStack).toHaveLength(2);
      expect(result.current.currentFocus).toEqual({ area: 'modal' });
    });

    it('should maintain separate instances', () => {
      const { result: result1 } = renderHook(() => useFocusManager());
      const { result: result2 } = renderHook(() => useFocusManager());

      act(() => {
        result1.current.pushFocus({ area: 'modal' });
      });

      expect(result1.current.focusStack).toHaveLength(2);
      expect(result2.current.focusStack).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined ref.current gracefully', () => {
      const ref = { current: undefined } as any;
      const fallback = vi.fn();
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar', ref, fallback });
        result.current.pushFocus({ area: 'modal' });
      });

      act(() => {
        result.current.popFocus();
      });
      act(() => {
        vi.runAllTimers();
      });

      // Fallback should be called since ref.current is undefined
      expect(fallback).toHaveBeenCalled();
    });

    it('should handle focus throwing an error gracefully', () => {
      const mockFocus = vi.fn().mockImplementation(() => {
        throw new Error('Focus failed');
      });
      const mockElement = { focus: mockFocus } as unknown as HTMLElement;
      const ref = { current: mockElement };
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar', ref: ref as any });
        result.current.pushFocus({ area: 'modal' });
      });

      // The setTimeout will catch the error
      expect(() => {
        act(() => {
          result.current.popFocus();
        });
        act(() => {
          vi.runAllTimers();
        });
      }).toThrow('Focus failed');
    });

    it('should handle fallback throwing an error', () => {
      const fallback = vi.fn().mockImplementation(() => {
        throw new Error('Fallback failed');
      });
      const { result } = renderHook(() => useFocusManager());

      act(() => {
        result.current.pushFocus({ area: 'sidebar', fallback });
        result.current.pushFocus({ area: 'modal' });
      });

      expect(() => {
        act(() => {
          result.current.popFocus();
        });
        act(() => {
          vi.runAllTimers();
        });
      }).toThrow('Fallback failed');
    });
  });
});
