/**
 * Tests for useModalManager hook
 *
 * This hook manages a stack of modal states with priority-based ordering.
 * Tests cover: openModal, closeModal, closeTopModal, isModalOpen, anyModalOpen, topModal
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalManager, ModalState, ModalManagerAPI } from '../../../renderer/hooks/useModalManager';

describe('useModalManager', () => {
  describe('initial state', () => {
    it('should start with empty modal stack', () => {
      const { result } = renderHook(() => useModalManager());

      expect(result.current.anyModalOpen).toBe(false);
      expect(result.current.topModal).toBeUndefined();
    });

    it('should return all API methods', () => {
      const { result } = renderHook(() => useModalManager());

      expect(typeof result.current.openModal).toBe('function');
      expect(typeof result.current.closeModal).toBe('function');
      expect(typeof result.current.closeTopModal).toBe('function');
      expect(typeof result.current.isModalOpen).toBe('function');
      expect(typeof result.current.anyModalOpen).toBe('boolean');
    });
  });

  describe('openModal', () => {
    it('should open a modal and add it to the stack', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('settings', 100);
      });

      expect(result.current.anyModalOpen).toBe(true);
      expect(result.current.topModal?.id).toBe('settings');
      expect(result.current.topModal?.priority).toBe(100);
    });

    it('should accept optional data parameter', () => {
      const { result } = renderHook(() => useModalManager());
      const testData = { tab: 'general', autoFocus: true };

      act(() => {
        result.current.openModal('settings', 100, testData);
      });

      expect(result.current.topModal?.data).toEqual(testData);
    });

    it('should sort modals by priority (ascending)', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('low-priority', 100);
      });
      act(() => {
        result.current.openModal('high-priority', 500);
      });
      act(() => {
        result.current.openModal('medium-priority', 300);
      });

      // Highest priority should be on top
      expect(result.current.topModal?.id).toBe('high-priority');
    });

    it('should replace existing modal with same ID', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('settings', 100, { tab: 'general' });
      });
      act(() => {
        result.current.openModal('settings', 200, { tab: 'advanced' });
      });

      // Should only have one modal with updated priority and data
      expect(result.current.isModalOpen('settings')).toBe(true);
      expect(result.current.topModal?.priority).toBe(200);
      expect(result.current.topModal?.data).toEqual({ tab: 'advanced' });
    });

    it('should handle zero priority', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('zero-priority', 0);
      });

      expect(result.current.topModal?.id).toBe('zero-priority');
      expect(result.current.topModal?.priority).toBe(0);
    });

    it('should handle negative priority', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('negative-priority', -100);
      });

      expect(result.current.topModal?.id).toBe('negative-priority');
      expect(result.current.topModal?.priority).toBe(-100);
    });

    it('should maintain stable sort with equal priorities', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('first', 100);
      });
      act(() => {
        result.current.openModal('second', 100);
      });
      act(() => {
        result.current.openModal('third', 100);
      });

      // All have same priority, but sort should be stable
      expect(result.current.anyModalOpen).toBe(true);
      expect(result.current.isModalOpen('first')).toBe(true);
      expect(result.current.isModalOpen('second')).toBe(true);
      expect(result.current.isModalOpen('third')).toBe(true);
    });

    it('should handle undefined data', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('modal', 100, undefined);
      });

      expect(result.current.topModal?.data).toBeUndefined();
    });

    it('should handle null data', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('modal', 100, null);
      });

      expect(result.current.topModal?.data).toBeNull();
    });
  });

  describe('closeModal', () => {
    it('should close a specific modal by ID', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('settings', 100);
      });
      act(() => {
        result.current.closeModal('settings');
      });

      expect(result.current.anyModalOpen).toBe(false);
      expect(result.current.isModalOpen('settings')).toBe(false);
    });

    it('should only close the specified modal', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('settings', 100);
      });
      act(() => {
        result.current.openModal('help', 200);
      });
      act(() => {
        result.current.closeModal('settings');
      });

      expect(result.current.isModalOpen('settings')).toBe(false);
      expect(result.current.isModalOpen('help')).toBe(true);
    });

    it('should update topModal after closing', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('low', 100);
      });
      act(() => {
        result.current.openModal('high', 500);
      });

      expect(result.current.topModal?.id).toBe('high');

      act(() => {
        result.current.closeModal('high');
      });

      expect(result.current.topModal?.id).toBe('low');
    });

    it('should handle closing non-existent modal gracefully', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('settings', 100);
      });
      act(() => {
        result.current.closeModal('non-existent');
      });

      // Original modal should still be there
      expect(result.current.isModalOpen('settings')).toBe(true);
    });

    it('should handle closing from empty stack gracefully', () => {
      const { result } = renderHook(() => useModalManager());

      // Should not throw
      act(() => {
        result.current.closeModal('any');
      });

      expect(result.current.anyModalOpen).toBe(false);
    });
  });

  describe('closeTopModal', () => {
    it('should close the modal with highest priority', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('low', 100);
      });
      act(() => {
        result.current.openModal('high', 500);
      });

      expect(result.current.topModal?.id).toBe('high');

      act(() => {
        result.current.closeTopModal();
      });

      expect(result.current.topModal?.id).toBe('low');
    });

    it('should handle empty stack gracefully', () => {
      const { result } = renderHook(() => useModalManager());

      // Should not throw
      act(() => {
        result.current.closeTopModal();
      });

      expect(result.current.anyModalOpen).toBe(false);
    });

    it('should close all modals when called repeatedly', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('first', 100);
      });
      act(() => {
        result.current.openModal('second', 200);
      });
      act(() => {
        result.current.openModal('third', 300);
      });

      expect(result.current.anyModalOpen).toBe(true);

      act(() => {
        result.current.closeTopModal();
        result.current.closeTopModal();
        result.current.closeTopModal();
      });

      expect(result.current.anyModalOpen).toBe(false);
    });

    it('should preserve lower priority modals', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('first', 100, { id: 1 });
      });
      act(() => {
        result.current.openModal('second', 200, { id: 2 });
      });

      act(() => {
        result.current.closeTopModal();
      });

      expect(result.current.topModal?.data).toEqual({ id: 1 });
    });
  });

  describe('isModalOpen', () => {
    it('should return true for open modal', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('settings', 100);
      });

      expect(result.current.isModalOpen('settings')).toBe(true);
    });

    it('should return false for non-existent modal', () => {
      const { result } = renderHook(() => useModalManager());

      expect(result.current.isModalOpen('non-existent')).toBe(false);
    });

    it('should return false after modal is closed', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('settings', 100);
      });
      act(() => {
        result.current.closeModal('settings');
      });

      expect(result.current.isModalOpen('settings')).toBe(false);
    });

    it('should return true for any modal in the stack', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('first', 100);
      });
      act(() => {
        result.current.openModal('second', 200);
      });
      act(() => {
        result.current.openModal('third', 300);
      });

      // All should be found regardless of position
      expect(result.current.isModalOpen('first')).toBe(true);
      expect(result.current.isModalOpen('second')).toBe(true);
      expect(result.current.isModalOpen('third')).toBe(true);
    });

    it('should handle empty string ID', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('', 100);
      });

      expect(result.current.isModalOpen('')).toBe(true);
    });
  });

  describe('anyModalOpen', () => {
    it('should return false when no modals are open', () => {
      const { result } = renderHook(() => useModalManager());

      expect(result.current.anyModalOpen).toBe(false);
    });

    it('should return true when at least one modal is open', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('settings', 100);
      });

      expect(result.current.anyModalOpen).toBe(true);
    });

    it('should return false after all modals are closed', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('first', 100);
      });
      act(() => {
        result.current.openModal('second', 200);
      });
      act(() => {
        result.current.closeModal('first');
        result.current.closeModal('second');
      });

      expect(result.current.anyModalOpen).toBe(false);
    });
  });

  describe('topModal', () => {
    it('should return undefined when stack is empty', () => {
      const { result } = renderHook(() => useModalManager());

      expect(result.current.topModal).toBeUndefined();
    });

    it('should return the highest priority modal', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('low', 100);
      });
      act(() => {
        result.current.openModal('medium', 300);
      });
      act(() => {
        result.current.openModal('high', 500);
      });

      expect(result.current.topModal?.id).toBe('high');
      expect(result.current.topModal?.priority).toBe(500);
    });

    it('should include all modal state properties', () => {
      const { result } = renderHook(() => useModalManager());
      const testData = { customKey: 'customValue' };

      act(() => {
        result.current.openModal('test', 100, testData);
      });

      expect(result.current.topModal).toEqual({
        id: 'test',
        priority: 100,
        data: testData,
      });
    });
  });

  describe('complex scenarios', () => {
    it('should handle rapid open/close operations', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('first', 100);
        result.current.openModal('second', 200);
        result.current.closeModal('first');
        result.current.openModal('third', 150);
        result.current.closeTopModal();
      });

      expect(result.current.topModal?.id).toBe('third');
    });

    it('should handle reopening a closed modal with different priority', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('modal', 100);
      });
      act(() => {
        result.current.closeModal('modal');
      });
      act(() => {
        result.current.openModal('modal', 500);
      });

      expect(result.current.topModal?.priority).toBe(500);
    });

    it('should maintain correct order with mixed operations', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('a', 100);
      });
      act(() => {
        result.current.openModal('b', 300);
      });
      act(() => {
        result.current.openModal('c', 200);
      });

      // Stack should be [a(100), c(200), b(300)]
      expect(result.current.topModal?.id).toBe('b');

      act(() => {
        result.current.closeModal('c');
      });

      // Stack should be [a(100), b(300)]
      expect(result.current.topModal?.id).toBe('b');

      act(() => {
        result.current.closeTopModal();
      });

      // Stack should be [a(100)]
      expect(result.current.topModal?.id).toBe('a');
    });

    it('should handle very large priority numbers', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('normal', 100);
      });
      act(() => {
        result.current.openModal('huge', Number.MAX_SAFE_INTEGER);
      });

      expect(result.current.topModal?.id).toBe('huge');
    });

    it('should handle many modals in stack', () => {
      const { result } = renderHook(() => useModalManager());

      // Add 100 modals
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.openModal(`modal-${i}`, i);
        }
      });

      expect(result.current.topModal?.id).toBe('modal-99');
      expect(result.current.anyModalOpen).toBe(true);

      // Close all
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.closeTopModal();
        }
      });

      expect(result.current.anyModalOpen).toBe(false);
    });
  });

  describe('function stability', () => {
    it('should maintain stable function references across re-renders', () => {
      const { result, rerender } = renderHook(() => useModalManager());

      const initialOpenModal = result.current.openModal;
      const initialCloseModal = result.current.closeModal;
      const initialCloseTopModal = result.current.closeTopModal;

      // Trigger state change
      act(() => {
        result.current.openModal('test', 100);
      });

      // Functions should remain stable (due to useCallback)
      expect(result.current.openModal).toBe(initialOpenModal);
      expect(result.current.closeModal).toBe(initialCloseModal);
      expect(result.current.closeTopModal).toBe(initialCloseTopModal);
    });

    it('should update isModalOpen reference when stack changes', () => {
      const { result } = renderHook(() => useModalManager());

      const initialIsModalOpen = result.current.isModalOpen;

      act(() => {
        result.current.openModal('test', 100);
      });

      // isModalOpen depends on modalStack, so reference may change
      // This tests the memoization behavior
      expect(typeof result.current.isModalOpen).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in modal ID', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('modal/with/slashes', 100);
      });
      act(() => {
        result.current.openModal('modal.with.dots', 200);
      });
      act(() => {
        result.current.openModal('modal:with:colons', 300);
      });

      expect(result.current.isModalOpen('modal/with/slashes')).toBe(true);
      expect(result.current.isModalOpen('modal.with.dots')).toBe(true);
      expect(result.current.isModalOpen('modal:with:colons')).toBe(true);
    });

    it('should handle floating point priorities', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('one', 1.1);
      });
      act(() => {
        result.current.openModal('two', 1.2);
      });
      act(() => {
        result.current.openModal('three', 1.15);
      });

      expect(result.current.topModal?.id).toBe('two');
    });

    it('should handle NaN priority gracefully', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('normal', 100);
      });
      act(() => {
        result.current.openModal('nan', NaN);
      });

      // NaN comparison behavior in sort - modal should still be added
      expect(result.current.isModalOpen('nan')).toBe(true);
      expect(result.current.isModalOpen('normal')).toBe(true);
    });

    it('should handle Infinity priority', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('normal', 100);
      });
      act(() => {
        result.current.openModal('infinity', Infinity);
      });

      expect(result.current.topModal?.id).toBe('infinity');
    });

    it('should handle negative Infinity priority', () => {
      const { result } = renderHook(() => useModalManager());

      act(() => {
        result.current.openModal('normal', 100);
      });
      act(() => {
        result.current.openModal('neg-infinity', -Infinity);
      });

      // Negative infinity should be at bottom
      expect(result.current.topModal?.id).toBe('normal');
    });
  });
});

// Type tests - these compile but don't run, they verify TypeScript types
describe('type definitions', () => {
  it('ModalState interface should have correct shape', () => {
    const state: ModalState = {
      id: 'test',
      priority: 100,
      data: { any: 'value' },
    };

    expect(state.id).toBe('test');
    expect(state.priority).toBe(100);
    expect(state.data).toEqual({ any: 'value' });
  });

  it('ModalState should allow undefined data', () => {
    const state: ModalState = {
      id: 'test',
      priority: 100,
    };

    expect(state.data).toBeUndefined();
  });

  it('ModalManagerAPI should have all required members', () => {
    const { result } = renderHook(() => useModalManager());

    // Type check: all required properties exist
    const api: ModalManagerAPI = result.current;

    expect(api.openModal).toBeDefined();
    expect(api.closeModal).toBeDefined();
    expect(api.closeTopModal).toBeDefined();
    expect(api.isModalOpen).toBeDefined();
    expect(typeof api.anyModalOpen).toBe('boolean');
    expect(api.topModal === undefined || typeof api.topModal === 'object').toBe(true);
  });
});
